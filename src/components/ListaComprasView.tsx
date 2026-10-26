import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  ShoppingBag, 
  Search, 
  Printer, 
  FileSpreadsheet, 
  FileText, 
  Save, 
  Plus, 
  Trash2, 
  RotateCcw, 
  Copy, 
  Lock, 
  CheckCircle2, 
  Calendar, 
  ArrowLeft, 
  Package, 
  Layers, 
  History, 
  Info, 
  Filter,
  Check,
  X
} from 'lucide-react';
import * as XLSX from 'xlsx';
import type { Usuario, Produto, CentroCusto } from '../types/index.ts';
import { AutocompleteSelect, type AutocompleteOption } from './AutocompleteSelect.tsx';
import { useToast } from '../context/ToastContext.tsx';

interface ListaComprasViewProps {
  produtos: Produto[];
  currentUser: Usuario | null;
  onVoltar: () => void;
  onNavigate?: (tab: string) => void;
}

interface ItemReposicao {
  produto_id: number;
  produto_codigo: string;
  produto_nome: string;
  unidade_medida: string;
  grupo_nome?: string;
  saldo_atual: number;
  saidas_periodo: number;
  quantidade_sugerida: number;
  quantidade_repor: number;
}

interface ListaSalva {
  id: number;
  numero_documento: string;
  area_sigla: string;
  data_inicio: string;
  data_fim: string;
  status: 'RASCUNHO' | 'FECHADA';
  observacao?: string;
  usuario_id: number;
  usuario_nome: string;
  criado_em: string;
  total_itens?: number;
  total_repor?: number;
}

export const ListaComprasView: React.FC<ListaComprasViewProps> = ({
  produtos = [],
  currentUser,
  onVoltar,
}) => {
  const { toast } = useToast();

  const get30DaysAgo = () => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  };

  const getToday = () => new Date().toISOString().slice(0, 10);

  // Aba ativa: 'gerar' ou 'historico'
  const [activeTab, setActiveTab] = useState<'gerar' | 'historico'>('gerar');

  // Filtros de Geração
  const [dataInicio, setDataInicio] = useState<string>(get30DaysAgo());
  const [dataFim, setDataFim] = useState<string>(getToday());
  const [selectedGrupoId, setSelectedGrupoId] = useState<string>('');
  const [selectedProdutoId, setSelectedProdutoId] = useState<string>('');
  const [somenteSugeridos, setSomenteSugeridos] = useState<boolean>(true);
  const [showFilters, setShowFilters] = useState<boolean>(false);

  // Checkboxes de Tipos de Saída Considerados
  const [typesConsidered, setTypesConsidered] = useState<{ [key: string]: boolean }>({
    'Atendimento de Requisição': true,
    'Consumo Direto': true,
    'Avaria / Perda': true,
    'Saída por Vencimento/Descarte': true,
  });

  // Lista Atual em Edição
  const [currentListaId, setCurrentListaId] = useState<number | null>(null);
  const [currentNumeroDoc, setCurrentNumeroDoc] = useState<string | null>(null);
  const [currentStatus, setCurrentStatus] = useState<'RASCUNHO' | 'FECHADA'>('RASCUNHO');
  const [observacao, setObservacao] = useState<string>('');
  const [itens, setItens] = useState<ItemReposicao[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // Grupos de Produtos
  const [grupos, setGrupos] = useState<Array<{ id: number; codigo: string; nome: string }>>([]);

  // Histórico de Listas Salvas
  const [historicoListas, setHistoricoListas] = useState<ListaSalva[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState<boolean>(false);

  // Carrega grupos de produtos
  useEffect(() => {
    const token = sessionStorage.getItem('multi_almox_token') || localStorage.getItem('multi_almox_token');
    const areaSigla = sessionStorage.getItem('multi_almox_area_sigla') || localStorage.getItem('multi_almox_area_sigla') || currentUser?.area_sigla || 'ALM';
    fetch('/api/grupos-produtos', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Area-Sigla': areaSigla,
      },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setGrupos(data))
      .catch(() => {});
  }, [currentUser?.area_sigla]);

  const grupoOptions: AutocompleteOption[] = useMemo(() => [
    { value: '', label: 'Todos os Grupos' },
    ...grupos.map((g) => ({
      value: String(g.id),
      label: `${g.codigo ? `${g.codigo} - ` : ''}${g.nome}`,
    })),
  ], [grupos]);

  const produtoOptions: AutocompleteOption[] = useMemo(() => [
    { value: '', label: 'Todos os Produtos (Catálogo Geral)' },
    ...produtos.map((p) => ({
      value: String(p.id),
      label: `${p.codigo} - ${p.nome}`,
      secondaryLabel: `${p.unidade_medida} · Saldo Atual: ${p.quantidade_atual}`,
      keywords: `${p.codigo} ${p.nome} ${p.unidade_medida}`,
    })),
  ], [produtos]);

  // Buscar Histórico de Listas
  const loadHistorico = useCallback(async () => {
    setLoadingHistorico(true);
    try {
      const token = sessionStorage.getItem('multi_almox_token') || localStorage.getItem('multi_almox_token');
      const areaSigla = sessionStorage.getItem('multi_almox_area_sigla') || localStorage.getItem('multi_almox_area_sigla') || currentUser?.area_sigla || 'ALM';

      const res = await fetch('/api/lista-compras', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Area-Sigla': areaSigla,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setHistoricoListas(data);
      }
    } catch {
      toast.error('Erro de Conexão', 'Não foi possível buscar histórico de listas.');
    } finally {
      setLoadingHistorico(false);
    }
  }, [currentUser?.area_sigla, toast]);

  useEffect(() => {
    if (activeTab === 'historico') {
      loadHistorico();
    }
  }, [activeTab, loadHistorico]);

  // Função para Gerar / Calcular Lista a partir dos Movimentos
  const handleGerarLista = async () => {
    setLoading(true);
    try {
      const token = sessionStorage.getItem('multi_almox_token') || localStorage.getItem('multi_almox_token');
      const areaSigla = sessionStorage.getItem('multi_almox_area_sigla') || localStorage.getItem('multi_almox_area_sigla') || currentUser?.area_sigla || 'ALM';

      const selectedTypesStr = Object.keys(typesConsidered)
        .filter((k) => typesConsidered[k])
        .join(',');

      const queryParams = new URLSearchParams({
        data_inicio: dataInicio,
        data_fim: dataFim,
        somente_sugeridos: String(somenteSugeridos),
        tipos_saida: selectedTypesStr,
      });

      if (selectedGrupoId) queryParams.append('grupo_id', selectedGrupoId);
      if (selectedProdutoId) queryParams.append('produto_id', selectedProdutoId);

      const res = await fetch(`/api/lista-compras/calcular?${queryParams.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Area-Sigla': areaSigla,
        },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao calcular lista de reposição.');
      }

      setCurrentListaId(null);
      setCurrentNumeroDoc(null);
      setCurrentStatus('RASCUNHO');
      setObservacao('');
      setItens(data.itens || []);

      toast.success(
        'Lista Gerada',
        `Processados ${data.total_itens} item(ns) com base nas saídas do período.`
      );
    } catch (err: any) {
      toast.error('Erro de Cálculo', err.message || 'Falha ao calcular lista.');
    } finally {
      setLoading(false);
    }
  };

  // Salvar Lista (Rascunho ou Fechada)
  const handleSalvarLista = async (statusFinal: 'RASCUNHO' | 'FECHADA') => {
    if (itens.length === 0) {
      toast.error('Lista Vazia', 'A lista deve conter ao menos um produto para salvar.');
      return;
    }

    setLoading(true);
    try {
      const token = sessionStorage.getItem('multi_almox_token') || localStorage.getItem('multi_almox_token');
      const areaSigla = sessionStorage.getItem('multi_almox_area_sigla') || localStorage.getItem('multi_almox_area_sigla') || currentUser?.area_sigla || 'ALM';

      const payload = {
        data_inicio: dataInicio,
        data_fim: dataFim,
        grupo_id: selectedGrupoId ? Number(selectedGrupoId) : null,
        observacao,
        status: statusFinal,
        itens: itens.map((i) => ({
          produto_id: i.produto_id,
          produto_codigo: i.produto_codigo,
          produto_nome: i.produto_nome,
          unidade_medida: i.unidade_medida,
          saldo_atual: i.saldo_atual,
          saidas_periodo: i.saidas_periodo,
          quantidade_sugerida: i.quantidade_sugerida,
          quantidade_repor: i.quantidade_repor,
        })),
      };

      const url = currentListaId ? `/api/lista-compras/${currentListaId}` : '/api/lista-compras';
      const method = currentListaId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-Area-Sigla': areaSigla,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao salvar lista.');
      }

      setCurrentListaId(data.id || currentListaId);
      setCurrentNumeroDoc(data.numero_documento || currentNumeroDoc);
      setCurrentStatus(statusFinal);

      toast.success(
        statusFinal === 'FECHADA' ? 'Lista Fechada' : 'Lista Salva',
        data.message || 'A lista de reposição foi gravada no banco da área.'
      );
    } catch (err: any) {
      toast.error('Erro ao Salvar', err.message || 'Não foi possível gravar a lista.');
    } finally {
      setLoading(false);
    }
  };

  // Abrir Lista do Histórico
  const handleAbrirLista = async (id: number) => {
    setLoading(true);
    try {
      const token = sessionStorage.getItem('multi_almox_token') || localStorage.getItem('multi_almox_token');
      const areaSigla = sessionStorage.getItem('multi_almox_area_sigla') || localStorage.getItem('multi_almox_area_sigla') || currentUser?.area_sigla || 'ALM';

      const res = await fetch(`/api/lista-compras/${id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Area-Sigla': areaSigla,
        },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao abrir lista.');
      }

      setCurrentListaId(data.lista.id);
      setCurrentNumeroDoc(data.lista.numero_documento);
      setCurrentStatus(data.lista.status);
      setObservacao(data.lista.observacao || '');
      setDataInicio(data.lista.data_inicio);
      setDataFim(data.lista.data_fim);
      setItens(data.itens || []);

      setActiveTab('gerar');
      toast.info('Lista Carregada', `Exibindo documento ${data.lista.numero_documento}.`);
    } catch (err: any) {
      toast.error('Erro', err.message || 'Falha ao carregar lista.');
    } finally {
      setLoading(false);
    }
  };

  // Duplicar Lista
  const handleDuplicarLista = async (id: number) => {
    setLoading(true);
    try {
      const token = sessionStorage.getItem('multi_almox_token') || localStorage.getItem('multi_almox_token');
      const areaSigla = sessionStorage.getItem('multi_almox_area_sigla') || localStorage.getItem('multi_almox_area_sigla') || currentUser?.area_sigla || 'ALM';

      const res = await fetch(`/api/lista-compras/${id}/duplicar`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Area-Sigla': areaSigla,
        },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao duplicar lista.');
      }

      toast.success('Lista Duplicada', `Nova cópia criada (${data.numero_documento}).`);
      handleAbrirLista(data.id);
    } catch (err: any) {
      toast.error('Erro ao Duplicar', err.message || 'Não foi possível duplicar a lista.');
    } finally {
      setLoading(false);
    }
  };

  // Excluir Lista Rascunho
  const handleExcluirLista = async (id: number) => {
    if (!confirm('Deseja realmente excluir esta lista em rascunho?')) return;

    try {
      const token = sessionStorage.getItem('multi_almox_token') || localStorage.getItem('multi_almox_token');
      const areaSigla = sessionStorage.getItem('multi_almox_area_sigla') || localStorage.getItem('multi_almox_area_sigla') || currentUser?.area_sigla || 'ALM';

      const res = await fetch(`/api/lista-compras/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Area-Sigla': areaSigla,
        },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao excluir lista.');
      }

      toast.success('Lista Excluída', data.message || 'Registro em rascunho removido.');
      loadHistorico();
      if (currentListaId === id) {
        setCurrentListaId(null);
        setCurrentNumeroDoc(null);
        setItens([]);
      }
    } catch (err: any) {
      toast.error('Erro ao Excluir', err.message || 'Falha ao excluir lista.');
    }
  };

  // Atualizar Quantidade a Repor de um item
  const handleUpdateQtdRepor = (index: number, val: number) => {
    if (currentStatus === 'FECHADA') return;
    const newItens = [...itens];
    newItens[index].quantidade_repor = Math.max(0, val || 0);
    setItens(newItens);
  };

  // Remover linha da lista
  const handleRemoveItem = (index: number) => {
    if (currentStatus === 'FECHADA') return;
    const newItens = itens.filter((_, idx) => idx !== index);
    setItens(newItens);
  };

  // Imprimir Relatório
  const handlePrint = () => {
    window.print();
  };

  // Exportar para CSV
  const handleExportCSV = () => {
    if (itens.length === 0) return;

    const areaSigla = currentUser?.area_sigla || 'ALM';
    const lines = [
      `RELATÓRIO DE SUGESTÃO DE REPOSIÇÃO (LISTA DE COMPRAS)`,
      `Área Operacional:;${areaSigla}`,
      `Documento:;${currentNumeroDoc || 'NOVA LISTA'}`,
      `Período Analisado:;${dataInicio} até ${dataFim}`,
      `Status:;${currentStatus}`,
      `Emissão:;${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
      `Responsável:;${currentUser?.nome || 'Operador'}`,
      `Aviso:;ESTE RELATÓRIO É APENAS UM GUIA PARA REPOSIÇÃO. A COMPRA É FEITA FORA DO SISTEMA.`,
      ``,
      `Código;Descrição Completa do Produto;UND;Saldo Atual;Saídas no Período;Qtd Sugerida;Quantidade a Repor`
    ];

    itens.forEach((i) => {
      lines.push(
        `"${i.produto_codigo}";"${i.produto_nome}";"${i.unidade_medida}";${i.saldo_atual};${i.saidas_periodo};${i.quantidade_sugerida};${i.quantidade_repor}`
      );
    });

    const csvContent = '\uFEFF' + lines.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `lista_reposicao_${areaSigla}_${getToday()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Exportar para XLSX
  const handleExportXLSX = () => {
    if (itens.length === 0) return;

    const areaSigla = currentUser?.area_sigla || 'ALM';
    const dataRows = itens.map((i) => ({
      'Código': i.produto_codigo,
      'Descrição Completa do Produto': i.produto_nome,
      'UND': i.unidade_medida,
      'Saldo Atual': i.saldo_atual,
      'Saídas no Período': i.saidas_periodo,
      'Qtd Sugerida': i.quantidade_sugerida,
      'Quantidade a Repor': i.quantidade_repor,
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Lista de Reposição');

    XLSX.writeFile(workbook, `lista_reposicao_${areaSigla}_${getToday()}.xlsx`);
  };

  const totalReporGeral = itens.reduce((acc, i) => acc + Number(i.quantidade_repor || 0), 0);

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Cabeçalho Superior da Tela */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs print:hidden">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onVoltar}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            title="Voltar"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="p-2.5 bg-[#00237D]/10 text-[#00237D] rounded-xl border border-[#00237D]/20">
            <ShoppingBag className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900">Lista de Compras / Reposição de Estoque</h1>
              {currentNumeroDoc && (
                <span className="px-2 py-0.5 rounded text-[11px] font-extrabold bg-blue-100 text-[#00237D] border border-blue-200">
                  {currentNumeroDoc}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Relatório gerencial para cálculo automatizado da estimativa de reposição do almoxarifado
            </p>
          </div>
        </div>

        {/* Abas e Ações */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            type="button"
            onClick={() => setActiveTab('gerar')}
            className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
              activeTab === 'gerar'
                ? 'bg-[#00237D] text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Nova / Editar Lista
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('historico')}
            className={`px-3.5 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'historico'
                ? 'bg-[#00237D] text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Histórico Salvo</span>
          </button>
        </div>
      </div>

      {/* AVISO IMPORTANTE: O SISTEMA NÃO REALIZA COMPRAS EXTERNAS */}
      <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-300/60 flex items-start gap-3 text-amber-900 text-xs print:hidden">
        <Info className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
        <div className="leading-relaxed">
          <strong>Aviso de Diretriz do Sistema:</strong> A Lista de Compras é um relatório de estimativa gerencial que substitui o cálculo manual de reposição. O sistema <u>NÃO executa pedidos de compra</u> nem possui integração com fornecedores externos. A aquisição de materiais é realizada fora do sistema.
        </div>
      </div>

      {/* CONTEÚDO DA ABA 1: GERAR / EDITAR LISTA */}
      {activeTab === 'gerar' && (
        <div className="space-y-6">
          {/* Painel de Filtros e Parâmetros */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4 print:hidden">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-[#00237D]" />
                <span>Parâmetros para Cálculo da Sugestão</span>
              </span>
              <button
                type="button"
                onClick={() => setShowFilters((prev) => !prev)}
                className="text-xs text-[#00237D] hover:underline font-semibold cursor-pointer"
              >
                {showFilters ? 'Ocultar Opções Avançadas' : 'Exibir Opções Avançadas'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Data Início Analisada *
                </label>
                <input
                  type="date"
                  value={dataInicio}
                  onChange={(e) => setDataInicio(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:bg-white focus:border-[#00237D]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Data Fim Analisada *
                </label>
                <input
                  type="date"
                  value={dataFim}
                  onChange={(e) => setDataFim(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:bg-white focus:border-[#00237D]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Grupo de Produto (Opcional)
                </label>
                <AutocompleteSelect
                  options={grupoOptions}
                  value={selectedGrupoId}
                  onChange={(val) => setSelectedGrupoId(val ? String(val) : '')}
                  placeholder="Todos os Grupos"
                  emptyCatalogMessage="Nenhum grupo cadastrado."
                  allowClear
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Produto (Opcional)
                </label>
                <AutocompleteSelect
                  options={produtoOptions}
                  value={selectedProdutoId}
                  onChange={(val) => setSelectedProdutoId(val ? String(val) : '')}
                  placeholder="Todos os Produtos"
                  emptyCatalogMessage="Nenhum produto cadastrado nesta área."
                  allowClear
                />
              </div>

              <div>
                <button
                  type="button"
                  onClick={handleGerarLista}
                  disabled={loading}
                  className="w-full py-2.5 px-4 bg-[#00237D] hover:bg-[#001858] disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer min-h-[42px]"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>GERAR SUGESTÃO</span>
                </button>
              </div>
            </div>

            {/* Opções Avançadas e Filtros por Tipo de Saída */}
            {showFilters && (
              <div className="pt-4 border-t border-slate-100 space-y-3 animate-fadeIn">
                <div className="text-xs font-semibold text-slate-700">
                  Tipos de Saída Considerados no Cálculo do Consumo:
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-slate-600">
                  {Object.keys(typesConsidered).map((typeKey) => (
                    <label key={typeKey} className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={typesConsidered[typeKey]}
                        onChange={(e) =>
                          setTypesConsidered((prev) => ({ ...prev, [typeKey]: e.target.checked }))
                        }
                        className="rounded text-[#00237D] focus:ring-[#00237D]"
                      />
                      <span>{typeKey}</span>
                    </label>
                  ))}
                </div>

                <div className="pt-2 flex flex-wrap items-center gap-4 border-t border-slate-100 text-xs">
                  <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-800 select-none">
                    <input
                      type="checkbox"
                      checked={somenteSugeridos}
                      onChange={(e) => setSomenteSugeridos(e.target.checked)}
                      className="rounded text-[#00237D] focus:ring-[#00237D]"
                    />
                    <span>Somente listar produtos com sugestão de reposição &gt; 0</span>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* DOCUMENTO PRINCIPAL / TABELA DE REPOSIÇÃO */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6 print:shadow-none print:border-none print:p-0">
            {/* Cabeçalho da Impressão e Identificação */}
            <div className="border-b border-slate-200 pb-4 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-white p-1 border border-slate-200 flex items-center justify-center shrink-0">
                  <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-slate-900 uppercase tracking-tight">
                    RELATÓRIO DE ESTIMATIVA E SUGESTÃO DE REPOSIÇÃO
                  </h2>
                  <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                    <span>Área: <strong>{currentUser?.area_sigla || 'ALM'}</strong></span>
                    <span>·</span>
                    <span>Documento: <strong>{currentNumeroDoc || 'Não Salvo (Prévia)'}</strong></span>
                    <span>·</span>
                    <span>Período: {dataInicio.split('-').reverse().join('/')} a {dataFim.split('-').reverse().join('/')}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 print:hidden">
                <button
                  type="button"
                  onClick={handleExportCSV}
                  disabled={itens.length === 0}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>CSV</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportXLSX}
                  disabled={itens.length === 0}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Excel (.xlsx)</span>
                </button>

                <button
                  type="button"
                  onClick={handlePrint}
                  disabled={itens.length === 0}
                  className="px-3 py-1.5 bg-[#00237D] hover:bg-[#001858] text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Imprimir</span>
                </button>
              </div>
            </div>

            {/* Status da Lista */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-semibold">Situação do Registro:</span>
                {currentStatus === 'FECHADA' ? (
                  <span className="px-2.5 py-1 rounded-md text-xs font-extrabold uppercase bg-emerald-100 text-emerald-900 border border-emerald-200 flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    <span>FECHADA (SOMENTE LEITURA)</span>
                  </span>
                ) : (
                  <span className="px-2.5 py-1 rounded-md text-xs font-extrabold uppercase bg-amber-100 text-amber-900 border border-amber-200">
                    RASCUNHO (EDITÁVEL)
                  </span>
                )}
              </div>

              <div className="text-xs text-slate-600 font-bold">
                Total de Itens: <span className="text-slate-900">{itens.length}</span> | Quantidade Total a Repor: <span className="text-[#00237D]">{totalReporGeral}</span>
              </div>
            </div>

            {/* Tabela dos Itens */}
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100/90 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-2.5 px-3">Código</th>
                    <th className="py-2.5 px-3 min-w-[240px]">Descrição Completa do Produto</th>
                    <th className="py-2.5 px-3 text-center">UND</th>
                    <th className="py-2.5 px-3 text-right">Saldo Atual</th>
                    <th className="py-2.5 px-3 text-right">Saídas no Período</th>
                    <th className="py-2.5 px-3 text-right text-slate-500">Qtd Sugerida</th>
                    <th className="py-2.5 px-3 text-right text-[#00237D] font-extrabold">
                      Quantidade a Repor *
                    </th>
                    {currentStatus !== 'FECHADA' && (
                      <th className="py-2.5 px-3 text-center print:hidden">Ação</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-800">
                  {itens.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400 italic">
                        Nenhum produto listado para reposição no período selecionado. Clique em &quot;GERAR SUGESTÃO DE REPOSIÇÃO&quot; para calcular.
                      </td>
                    </tr>
                  ) : (
                    itens.map((it, index) => (
                      <tr key={it.produto_id || index} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                          {it.produto_codigo}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-900 break-words whitespace-normal max-w-md">
                          {it.produto_nome}
                          {it.grupo_nome && (
                            <span className="text-[10px] text-slate-400 block font-normal mt-0.5">
                              Grupo: {it.grupo_nome}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-slate-600">
                          {it.unidade_medida}
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold text-slate-800">
                          {it.saldo_atual}
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold text-rose-700">
                          {it.saidas_periodo}
                        </td>
                        <td className="py-2.5 px-3 text-right font-medium text-slate-400">
                          {it.quantidade_sugerida}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {currentStatus === 'FECHADA' ? (
                            <span className="font-extrabold text-[#00237D] text-sm">
                              {it.quantidade_repor}
                            </span>
                          ) : (
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={it.quantidade_repor}
                              onChange={(e) => handleUpdateQtdRepor(index, parseFloat(e.target.value))}
                              className="w-24 px-2 py-1 bg-blue-50/80 border border-[#00237D]/30 rounded-lg text-right font-extrabold text-sm text-[#00237D] focus:outline-none focus:bg-white focus:border-[#00237D]"
                            />
                          )}
                        </td>
                        {currentStatus !== 'FECHADA' && (
                          <td className="py-2.5 px-3 text-center print:hidden">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(index)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="Remover linha da lista"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Observação / Notas do Almoxarife */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 block">
                Observações Gerenciais do Relatório
              </label>
              {currentStatus === 'FECHADA' ? (
                <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200 italic">
                  {observacao || 'Sem observações registradas.'}
                </p>
              ) : (
                <textarea
                  rows={2}
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Instruções ou apontamentos sobre a reposição..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-[#00237D]"
                />
              )}
            </div>

            {/* Botões de Ação para Salvar Lista */}
            {currentStatus !== 'FECHADA' && itens.length > 0 && (
              <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-end gap-3 print:hidden">
                <button
                  type="button"
                  onClick={() => handleSalvarLista('RASCUNHO')}
                  disabled={loading}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition-all shadow-2xs flex items-center gap-2 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>SALVAR COMO RASCUNHO</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSalvarLista('FECHADA')}
                  disabled={loading}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all shadow-2xs flex items-center gap-2 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>SALVAR E FECHAR LISTA</span>
                </button>
              </div>
            )}

            {/* Rodapé Único e Obrigatório de Auditoria/Documento */}
            <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-400 gap-2">
              <div>
                AlmoxControl Multiárea — Relatório Gerencial de Reposição
              </div>
              <div className="font-semibold text-slate-600">
                Desenvolvido por Bruno Rocha - DPO
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CONTEÚDO DA ABA 2: HISTÓRICO DE LISTAS SALVAS */}
      {activeTab === 'historico' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
              <History className="w-4 h-4 text-[#00237D]" />
              <span>Histórico de Listas de Reposição Salvas ({currentUser?.area_sigla || 'ALM'})</span>
            </h2>
            <button
              type="button"
              onClick={loadHistorico}
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              title="Atualizar histórico"
            >
              <RotateCcw className={`w-4 h-4 ${loadingHistorico ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100/90 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-2.5 px-3">Documento</th>
                  <th className="py-2.5 px-3">Data/Hora</th>
                  <th className="py-2.5 px-3">Período Analisado</th>
                  <th className="py-2.5 px-3">Usuário</th>
                  <th className="py-2.5 px-3 text-center">Itens</th>
                  <th className="py-2.5 px-3 text-right">Qtd Repor</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-800">
                {historicoListas.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400 italic">
                      Nenhuma lista de reposição gravada para a área {currentUser?.area_sigla || 'ALM'}.
                    </td>
                  </tr>
                ) : (
                  historicoListas.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-[#00237D]">
                        {l.numero_documento}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 font-medium">
                        {new Date(l.criado_em).toLocaleString('pt-BR')}
                      </td>
                      <td className="py-2.5 px-3 font-medium">
                        {l.data_inicio.split('-').reverse().join('/')} a {l.data_fim.split('-').reverse().join('/')}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-700">
                        {l.usuario_nome}
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold">
                        {l.total_itens || 0}
                      </td>
                      <td className="py-2.5 px-3 text-right font-black text-[#00237D]">
                        {l.total_repor || 0}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {l.status === 'FECHADA' ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                            FECHADA
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-amber-100 text-amber-800 border border-amber-200">
                            RASCUNHO
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleAbrirLista(l.id)}
                            className="px-2.5 py-1 bg-[#00237D] hover:bg-[#001858] text-white text-[11px] font-semibold rounded-md transition-colors cursor-pointer"
                            title="Abrir detalhes"
                          >
                            Abrir
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDuplicarLista(l.id)}
                            className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors cursor-pointer"
                            title="Duplicar lista"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>

                          {l.status === 'RASCUNHO' && (
                            <button
                              type="button"
                              onClick={() => handleExcluirLista(l.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                              title="Excluir rascunho"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
