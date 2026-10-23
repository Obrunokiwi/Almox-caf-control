import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Boxes,
  ClipboardCheck,
  Plus,
  Search,
  ArrowLeft,
  RotateCcw,
  Save,
  CheckCircle2,
  Calendar,
  Clock,
  Building2,
  Trash2,
  Eye,
  Edit2,
  PlusCircle,
  FileText,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  TrendingUp,
  TrendingDown,
  Equal,
  Sparkles,
  Lock,
  Brush
} from 'lucide-react';
import type {
  Usuario,
  EmpresaUnidade,
  CentroCusto,
  Produto,
  InventarioEstoque,
  ItemInventario,
  GrupoProduto
} from '../types/index.ts';
import { useToast } from '../context/ToastContext.tsx';
import { CentroCustoAlertBanner } from './CentroCustoAlertBanner.tsx';
import { SearchableSelect, type SearchableOption } from './SearchableSelect.tsx';

interface InventarioViewProps {
  currentUser: Usuario;
  activeUnidade?: EmpresaUnidade | null;
  centrosCusto: CentroCusto[];
  produtos: Produto[];
  onRefresh?: () => void;
  onVoltar?: () => void;
  onNavigate?: (tab: string) => void;
}

export const InventarioView: React.FC<InventarioViewProps> = ({
  currentUser,
  activeUnidade,
  centrosCusto,
  produtos,
  onRefresh,
  onVoltar,
  onNavigate,
}) => {
  const { toast } = useToast();

  // Modo da tela: 'consulta' (lista) | 'cadastro' (formulário de contagem)
  const [viewMode, setViewMode] = useState<'consulta' | 'cadastro'>('consulta');
  const [formMode, setFormMode] = useState<'create' | 'edit' | 'view'>('create');

  // =========================================================================
  // 1. ESTADOS DA TELA DE CONSULTA
  // =========================================================================
  const [inventarios, setInventarios] = useState<InventarioEstoque[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Filtros da Consulta
  const [filtroCodigo, setFiltroCodigo] = useState('');
  const [filtroDataInicio, setFiltroDataInicio] = useState('');
  const [filtroDataFim, setFiltroDataFim] = useState('');
  const [filtroFinalizado, setFiltroFinalizado] = useState<'TODOS' | 'SIM' | 'NAO'>('TODOS');
  const [filtroCentroCustoId, setFiltroCentroCustoId] = useState<string>('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filtroCodigo.trim()) count++;
    if (filtroDataInicio.trim()) count++;
    if (filtroDataFim.trim()) count++;
    if (filtroFinalizado !== 'TODOS') count++;
    if (filtroCentroCustoId !== '') count++;
    return count;
  }, [filtroCodigo, filtroDataInicio, filtroDataFim, filtroFinalizado, filtroCentroCustoId]);

  const handleLimparFiltros = () => {
    setFiltroCodigo('');
    setFiltroDataInicio('');
    setFiltroDataFim('');
    setFiltroFinalizado('TODOS');
    setFiltroCentroCustoId('');
    setCurrentPage(1);
    carregarInventarios();
  };

  // Paginação da Consulta
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // =========================================================================
  // 2. ESTADOS DA TELA DE CADASTRO / EDIÇÃO
  // =========================================================================
  const [activeTab, setActiveTab] = useState<'dados_principais' | 'itens'>('dados_principais');
  const [editingInvId, setEditingInvId] = useState<number | null>(null);

  // Campos do Cabeçalho
  const [formCodigo, setFormCodigo] = useState('');
  const [formData, setFormData] = useState('');
  const [formHora, setFormHora] = useState('');
  const [formEmpresaId, setFormEmpresaId] = useState<number>(1);
  const [formEmpresaNome, setFormEmpresaNome] = useState('');
  const [formCentroCustoId, setFormCentroCustoId] = useState<number | ''>('');
  const [formZeraPorLote, setFormZeraPorLote] = useState(false);
  const [formZeraNaoListados, setFormZeraNaoListados] = useState(false);
  const [formObservacao, setFormObservacao] = useState('');
  const [formFinalizado, setFormFinalizado] = useState<number>(0);

  // Grade de Itens
  const [grupos, setGrupos] = useState<GrupoProduto[]>([]);
  const [formItens, setFormItens] = useState<ItemInventario[]>([]);
  const [rawContagens, setRawContagens] = useState<Record<string, string>>({});
  const [filtroItensBusca, setFiltroItensBusca] = useState('');
  const [filtroItensGrupo, setFiltroItensGrupo] = useState<string>('todos');
  const [filtroItensDiferenca, setFiltroItensDiferenca] = useState<'todos' | 'com_diferenca' | 'entradas' | 'saidas' | 'iguais'>('todos');

  // Chave estável única por item na contagem
  const getItemKey = (it: ItemInventario) =>
    `${it.produto_id}-${it.lote_id || 'sem_lote'}-${it.numero_lote || ''}`;

  // Carrega lista oficial de grupos de produtos para filtragem no inventário
  useEffect(() => {
    fetch('/api/grupos-produtos')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setGrupos(data);
      })
      .catch(() => {});
  }, []);

  // Modal para Adição Manual de Produto/Lote
  const [isAddManualModalOpen, setIsAddManualModalOpen] = useState(false);
  const [manualProdutoId, setManualProdutoId] = useState<number | ''>('');
  const [manualNumeroLote, setManualNumeroLote] = useState('');
  const [manualDataValidade, setManualDataValidade] = useState('');
  const [manualQuantidadeFisica, setManualQuantidadeFisica] = useState<number | ''>(0);

  // Modal de Confirmação para Salvar e Fechar
  const [isConfirmFecharModalOpen, setIsConfirmFecharModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Carrega listagem de inventários do servidor
  const carregarInventarios = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtroCodigo) params.append('codigo', filtroCodigo);
      if (filtroDataInicio) params.append('data_inicio', filtroDataInicio);
      if (filtroDataFim) params.append('data_fim', filtroDataFim);
      if (filtroFinalizado !== 'TODOS') params.append('finalizado', filtroFinalizado);
      if (filtroCentroCustoId) params.append('centro_custo_id', filtroCentroCustoId);

      const res = await fetch(`/api/inventarios?${params.toString()}`, {
        headers: { 'Authorization': `user:${currentUser.id}` }
      });
      if (res.ok) {
        const data = await res.json();
        setInventarios(data);
      } else {
        toast.error('Erro', 'Não foi possível carregar os inventários.');
      }
    } catch {
      toast.error('Falha de Rede', 'Erro de conexão com o servidor.');
    } finally {
      setIsLoading(false);
    }
  }, [filtroCodigo, filtroDataInicio, filtroDataFim, filtroFinalizado, filtroCentroCustoId, currentUser.id, toast]);

  useEffect(() => {
    carregarInventarios();
  }, [carregarInventarios]);

  // Paginação dos resultados
  const totalPages = Math.ceil(inventarios.length / pageSize) || 1;
  const paginatedInventarios = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return inventarios.slice(start, start + pageSize);
  }, [inventarios, currentPage, pageSize]);

  // Carrega sugestão de código e pré-carrega itens base ao criar novo inventário
  const handleNovoInventario = async () => {
    setViewMode('cadastro');
    setFormMode('create');
    setEditingInvId(null);
    setActiveTab('dados_principais');

    const hoje = new Date();
    const dataStr = hoje.toISOString().slice(0, 10);
    const horaStr = hoje.toTimeString().slice(0, 8);

    setFormData(dataStr);
    setFormHora(horaStr);
    setFormEmpresaId(activeUnidade?.id || currentUser.empresa_id || 1);
    setFormEmpresaNome(activeUnidade ? `${activeUnidade.codigo} - ${activeUnidade.nome}` : '001 - Almoxarifado Central');

    // Seleciona o primeiro Centro de Custo disponível ou o do usuário
    const defaultCc = currentUser.centro_custo_id || centrosCusto[0]?.id || '';
    setFormCentroCustoId(defaultCc);

    setFormZeraPorLote(false);
    setFormZeraNaoListados(false);
    setFormObservacao('');
    setFormFinalizado(0);

    // Obtém sugestão de código do backend
    try {
      const codRes = await fetch('/api/inventarios/sugestao-codigo', {
        headers: { 'Authorization': `user:${currentUser.id}` }
      });
      if (codRes.ok) {
        const codData = await codRes.json();
        setFormCodigo(codData.codigo);
      } else {
        setFormCodigo(`INV-${hoje.getFullYear()}-0001`);
      }
    } catch {
      setFormCodigo(`INV-${hoje.getFullYear()}-0001`);
    }

    // Carrega itens base de produtos e lotes
    try {
      const itemsRes = await fetch('/api/inventarios/itens-base', {
        headers: { 'Authorization': `user:${currentUser.id}` }
      });
      if (itemsRes.ok) {
        const itemsData = await itemsRes.json();
        setFormItens(itemsData);
      } else {
        setFormItens([]);
      }
    } catch {
      setFormItens([]);
    }
  };

  // Abre inventário existente para visualização ou edição
  const handleAbrirInventario = async (inv: InventarioEstoque) => {
    setViewMode('cadastro');
    setEditingInvId(inv.id);
    setFormMode(inv.finalizado === 1 ? 'view' : 'edit');
    setActiveTab('dados_principais');

    setFormCodigo(inv.codigo);
    setFormData(inv.data);
    setFormHora(inv.hora);
    setFormEmpresaId(inv.empresa_id || 1);
    setFormEmpresaNome(inv.empresa_codigo && inv.empresa_nome ? `${inv.empresa_codigo} - ${inv.empresa_nome}` : '001 - Almoxarifado Central');
    setFormCentroCustoId(inv.centro_custo_id);
    setFormZeraPorLote(inv.zera_por_lote === 1);
    setFormZeraNaoListados(inv.zera_nao_listados === 1);
    setFormObservacao(inv.observacao || '');
    setFormFinalizado(inv.finalizado);

    try {
      const res = await fetch(`/api/inventarios/${inv.id}`, {
        headers: { 'Authorization': `user:${currentUser.id}` }
      });
      if (res.ok) {
        const data = await res.json();
        setFormItens(data.itens || []);
      }
    } catch {
      toast.error('Erro', 'Não foi possível carregar os itens deste inventário.');
    }
  };

  // Atualização direta da contagem física digitada (suporta inteiros e decimais com vírgula ou ponto)
  const handleUpdateContagemFisica = (key: string, valorDigitado: string) => {
    if (formFinalizado === 1) return; // Somente leitura se finalizado

    setRawContagens((prev) => ({
      ...prev,
      [key]: valorDigitado,
    }));

    // Normaliza vírgula para ponto e converte para número
    const normalized = valorDigitado.replace(',', '.').trim();
    const valorNum = normalized === '' ? 0 : parseFloat(normalized);
    const qtdFisica = isNaN(valorNum) ? 0 : Math.max(0, valorNum);

    setFormItens((prev) =>
      prev.map((item) => {
        if (getItemKey(item) === key) {
          const qtdSistema = item.quantidade_sistema;
          return {
            ...item,
            quantidade_fisica: qtdFisica,
            diferenca: qtdFisica - qtdSistema,
          };
        }
        return item;
      })
    );
  };

  // Botão "LIMPAR" da tela de cadastro: redefine todas as contagens para o saldo atual do sistema
  const handleLimparContagens = () => {
    if (formFinalizado === 1) return;
    setRawContagens({});
    setFormItens((prev) =>
      prev.map((it) => ({
        ...it,
        quantidade_fisica: it.quantidade_sistema,
        diferenca: 0,
      }))
    );
    toast.info('Contagens Reiniciadas', 'As contagens físicas foram restauradas para os saldos atuais do sistema.');
  };

  // Adição manual de produto/lote
  const handleSalvarItemManual = () => {
    if (!manualProdutoId) {
      toast.warning('Atenção', 'Selecione um produto para adicionar à contagem.');
      return;
    }

    const prod = produtos.find((p) => p.id === Number(manualProdutoId));
    if (!prod) return;

    const qtdFis = typeof manualQuantidadeFisica === 'number' ? manualQuantidadeFisica : 0;
    const novoItem: ItemInventario = {
      produto_id: prod.id,
      produto_codigo: prod.codigo,
      produto_nome: prod.nome,
      unidade_medida: prod.unidade_medida,
      produto_tipo: prod.tipo,
      lote_id: null,
      numero_lote: manualNumeroLote ? manualNumeroLote.trim().toUpperCase() : 'LOTE-AVULSO',
      data_validade: manualDataValidade ? manualDataValidade.slice(0, 10) : null,
      quantidade_sistema: 0, // Item encontrado que não constava no saldo
      quantidade_fisica: qtdFis,
      diferenca: qtdFis, // Diferença é exatamente a quantidade física encontrada
    };

    setFormItens((prev) => [novoItem, ...prev]);
    setIsAddManualModalOpen(false);
    setManualProdutoId('');
    setManualNumeroLote('');
    setManualDataValidade('');
    setManualQuantidadeFisica(0);
    toast.success('Item Adicionado', `O item ${prod.codigo} - ${prod.nome} foi incluído na grade de recontagem.`);
  };

  // Remover item manual da contagem (apenas itens não finalizados)
  const handleRemoverItem = (index: number) => {
    if (formFinalizado === 1) return;
    setFormItens((prev) => prev.filter((_, i) => i !== index));
    toast.info('Item Removido', 'Item removido da grade deste inventário.');
  };

  // Salvar Rascunho ("SALVAR") ou Concluir ("SALVAR E FECHAR")
  const handleSalvarInventario = async (fechar: boolean) => {
    if (!formCentroCustoId) {
      toast.warning('Validação', 'Por favor, selecione o Centro de Custo para o inventário.');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        codigo: formCodigo,
        data: formData,
        hora: formHora,
        empresa_id: formEmpresaId,
        centro_custo_id: Number(formCentroCustoId),
        zera_por_lote: formZeraPorLote ? 1 : 0,
        zera_nao_listados: formZeraNaoListados ? 1 : 0,
        observacao: formObservacao,
        finalizar: fechar,
        itens: formItens.map((it) => ({
          produto_id: it.produto_id,
          lote_id: it.lote_id || null,
          numero_lote: it.numero_lote || null,
          data_validade: it.data_validade || null,
          quantidade_sistema: it.quantidade_sistema,
          quantidade_fisica: it.quantidade_fisica,
          diferenca: it.quantidade_fisica - it.quantidade_sistema,
        })),
      };

      const url = editingInvId ? `/api/inventarios/${editingInvId}` : '/api/inventarios';
      const method = editingInvId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `user:${currentUser.id}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok) {
        if (fechar) {
          toast.success('Inventário Finalizado', 'Ajustes diretos de estoque e lotes foram aplicados atomicamente.');
          setViewMode('consulta');
        } else {
          toast.success('Rascunho Salvo', 'Dados do inventário e contagens gravados com sucesso.');
          if (!editingInvId && data.id) {
            setEditingInvId(data.id);
            setFormMode('edit');
          }
        }
        carregarInventarios();
        if (onRefresh) onRefresh();
      } else {
        toast.error('Erro ao Salvar', data.error || 'Ocorreu um erro ao salvar o inventário.');
      }
    } catch {
      toast.error('Falha de Rede', 'Não foi possível salvar o inventário no servidor.');
    } finally {
      setIsSaving(false);
      setIsConfirmFecharModalOpen(false);
    }
  };

  // Exclusão de Inventário em Rascunho
  const handleExcluirRascunho = async (id: number) => {
    if (!confirm('Deseja realmente excluir este rascunho de inventário?')) return;
    try {
      const res = await fetch(`/api/inventarios/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `user:${currentUser.id}` },
      });
      if (res.ok) {
        toast.success('Excluído', 'Inventário em rascunho excluído com sucesso.');
        carregarInventarios();
      } else {
        const d = await res.json();
        toast.error('Erro', d.error || 'Não foi possível excluir o inventário.');
      }
    } catch {
      toast.error('Erro de Rede', 'Falha na comunicação com o servidor.');
    }
  };

  // Cálculos de Resumo da Grade de Itens
  const resumoItens = useMemo(() => {
    let entradas = 0;
    let saidas = 0;
    let iguais = 0;
    let totalDiferencas = 0;

    for (const it of formItens) {
      const dif = it.quantidade_fisica - it.quantidade_sistema;
      if (dif > 0) {
        entradas++;
        totalDiferencas++;
      } else if (dif < 0) {
        saidas++;
        totalDiferencas++;
      } else {
        iguais++;
      }
    }

    return { total: formItens.length, entradas, saidas, iguais, totalDiferencas };
  }, [formItens]);

  const filtroFinalizadoOptions: SearchableOption[] = [
    { value: 'TODOS', label: 'TODOS' },
    { value: 'SIM', label: 'SIM (Concluído)' },
    { value: 'NAO', label: 'NÃO (Em Aberto)' },
  ];

  const filtroCentroCustoOptions: SearchableOption[] = useMemo(() => [
    { value: '', label: 'TODOS OS CENTROS DE CUSTO' },
    ...centrosCusto.map((cc) => ({
      value: String(cc.id),
      label: `${cc.codigo} - ${cc.nome}`,
    })),
  ], [centrosCusto]);

  const formCentroCustoOptions: SearchableOption[] = useMemo(() => [
    { value: '', label: 'Selecione o Centro de Custo...' },
    ...centrosCusto.map((cc) => ({
      value: cc.id,
      label: `${cc.codigo} - ${cc.nome} (${cc.departamento})`,
    })),
  ], [centrosCusto]);

  const filtroItensGrupoOptions: SearchableOption[] = useMemo(() => [
    { value: 'todos', label: `Todos os Grupos (${resumoItens.total})` },
    ...grupos.map((g) => ({
      value: String(g.id),
      label: g.nome,
    })),
  ], [grupos, resumoItens.total]);

  const filtroItensDiferencaOptions: SearchableOption[] = useMemo(() => [
    { value: 'todos', label: `Todos os Status (${resumoItens.total})` },
    { value: 'com_diferenca', label: `Com Divergência (${resumoItens.totalDiferencas})` },
    { value: 'entradas', label: `Entradas (+) (${resumoItens.entradas})` },
    { value: 'saidas', label: `Saídas (-) (${resumoItens.saidas})` },
    { value: 'iguais', label: `Sem Divergência (${resumoItens.iguais})` },
  ], [resumoItens]);

  const manualProdutoOptions: SearchableOption[] = useMemo(() => [
    { value: '', label: 'Selecione o produto...' },
    ...produtos.map((p) => ({
      value: p.id,
      label: `${p.codigo} - ${p.nome} (${p.unidade_medida})`,
    })),
  ], [produtos]);

  // Itens filtrados para exibição na grade
  const itensFiltrados = useMemo(() => {
    return formItens.filter((it) => {
      // Filtro de Grupo de Produto
      if (filtroItensGrupo !== 'todos') {
        if (String(it.grupo_id || '') !== String(filtroItensGrupo)) {
          return false;
        }
      }

      // Filtro de texto
      if (filtroItensBusca) {
        const term = filtroItensBusca.toLowerCase();
        const cod = (it.produto_codigo || '').toLowerCase();
        const nome = (it.produto_nome || '').toLowerCase();
        const lote = (it.numero_lote || '').toLowerCase();
        if (!cod.includes(term) && !nome.includes(term) && !lote.includes(term)) {
          return false;
        }
      }

      // Filtro de diferença
      const dif = it.quantidade_fisica - it.quantidade_sistema;
      if (filtroItensDiferenca === 'com_diferenca' && dif === 0) return false;
      if (filtroItensDiferenca === 'entradas' && dif <= 0) return false;
      if (filtroItensDiferenca === 'saidas' && dif >= 0) return false;
      if (filtroItensDiferenca === 'iguais' && dif !== 0) return false;

      return true;
    });
  }, [formItens, filtroItensBusca, filtroItensDiferenca, filtroItensGrupo]);

  // =========================================================================
  // RENDERIZAÇÃO: 1. TELA DE CONSULTA DE INVENTÁRIO DO ESTOQUE
  // =========================================================================
  if (viewMode === 'consulta') {
    return (
      <div className="flex flex-col min-h-full space-y-5">
        {/* Cabeçalho da Visão */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-teal-50 border border-teal-200 text-teal-700">
              <Boxes className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
                Consulta de Inventário do Estoque
              </h1>
              <p className="text-xs text-slate-500">
                Auditoria, recontagem física e ajuste direto de saldos com integridade por Centro de Custo e Lote
              </p>
            </div>
          </div>

          {onVoltar && (
            <button
              type="button"
              onClick={onVoltar}
              className="border border-slate-300 text-slate-600 hover:bg-slate-50 font-medium px-3.5 py-1.5 rounded text-xs flex items-center gap-1.5 transition-all self-start md:self-auto cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>VOLTAR AO PAINEL</span>
            </button>
          )}
        </div>

        {/* Alerta de Centro de Custo Vazio */}
        {currentUser?.perfil === 'admin' && centrosCusto.filter((cc) => cc.ativo === 1).length === 0 && (
          <CentroCustoAlertBanner
            isAdmin={currentUser?.perfil === 'admin'}
            onCadastrarCentroCusto={() => onNavigate?.('centros-custo')}
            mensagemPersonalizada="Cadastre ao menos um Centro de Custo para começar a auditar inventários de estoque."
          />
        )}

      {/* Top Action Bar: + NOVO e 🔍 FILTROS */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-teal-50 text-teal-800 rounded-lg">
            <Boxes className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-800">Inventário do Estoque</h2>
            <p className="text-[11px] text-slate-500">Contagem física, auditoria e ajustes de saldo</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border ${
              activeFiltersCount > 0
                ? 'bg-teal-50 border-teal-300 text-teal-800 shadow-2xs'
                : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Search className="w-4 h-4 text-teal-600" />
            <span>FILTROS</span>
            {activeFiltersCount > 0 && (
              <span className="ml-1 bg-teal-600 text-white rounded-full px-1.5 py-0.2 text-[10px] font-bold">
                {activeFiltersCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={handleNovoInventario}
            className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-medium px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 transition-all shadow-sm uppercase tracking-wide cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ NOVO</span>
          </button>
        </div>
      </div>

      {/* Painel de Filtros Retrátil (Colapsável) */}
      {isFilterOpen && (
        <div className="bg-white p-4 rounded-xl border border-teal-200 shadow-md space-y-4 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Painel de Pesquisa e Filtros</span>
            <button
              type="button"
              onClick={() => setIsFilterOpen(false)}
              className="text-slate-400 hover:text-slate-600 text-xs font-semibold cursor-pointer"
            >
              ✕ Fechar
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
            {/* Filtro: Código */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                Código
              </label>
              <input
                type="text"
                value={filtroCodigo}
                onChange={(e) => {
                  setFiltroCodigo(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="ex: INV-2026-0001"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded text-xs text-slate-800 font-mono focus:bg-white focus:border-teal-500 shadow-inner"
              />
            </div>

            {/* Filtro: Data Inicial */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                Data Inicial
              </label>
              <input
                type="date"
                value={filtroDataInicio}
                onChange={(e) => {
                  setFiltroDataInicio(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded text-xs text-slate-800 focus:bg-white focus:border-teal-500 shadow-inner"
              />
            </div>

            {/* Filtro: Data Final */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                Data Final
              </label>
              <input
                type="date"
                value={filtroDataFim}
                onChange={(e) => {
                  setFiltroDataFim(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded text-xs text-slate-800 focus:bg-white focus:border-teal-500 shadow-inner"
              />
            </div>

            {/* Filtro: Finalizado */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                Finalizado
              </label>
              <SearchableSelect
                options={filtroFinalizadoOptions}
                value={filtroFinalizado}
                onChange={(val) => {
                  setFiltroFinalizado(val as any);
                  setCurrentPage(1);
                }}
                placeholder="Filtrar status..."
              />
            </div>

            {/* Filtro: Centro de Custo */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                Centro de Custo
              </label>
              <SearchableSelect
                options={filtroCentroCustoOptions}
                value={filtroCentroCustoId}
                onChange={(val) => {
                  setFiltroCentroCustoId(val ? String(val) : '');
                  setCurrentPage(1);
                }}
                placeholder="Todos os Centros de Custo..."
                allowClear
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={handleLimparFiltros}
              className="py-1.5 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-300 flex items-center gap-1.5 cursor-pointer uppercase tracking-wider"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>LIMPAR FILTROS</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setCurrentPage(1);
                carregarInventarios();
              }}
              className="py-1.5 px-4 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer uppercase tracking-wider shadow-sm"
            >
              <Search className="w-3.5 h-3.5" />
              <span>APLICAR / PESQUISAR</span>
            </button>

            <button
              type="button"
              onClick={() => setIsFilterOpen(false)}
              className="py-1.5 px-4 rounded-lg bg-slate-700 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer uppercase tracking-wider shadow-sm"
            >
              <span>FECHAR</span>
            </button>
          </div>
        </div>
      )}

        {/* Tabela de Resultados Zebrada */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col flex-1">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Código</th>
                  <th className="py-2.5 px-3 text-center">Registrado</th>
                  <th className="py-2.5 px-3">Cód. Empresa</th>
                  <th className="py-2.5 px-3">Centro de Custo</th>
                  <th className="py-2.5 px-3">Data</th>
                  <th className="py-2.5 px-3 text-center">Finalizado</th>
                  <th className="py-2.5 px-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-10 text-slate-400">
                      Carregando inventários de estoque...
                    </td>
                  </tr>
                ) : paginatedInventarios.length > 0 ? (
                  paginatedInventarios.map((inv) => (
                    <tr
                      key={inv.id}
                      onClick={() => handleAbrirInventario(inv)}
                      className="odd:bg-white even:bg-slate-50/70 hover:bg-teal-50/50 transition-colors cursor-pointer group"
                    >
                      {/* Código */}
                      <td className="py-2.5 px-3 font-mono font-semibold text-teal-800 flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-teal-600" />
                        <span>{inv.codigo}</span>
                      </td>

                      {/* Registrado (ícone de status/calendário) */}
                      <td className="py-2.5 px-3 text-center">
                        <span className="inline-flex items-center gap-1 text-[11px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          <Calendar className="w-3 h-3 text-slate-500" />
                          <span>{inv.data ? `${inv.data.slice(8, 10)}/${inv.data.slice(5, 7)}/${inv.data.slice(0, 4)}` : '-'} {inv.hora ? inv.hora.slice(0, 5) : ''}</span>
                        </span>
                      </td>

                      {/* Cód. Empresa */}
                      <td className="py-2.5 px-3 font-mono text-slate-600">
                        {inv.empresa_codigo || '001'}
                      </td>

                      {/* Centro de Custo */}
                      <td className="py-2.5 px-3 font-medium text-slate-800">
                        {inv.centro_custo_codigo ? `${inv.centro_custo_codigo} - ${inv.centro_custo_nome}` : (inv.centro_custo_nome || '-')}
                      </td>

                      {/* Data */}
                      <td className="py-2.5 px-3 text-slate-600">
                        {inv.data ? `${inv.data.slice(8, 10)}/${inv.data.slice(5, 7)}/${inv.data.slice(0, 4)}` : '-'}
                      </td>

                      {/* Finalizado (SIM / NÃO) */}
                      <td className="py-2.5 px-3 text-center">
                        {inv.finalizado === 1 ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded text-[10px] border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>SIM</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded text-[10px] border border-amber-200">
                            <Clock className="w-3 h-3 text-amber-600" />
                            <span>NÃO</span>
                          </span>
                        )}
                      </td>

                      {/* Ações */}
                      <td className="py-2.5 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleAbrirInventario(inv)}
                            title={inv.finalizado === 1 ? 'Visualizar auditoria' : 'Editar inventário'}
                            className="p-1 rounded text-teal-700 hover:bg-teal-100 transition-colors"
                          >
                            {inv.finalizado === 1 ? <Eye className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
                          </button>

                          {inv.finalizado === 0 && (
                            <button
                              type="button"
                              onClick={() => handleExcluirRascunho(inv.id)}
                              title="Excluir rascunho"
                              className="p-1 rounded text-rose-600 hover:bg-rose-100 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-slate-500">
                      Nenhum inventário de estoque encontrado com os filtros selecionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Rodapé da Tabela: X registro(s) encontrado(s) à esquerda e Paginação à direita */}
          <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 mt-auto">
            <div>
              <span className="font-semibold text-slate-800">{inventarios.length}</span> registro(s) encontrado(s)
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 transition-all cursor-pointer"
                title="Primeira página"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 transition-all cursor-pointer"
                title="Página anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="px-3 py-1 font-semibold text-slate-700">
                Página {currentPage} de {totalPages}
              </span>

              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 transition-all cursor-pointer"
                title="Próxima página"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 transition-all cursor-pointer"
                title="Última página"
              >
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // RENDERIZAÇÃO: 2. TELA DE CADASTRO / EDIÇÃO DE INVENTÁRIO DO ESTOQUE
  // =========================================================================
  return (
    <div className="flex flex-col min-h-full space-y-5">
      {/* Cabeçalho da Visão */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-lg border ${formFinalizado === 1 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-teal-50 border-teal-200 text-teal-700'}`}>
            <Boxes className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-800 tracking-tight">
                {formMode === 'create' ? 'Novo Inventário do Estoque' : formFinalizado === 1 ? 'Visualização de Inventário Concluído' : 'Edição de Inventário do Estoque'}
              </h1>
              {formFinalizado === 1 ? (
                <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded uppercase flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  <span>Finalizado (Somente Leitura)</span>
                </span>
              ) : (
                <span className="bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-bold px-2 py-0.5 rounded uppercase flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>Rascunho em Aberto</span>
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Contagem física direta com atualização atômica de saldo e ajuste automático de lotes FEFO
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setViewMode('consulta')}
          className="border border-teal-600 text-teal-700 hover:bg-teal-50 font-medium px-3.5 py-1.5 rounded text-xs flex items-center gap-1.5 transition-all self-start md:self-auto cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>VOLTAR À LISTA</span>
        </button>
      </div>

      {/* Conteúdo Principal do Formulário */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        {/* Barra de Abas do Cadastro */}
        <div className="flex border-b border-slate-200 bg-slate-50/80 px-4 pt-2 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('dados_principais')}
            className={`px-5 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'dados_principais'
                ? 'border-teal-600 text-teal-700 bg-white rounded-t shadow-sm'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>1. Dados Principais & Configuração</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('itens')}
            className={`px-5 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'itens'
                ? 'border-teal-600 text-teal-700 bg-white rounded-t shadow-sm'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <ClipboardCheck className="w-4 h-4" />
            <span>2. Grade de Itens & Recontagem Física</span>
            <span className="bg-slate-200 text-slate-700 text-[10px] px-1.5 py-0.2 rounded-full font-mono">
              {formItens.length}
            </span>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* =================================================================
              ABA 1: DADOS PRINCIPAIS
             ================================================================= */}
          {activeTab === 'dados_principais' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                {/* Código (readonly, gerado automaticamente) */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Código (Automático)
                  </label>
                  <input
                    type="text"
                    value={formCodigo}
                    readOnly
                    className="w-full px-3 py-2 bg-slate-100 border border-slate-300 rounded text-xs text-slate-800 font-mono font-bold cursor-not-allowed shadow-inner"
                  />
                </div>

                {/* Data (padrão atual) */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Data da Contagem *
                  </label>
                  <input
                    type="date"
                    value={formData}
                    onChange={(e) => setFormData(e.target.value)}
                    disabled={formFinalizado === 1}
                    className="w-full px-3 py-2 bg-[#f1f3f5] border border-slate-300 rounded text-xs text-slate-800 focus:bg-white focus:border-teal-500 shadow-inner"
                    required
                  />
                </div>

                {/* Hora (padrão atual) */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Hora da Contagem *
                  </label>
                  <input
                    type="time"
                    step="1"
                    value={formHora}
                    onChange={(e) => setFormHora(e.target.value)}
                    disabled={formFinalizado === 1}
                    className="w-full px-3 py-2 bg-[#f1f3f5] border border-slate-300 rounded text-xs text-slate-800 focus:bg-white focus:border-teal-500 shadow-inner"
                    required
                  />
                </div>

                {/* Empresa / Unidade (readonly, herdada da sessão) */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Empresa / Unidade
                  </label>
                  <input
                    type="text"
                    value={formEmpresaNome}
                    readOnly
                    className="w-full px-3 py-2 bg-slate-100 border border-slate-300 rounded text-xs text-slate-700 cursor-not-allowed shadow-inner"
                  />
                </div>
              </div>

              {/* Centro de Custo (dropdown obrigatório) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Centro de Custo (Local da Contagem) *
                  </label>
                  <SearchableSelect
                    options={formCentroCustoOptions}
                    value={formCentroCustoId}
                    onChange={(val) => setFormCentroCustoId(val ? Number(val) : '')}
                    disabled={formFinalizado === 1}
                    placeholder="Selecione o Centro de Custo..."
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    A recontagem física afetará diretamente os estoques e lotes sob a gestão deste Centro de Custo.
                  </p>
                </div>

                {/* Toggles / Switches de configuração */}
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-3">
                  <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    Configuração de Ajuste Automático
                  </div>

                  {/* Toggle: Zera estoque de produtos por Lote */}
                  <label className="flex items-center justify-between cursor-pointer group">
                    <div className="pr-3">
                      <div className="text-xs font-semibold text-slate-800">
                        Zera estoque de produtos por Lote
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Lotes com saldo positivo que não receberem contagem física serão zerados neste inventário.
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={formFinalizado === 1}
                      onClick={() => setFormZeraPorLote((prev) => !prev)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        formZeraPorLote ? 'bg-teal-600' : 'bg-slate-300'
                      } ${formFinalizado === 1 ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          formZeraPorLote ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </label>

                  <div className="border-t border-slate-200" />

                  {/* Toggle: Zera estoque de produtos não listados */}
                  <label className="flex items-center justify-between cursor-pointer group">
                    <div className="pr-3">
                      <div className="text-xs font-semibold text-slate-800">
                        Zera estoque de produtos não listados
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Produtos cadastrados que não forem incluídos na contagem terão o saldo total zerado via saída de ajuste.
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={formFinalizado === 1}
                      onClick={() => setFormZeraNaoListados((prev) => !prev)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        formZeraNaoListados ? 'bg-teal-600' : 'bg-slate-300'
                      } ${formFinalizado === 1 ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          formZeraNaoListados ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </label>
                </div>
              </div>

              {/* Observação (textarea amplo) */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Observação / Notas de Auditoria
                </label>
                <textarea
                  rows={3}
                  value={formObservacao}
                  onChange={(e) => setFormObservacao(e.target.value)}
                  disabled={formFinalizado === 1}
                  placeholder="Informe detalhes sobre o fechamento do inventário, equipe de conferência física, motivos de divergência ampla, etc."
                  className="w-full px-3 py-2 bg-[#f1f3f5] border border-slate-300 rounded text-xs text-slate-800 focus:bg-white focus:border-teal-500 shadow-inner"
                />
              </div>

              {/* Atalho para ir para a grade de itens */}
              <div className="p-4 bg-teal-50/60 rounded-lg border border-teal-200 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="text-xs text-teal-800">
                  <span className="font-bold">Pronto para a contagem:</span> Prossiga para a aba de Itens para lançar a apuração física diretamente nas células da grade.
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('itens')}
                  className="bg-teal-600 hover:bg-teal-700 text-white font-medium px-4 py-2 rounded text-xs flex items-center gap-1.5 transition-all shadow cursor-pointer whitespace-nowrap"
                >
                  <span>IR PARA GRADE DE ITENS</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* =================================================================
              ABA 2: GRADE DE ITENS E RECONTAGEM FÍSICA
             ================================================================= */}
          {activeTab === 'itens' && (
            <div className="space-y-4">
              {/* Barra Superior da Grade: Busca, Filtro de Grupo, Filtro de Divergência e Botão Adicionar Manual */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      value={filtroItensBusca}
                      onChange={(e) => setFiltroItensBusca(e.target.value)}
                      placeholder="Filtrar por código, produto ou lote..."
                      className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded text-xs text-slate-800 focus:border-teal-500 shadow-sm"
                    />
                  </div>

                  {/* Filtro por Grupo de Produto */}
                  <div className="w-52">
                    <SearchableSelect
                      options={filtroItensGrupoOptions}
                      value={filtroItensGrupo}
                      onChange={(val) => setFiltroItensGrupo(val ? String(val) : 'todos')}
                      placeholder="Filtrar por grupo..."
                    />
                  </div>

                  <div className="w-52">
                    <SearchableSelect
                      options={filtroItensDiferencaOptions}
                      value={filtroItensDiferenca}
                      onChange={(val) => setFiltroItensDiferenca((val as any) || 'todos')}
                      placeholder="Filtrar por status..."
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {formFinalizado === 0 && (
                    <button
                      type="button"
                      onClick={() => setIsAddManualModalOpen(true)}
                      className="bg-teal-600 hover:bg-teal-700 text-white font-medium px-3.5 py-1.5 rounded text-xs flex items-center gap-1.5 transition-all shadow cursor-pointer"
                    >
                      <PlusCircle className="w-4 h-4" />
                      <span>+ ADICIONAR PRODUTO / LOTE MANUALMENTE</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Cards de Métricas Resumo */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded flex items-center justify-between">
                  <div>
                    <div className="text-[10px] uppercase font-bold text-slate-500">Total de Itens</div>
                    <div className="text-lg font-mono font-bold text-slate-800">{resumoItens.total}</div>
                  </div>
                  <Boxes className="w-5 h-5 text-slate-400" />
                </div>

                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded flex items-center justify-between">
                  <div>
                    <div className="text-[10px] uppercase font-bold text-emerald-700">Entradas de Ajuste (+)</div>
                    <div className="text-lg font-mono font-bold text-emerald-800">{resumoItens.entradas}</div>
                  </div>
                  <TrendingUp className="w-5 h-5 text-emerald-600" />
                </div>

                <div className="p-3 bg-rose-50 border border-rose-200 rounded flex items-center justify-between">
                  <div>
                    <div className="text-[10px] uppercase font-bold text-rose-700">Saídas de Ajuste (-)</div>
                    <div className="text-lg font-mono font-bold text-rose-800">{resumoItens.saidas}</div>
                  </div>
                  <TrendingDown className="w-5 h-5 text-rose-600" />
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded flex items-center justify-between">
                  <div>
                    <div className="text-[10px] uppercase font-bold text-slate-500">Em Conformidade (0)</div>
                    <div className="text-lg font-mono font-bold text-slate-800">{resumoItens.iguais}</div>
                  </div>
                  <Equal className="w-5 h-5 text-slate-400" />
                </div>
              </div>

              {/* Tabela de Itens e Recontagem Física */}
              <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
                <div className="overflow-x-auto max-h-[500px]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider border-b border-slate-200 sticky top-0 z-10">
                      <tr>
                        <th className="py-2.5 px-3">Código Interno</th>
                        <th className="py-2.5 px-3">Descrição do Produto</th>
                        <th className="py-2.5 px-3">Lote</th>
                        <th className="py-2.5 px-3">Validade</th>
                        <th className="py-2.5 px-3 text-center">Unidade</th>
                        <th className="py-2.5 px-3 text-right">Estoque Sistema (Atual)</th>
                        <th className="py-2.5 px-3 text-right w-44">Contagem Física (Digitada)</th>
                        <th className="py-2.5 px-3 text-right">Diferença (Ajuste)</th>
                        {formFinalizado === 0 && <th className="py-2.5 px-3 text-center w-12">Ações</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {itensFiltrados.length > 0 ? (
                        itensFiltrados.map((it, idx) => {
                          const diferenca = it.quantidade_fisica - it.quantidade_sistema;
                          const itemKey = getItemKey(it);
                          const rawVal = rawContagens[itemKey] !== undefined ? rawContagens[itemKey] : String(it.quantidade_fisica);

                          return (
                            <tr
                              key={`${itemKey}-${idx}`}
                              className="odd:bg-white even:bg-slate-50/70 hover:bg-teal-50/40 transition-colors"
                            >
                              {/* Código Interno */}
                              <td className="py-2 px-3 font-mono font-semibold text-slate-700">
                                {it.produto_codigo}
                              </td>

                              {/* Descrição do Produto Completa sem cortar */}
                              <td className="py-2 px-3 font-medium text-slate-800 max-w-sm">
                                <div className="font-semibold text-slate-900 break-words whitespace-normal leading-snug">
                                  {it.produto_nome}
                                </div>
                                {it.grupo_nome && (
                                  <div className="text-[10px] text-teal-800 font-medium truncate mt-0.5">
                                    {it.grupo_nome}
                                  </div>
                                )}
                              </td>

                              {/* Lote */}
                              <td className="py-2 px-3 font-mono text-slate-600">
                                {it.numero_lote || '-'}
                              </td>

                              {/* Validade */}
                              <td className="py-2 px-3 text-slate-600">
                                {it.data_validade
                                  ? `${it.data_validade.slice(8, 10)}/${it.data_validade.slice(5, 7)}/${it.data_validade.slice(0, 4)}`
                                  : '-'}
                              </td>

                              {/* Unidade */}
                              <td className="py-2 px-3 text-center font-bold text-slate-500">
                                {it.unidade_medida}
                              </td>

                              {/* Estoque Sistema (Atual) */}
                              <td className="py-2 px-3 text-right font-mono text-slate-700 font-medium">
                                {it.quantidade_sistema.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                              </td>

                              {/* Contagem Física (Digitada) */}
                              <td className="py-2 px-3 text-right">
                                {formFinalizado === 1 ? (
                                  <span className="font-mono font-bold text-slate-800">
                                    {it.quantidade_fisica.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                                  </span>
                                ) : (
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={rawVal}
                                    onFocus={(e) => {
                                      if (e.target.value === '0' || e.target.value === '0,00' || e.target.value === '0.00') {
                                        e.target.select();
                                      }
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'ArrowUp') {
                                        e.preventDefault();
                                        const cur = parseFloat(String(it.quantidade_fisica || 0)) + 1;
                                        handleUpdateContagemFisica(itemKey, String(cur));
                                      } else if (e.key === 'ArrowDown') {
                                        e.preventDefault();
                                        const cur = Math.max(0, parseFloat(String(it.quantidade_fisica || 0)) - 1);
                                        handleUpdateContagemFisica(itemKey, String(cur));
                                      }
                                    }}
                                    onChange={(e) => handleUpdateContagemFisica(itemKey, e.target.value)}
                                    className="w-full text-right px-2.5 py-1 font-mono font-bold text-slate-800 bg-white border border-teal-500 rounded focus:ring-2 focus:ring-teal-400 focus:outline-none shadow-sm"
                                  />
                                )}
                              </td>

                              {/* Diferença (Ajuste) - Sem necessidade de justificativa */}
                              <td className="py-2 px-3 text-right font-mono">
                                {diferenca > 0 ? (
                                  <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-xs">
                                    <TrendingUp className="w-3 h-3 text-emerald-600" />
                                    <span>+{diferenca.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                                  </span>
                                ) : diferenca < 0 ? (
                                  <span className="inline-flex items-center gap-1 font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 text-xs">
                                    <TrendingDown className="w-3 h-3 text-rose-600" />
                                    <span>{diferenca.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-xs">
                                    <Equal className="w-3 h-3 text-slate-400" />
                                    <span>0,00</span>
                                  </span>
                                )}
                              </td>

                              {/* Ação de Remoção para Item Manual */}
                              {formFinalizado === 0 && (
                                <td className="py-2 px-3 text-center">
                                  <button
                                    type="button"
                                    onClick={() => handleRemoverItem(idx)}
                                    title="Remover item da contagem"
                                    className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              )}
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={formFinalizado === 0 ? 9 : 8} className="text-center py-10 text-slate-400">
                            Nenhum item na grade para o filtro aplicado.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* =================================================================
              RODAPÉ DE AÇÕES DA TELA DE CADASTRO
             ================================================================= */}
          <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
            {/* Lado Esquerdo: VOLTAR (botão teal com seta para a esquerda) */}
            <button
              type="button"
              onClick={() => setViewMode('consulta')}
              className="bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-medium px-5 py-2.5 rounded text-xs flex items-center gap-2 transition-all shadow uppercase tracking-wider cursor-pointer w-full sm:w-auto justify-center"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>VOLTAR</span>
            </button>

            {/* Lado Direito: LIMPAR, SALVAR, SALVAR E FECHAR */}
            {formFinalizado === 0 && (
              <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto justify-end">
                {/* Botão LIMPAR (azul/ciano com ícone de vassoura/limpeza) */}
                <button
                  type="button"
                  onClick={handleLimparContagens}
                  disabled={isSaving}
                  title="Restaura as contagens digitadas para os valores do sistema"
                  className="bg-cyan-600 hover:bg-cyan-700 active:bg-cyan-800 text-white font-medium px-4 py-2.5 rounded text-xs flex items-center gap-1.5 transition-all shadow uppercase tracking-wider cursor-pointer disabled:opacity-50"
                >
                  <Brush className="w-4 h-4" />
                  <span>LIMPAR</span>
                </button>

                {/* Botão SALVAR (verde para salvar rascunho sem fechar o inventário) */}
                <button
                  type="button"
                  onClick={() => handleSalvarInventario(false)}
                  disabled={isSaving}
                  className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-medium px-5 py-2.5 rounded text-xs flex items-center gap-1.5 transition-all shadow uppercase tracking-wider cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSaving ? 'SALVANDO...' : 'SALVAR'}</span>
                </button>

                {/* Botão SALVAR E FECHAR (verde escuro para concluir o inventário e aplicar os ajustes no estoque) */}
                <button
                  type="button"
                  onClick={() => setIsConfirmFecharModalOpen(true)}
                  disabled={isSaving}
                  className="bg-emerald-900 hover:bg-emerald-950 active:bg-black text-white font-bold px-5 py-2.5 rounded text-xs flex items-center gap-1.5 transition-all shadow-md uppercase tracking-wider cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>SALVAR E FECHAR</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* =====================================================================
          MODAL: ADICIONAR PRODUTO / LOTE MANUALMENTE À CONTAGEM
         ===================================================================== */}
      {isAddManualModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden space-y-4 p-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-teal-600" />
                <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wide">
                  Adicionar Produto / Lote Manualmente
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddManualModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Produto do Catálogo *
                </label>
                <SearchableSelect
                  options={manualProdutoOptions}
                  value={manualProdutoId}
                  onChange={(val) => setManualProdutoId(val ? Number(val) : '')}
                  placeholder="Selecione o produto..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Número do Lote
                  </label>
                  <input
                    type="text"
                    value={manualNumeroLote}
                    onChange={(e) => setManualNumeroLote(e.target.value)}
                    placeholder="ex: LOT-2026-X"
                    className="w-full px-3 py-2 bg-[#f1f3f5] border border-slate-300 rounded text-xs text-slate-800 uppercase font-mono focus:bg-white focus:border-teal-500 shadow-inner"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Validade do Lote
                  </label>
                  <input
                    type="date"
                    value={manualDataValidade}
                    onChange={(e) => setManualDataValidade(e.target.value)}
                    className="w-full px-3 py-2 bg-[#f1f3f5] border border-slate-300 rounded text-xs text-slate-800 focus:bg-white focus:border-teal-500 shadow-inner"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Contagem Física Apurada *
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={manualQuantidadeFisica}
                  onChange={(e) => setManualQuantidadeFisica(e.target.value ? parseFloat(e.target.value) : '')}
                  className="w-full px-3 py-2 bg-white border border-teal-500 rounded text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Como este item não constava na listagem de saldo, o sistema considerará estoque anterior como 0 e gerará entrada pelo ajuste apurado.
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAddManualModalOpen(false)}
                className="px-4 py-2 rounded text-xs border border-slate-300 text-slate-600 hover:bg-slate-50 font-medium cursor-pointer"
              >
                CANCELAR
              </button>
              <button
                type="button"
                onClick={handleSalvarItemManual}
                className="px-4 py-2 rounded text-xs bg-teal-600 hover:bg-teal-700 text-white font-medium cursor-pointer shadow"
              >
                ADICIONAR À CONTAGEM
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL: CONFIRMAÇÃO DE "SALVAR E FECHAR"
         ===================================================================== */}
      {isConfirmFecharModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden space-y-4 p-6">
            <div className="flex items-center gap-3 text-emerald-800">
              <div className="p-2.5 rounded-full bg-emerald-100 text-emerald-700">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900 uppercase tracking-wide">
                  Concluir e Fechar Inventário
                </h3>
                <p className="text-xs text-slate-500">
                  Esta operação aplicará os ajustes de estoque de forma definitiva.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-2 text-xs">
              <div className="font-semibold text-slate-700">Resumo da Operação:</div>
              <ul className="space-y-1 text-slate-600">
                <li className="flex items-center justify-between">
                  <span>Itens com entrada (+):</span>
                  <span className="font-bold text-emerald-700">{resumoItens.entradas}</span>
                </li>
                <li className="flex items-center justify-between">
                  <span>Itens com saída (-):</span>
                  <span className="font-bold text-rose-700">{resumoItens.saidas}</span>
                </li>
                <li className="flex items-center justify-between">
                  <span>Zerar lotes não contados:</span>
                  <span className="font-bold">{formZeraPorLote ? 'SIM' : 'NÃO'}</span>
                </li>
                <li className="flex items-center justify-between">
                  <span>Zerar produtos não listados:</span>
                  <span className="font-bold">{formZeraNaoListados ? 'SIM' : 'NÃO'}</span>
                </li>
              </ul>
              <p className="text-[11px] text-amber-800 bg-amber-50 p-2 rounded border border-amber-200 mt-2">
                Após fechar, o inventário tornará-se somente leitura para auditoria e histórico fiscal.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsConfirmFecharModalOpen(false)}
                disabled={isSaving}
                className="px-4 py-2 rounded text-xs border border-slate-300 text-slate-600 hover:bg-slate-50 font-medium cursor-pointer"
              >
                VOLTAR
              </button>
              <button
                type="button"
                onClick={() => handleSalvarInventario(true)}
                disabled={isSaving}
                className="px-5 py-2 rounded text-xs bg-emerald-800 hover:bg-emerald-900 text-white font-bold cursor-pointer shadow-md"
              >
                {isSaving ? 'PROCESSANDO AJUSTES...' : 'CONFIRMAR E APLICAR AJUSTES'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
