import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  PackageCheck,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Filter,
  Calendar,
  Building2,
  AlertCircle,
  CheckCircle2,
  FileText,
  User,
  Trash2,
  Eye,
  X,
  Clock,
  ShieldAlert
} from 'lucide-react';
import type { Consumo, ItemConsumo, Produto, LoteEstoque, CentroCusto, Usuario } from '../types/index.ts';
import { SearchableSelect, type SearchableOption } from './SearchableSelect.tsx';

interface ConsumoViewProps {
  currentUser: Usuario;
  activeAreaSigla?: string;
  activeAreaNome?: string;
  centrosCusto: CentroCusto[];
  produtos: Produto[];
}

interface NewConsumoItem {
  produto_id: number;
  produto_codigo: string;
  produto_nome: string;
  unidade_medida: string;
  lote_id: number;
  numero_lote: string;
  data_validade: string | null;
  saldo_disponivel: number;
  quantidade: number;
  custo_unitario: number;
}

export const ConsumoView: React.FC<ConsumoViewProps> = ({
  currentUser,
  activeAreaSigla = 'ALM',
  activeAreaNome = 'Almoxarifado',
  centrosCusto,
  produtos,
}) => {
  const [consumos, setConsumos] = useState<Consumo[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroCcId, setFiltroCcId] = useState<string>('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (searchTerm.trim() !== '') count++;
    if (filtroCcId !== '') count++;
    if (dataInicio !== '') count++;
    if (dataFim !== '') count++;
    return count;
  }, [searchTerm, filtroCcId, dataInicio, dataFim]);

  // Modais
  const [isNovoModalOpen, setIsNovoModalOpen] = useState(false);
  const [isDetalhesModalOpen, setIsDetalhesModalOpen] = useState(false);
  const [isEstornoModalOpen, setIsEstornoModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  // Dados do Consumo Selecionado / Detalhes
  const [selectedConsumo, setSelectedConsumo] = useState<Consumo | null>(null);
  const [justificativaEstorno, setJustificativaEstorno] = useState('');

  // Formulário Novo Consumo
  const [novoCentroCustoId, setNovoCentroCustoId] = useState<number>(0);
  const [novoResponsavel, setNovoResponsavel] = useState('');
  const [novaObservacao, setNovaObservacao] = useState('');
  const [itensNovoConsumo, setItensNovoConsumo] = useState<NewConsumoItem[]>([]);

  // Item sendo adicionado no formulário
  const [prodSelectId, setProdSelectId] = useState<number>(0);
  const [lotesProduto, setLotesProduto] = useState<LoteEstoque[]>([]);
  const [loteSelectId, setLoteSelectId] = useState<number>(0);
  const [itemQuantidade, setItemQuantidade] = useState<number>(1);
  const [loadingLotes, setLoadingLotes] = useState(false);

  const printRef = useRef<HTMLDivElement>(null);

  const isAlmoxarifeOrAdmin =
    currentUser.perfil === 'admin' ||
    currentUser.perfil === 'ti_dpo' ||
    currentUser.perfil === 'almoxarife';

  const fetchConsumos = async () => {
    setLoading(true);
    try {
      let url = '/api/consumos?';
      if (filtroCcId) url += `centro_custo_id=${filtroCcId}&`;
      if (dataInicio) url += `data_inicio=${dataInicio}&`;
      if (dataFim) url += `data_fim=${dataFim}&`;
      if (searchTerm) url += `busca=${encodeURIComponent(searchTerm)}&`;

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
          'X-Area-Sigla': activeAreaSigla,
        },
      });
      if (!res.ok) throw new Error('Falha ao carregar registros de consumo.');
      const data = await res.json();
      setConsumos(data);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro de conexão.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConsumos();
  }, [activeAreaSigla, filtroCcId, dataInicio, dataFim]);

  // Carrega lotes válidos ao selecionar um produto no formulário
  useEffect(() => {
    if (!prodSelectId) {
      setLotesProduto([]);
      setLoteSelectId(0);
      return;
    }

    const loadLotes = async () => {
      setLoadingLotes(true);
      try {
        const res = await fetch(`/api/produtos/${prodSelectId}/lotes`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
            'X-Area-Sigla': activeAreaSigla,
          },
        });
        if (res.ok) {
          const data: LoteEstoque[] = await res.json();
          // Filtra lotes com saldo positivo
          const comSaldo = data.filter((l) => Number(l.quantidade_atual) > 0);
          setLotesProduto(comSaldo);
          if (comSaldo.length > 0) {
            // Sugere o primeiro lote (ordenação FEFO vem do backend)
            setLoteSelectId(comSaldo[0].id);
          } else {
            setLoteSelectId(0);
          }
        }
      } catch {
        setLotesProduto([]);
      } finally {
        setLoadingLotes(false);
      }
    };

    loadLotes();
  }, [prodSelectId, activeAreaSigla]);

  const handleAddItem = () => {
    if (!prodSelectId) {
      alert('Selecione um produto.');
      return;
    }
    if (!loteSelectId) {
      alert('Selecione um lote com saldo disponível.');
      return;
    }
    if (itemQuantidade <= 0) {
      alert('A quantidade deve ser maior que zero.');
      return;
    }

    const prod = produtos.find((p) => p.id === prodSelectId);
    const lote = lotesProduto.find((l) => l.id === loteSelectId);

    if (!prod || !lote) return;

    // Bloqueia lote vencido
    const hojeStr = new Date().toISOString().slice(0, 10);
    if (lote.data_validade && lote.data_validade.slice(0, 10) < hojeStr) {
      alert(`O lote "${lote.numero_lote}" está VENCIDO (${lote.data_validade}) e não pode ser dispensado para consumo.`);
      return;
    }

    // Valida saldo disponível
    const jaAdicionado = itensNovoConsumo
      .filter((i) => i.lote_id === lote.id)
      .reduce((acc, curr) => acc + curr.quantidade, 0);

    const saldoReal = Number(lote.quantidade_atual) - jaAdicionado;

    if (itemQuantidade > saldoReal) {
      alert(`Saldo insuficiente neste lote. Disponível: ${saldoReal}, Solicitado: ${itemQuantidade}`);
      return;
    }

    const newItem: NewConsumoItem = {
      produto_id: prod.id,
      produto_codigo: prod.codigo,
      produto_nome: prod.nome,
      unidade_medida: prod.unidade_medida,
      lote_id: lote.id,
      numero_lote: lote.numero_lote,
      data_validade: lote.data_validade || null,
      saldo_disponivel: Number(lote.quantidade_atual),
      quantidade: itemQuantidade,
      custo_unitario: Number(prod.valor_unitario || prod.custo_unitario || 0),
    };

    setItensNovoConsumo([...itensNovoConsumo, newItem]);
    // Limpa campos do item
    setProdSelectId(0);
    setLoteSelectId(0);
    setItemQuantidade(1);
  };

  const handleRemoveItem = (index: number) => {
    setItensNovoConsumo(itensNovoConsumo.filter((_, idx) => idx !== index));
  };

  const handleCreateConsumo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoCentroCustoId) {
      setErrorMsg('Selecione o Setor / Centro de Custo atendido.');
      return;
    }
    if (!novoResponsavel.trim()) {
      setErrorMsg('Informe o nome do Responsável pelo Recebimento.');
      return;
    }
    if (itensNovoConsumo.length === 0) {
      setErrorMsg('Adicione pelo menos 1 item ao consumo.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/consumos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
          'X-Area-Sigla': activeAreaSigla,
        },
        body: JSON.stringify({
          centro_custo_id: novoCentroCustoId,
          responsavel_recebimento: novoResponsavel.trim(),
          observacao: novaObservacao.trim(),
          itens: itensNovoConsumo.map((i) => ({
            produto_id: i.produto_id,
            lote_id: i.lote_id,
            quantidade: i.quantidade,
            custo_unitario: i.custo_unitario,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao registrar entrega de consumo.');

      setSuccessMsg(`Consumo ${data.numero_consumo} registrado com sucesso!`);
      setIsNovoModalOpen(false);
      setNovoCentroCustoId(0);
      setNovoResponsavel('');
      setNovaObservacao('');
      setItensNovoConsumo([]);

      // Abre automaticamente para impressão do comprovante A4
      setSelectedConsumo(data);
      setIsPrintModalOpen(true);

      fetchConsumos();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao registrar consumo.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDetalhes = async (c: Consumo) => {
    try {
      const res = await fetch(`/api/consumos/${c.id}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
          'X-Area-Sigla': activeAreaSigla,
        },
      });
      if (res.ok) {
        const fullConsumo = await res.json();
        setSelectedConsumo(fullConsumo);
        setIsDetalhesModalOpen(true);
      }
    } catch {
      setSelectedConsumo(c);
      setIsDetalhesModalOpen(true);
    }
  };

  const handleOpenPrint = async (c: Consumo) => {
    try {
      const res = await fetch(`/api/consumos/${c.id}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
          'X-Area-Sigla': activeAreaSigla,
        },
      });
      if (res.ok) {
        const fullConsumo = await res.json();
        setSelectedConsumo(fullConsumo);
      } else {
        setSelectedConsumo(c);
      }
    } catch {
      setSelectedConsumo(c);
    }
    setIsPrintModalOpen(true);
  };

  const handleConfirmEstorno = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConsumo) return;
    if (!justificativaEstorno.trim()) {
      alert('A justificativa é obrigatória para o estorno.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/consumos/${selectedConsumo.id}/estorno`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
          'X-Area-Sigla': activeAreaSigla,
        },
        body: JSON.stringify({ justificativa: justificativaEstorno.trim() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao estornar consumo.');

      setSuccessMsg(`Consumo ${selectedConsumo.numero_consumo} estornado com sucesso. Saldo devolvido ao estoque.`);
      setIsEstornoModalOpen(false);
      setJustificativaEstorno('');
      fetchConsumos();
    } catch (err: any) {
      alert(err.message || 'Erro ao estornar.');
    } finally {
      setLoading(false);
    }
  };

  const triggerDirectPrint = () => {
    window.print();
  };

  const productOptions: SearchableOption[] = produtos
    .filter((p) => p.ativo)
    .map((p) => ({
      value: p.id,
      label: `${p.codigo} - ${p.nome}`,
      secondaryLabel: `Saldo: ${p.quantidade_atual} ${p.unidade_medida}`,
    }));

  const ccOptions: SearchableOption[] = centrosCusto
    .filter((cc) => cc.ativo)
    .map((cc) => ({
      value: cc.id,
      label: `${cc.codigo} - ${cc.nome}`,
      secondaryLabel: cc.departamento,
    }));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Topo do Módulo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-[#00237D]/10 text-[#00237D] rounded-lg">
              <PackageCheck className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Módulo de Consumo Direto
            </h1>
            <span className="text-[11px] font-bold uppercase tracking-wider bg-slate-100 text-[#00237D] px-2 py-0.5 rounded border border-slate-200 font-mono">
              Área: {activeAreaSigla} ({activeAreaNome})
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Entrega direta de {activeAreaSigla === 'CAF' ? 'medicamentos' : 'insumos e materiais'} para um setor assistencial, com responsável pelo recebimento, sem requisição prévia.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className={`px-3.5 py-2 text-xs font-bold uppercase tracking-wider rounded-lg flex items-center gap-1.5 shadow-xs transition-all cursor-pointer ${
              isFilterOpen || activeFiltersCount > 0
                ? 'bg-[#00237D] text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300'
            }`}
          >
            <Filter className="w-4 h-4" />
            <span>FILTROS</span>
            {activeFiltersCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-amber-400 text-slate-900 font-extrabold text-[10px] rounded-full">
                {activeFiltersCount}
              </span>
            )}
          </button>

          {isAlmoxarifeOrAdmin && (
            <button
              type="button"
              onClick={() => setIsNovoModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-[#00237D] hover:bg-[#001c66] text-white text-xs font-semibold rounded-lg shadow-sm transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Novo Consumo</span>
            </button>
          )}
        </div>
      </div>

      {/* Alertas */}
      {errorMsg && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Barra de Filtros Retrátil */}
      {isFilterOpen && (
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="text-xs font-bold uppercase text-slate-700 tracking-wider flex items-center gap-1.5">
              <Filter className="w-4 h-4 text-[#00237D]" />
              Painel de Filtros e Pesquisa
            </span>
            <button
              type="button"
              onClick={() => setIsFilterOpen(false)}
              className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por número, setor ou recebedor..."
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-[#00237D]"
              />
            </div>

            <div>
              <select
                value={filtroCcId}
                onChange={(e) => setFiltroCcId(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:border-[#00237D]"
              >
                <option value="">Todos os Setores (Centros de Custo)</option>
                {centrosCusto.map((cc) => (
                  <option key={cc.id} value={cc.id}>
                    {cc.codigo} - {cc.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs w-full"
              />
              <span>até</span>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs w-full"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setFiltroCcId('');
                setDataInicio('');
                setDataFim('');
              }}
              className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition-colors cursor-pointer"
            >
              LIMPAR FILTROS
            </button>
            <button
              type="button"
              onClick={() => {
                fetchConsumos();
                setIsFilterOpen(false);
              }}
              className="px-4 py-1.5 bg-[#00237D] hover:bg-[#001c66] text-white font-bold text-xs rounded-lg shadow-xs transition-colors cursor-pointer uppercase tracking-wider"
            >
              PESQUISAR / APLICAR
            </button>
            <button
              type="button"
              onClick={() => setIsFilterOpen(false)}
              className="px-3.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-lg transition-colors cursor-pointer"
            >
              FECHAR
            </button>
          </div>
        </div>
      )}

      {/* Tabela de Consumos */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
              <th className="px-4 py-3">Número</th>
              <th className="px-4 py-3">Data e Hora</th>
              <th className="px-4 py-3">Setor Atendido</th>
              <th className="px-4 py-3">Recebido por</th>
              <th className="px-4 py-3">Entregue por</th>
              <th className="px-4 py-3 text-center">Itens</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
            {consumos.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  {loading ? 'Carregando entregas de consumo...' : 'Nenhum registro de consumo localizado para a área ativa.'}
                </td>
              </tr>
            ) : (
              consumos.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-4 py-3 font-mono font-bold text-[#00237D]">
                    {c.numero_consumo}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {new Date(c.data_consumo).toLocaleString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-900">
                    {c.centro_custo_nome || '—'}
                    {c.centro_custo_codigo && (
                      <span className="text-[10px] text-slate-400 font-mono ml-1">
                        ({c.centro_custo_codigo})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-800">
                    <span className="font-medium">{c.responsavel_recebimento}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {c.usuario_nome || 'Almoxarife'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-block px-2 py-0.5 bg-slate-100 rounded text-[11px] font-bold text-slate-700">
                      {c.total_itens || 0}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-1">
                    <button
                      type="button"
                      onClick={() => handleOpenDetalhes(c)}
                      className="p-1.5 text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                      title="Ver Detalhes"
                    >
                      <Eye className="w-4 h-4 inline" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenPrint(c)}
                      className="p-1.5 text-slate-600 hover:text-[#00237D] hover:bg-slate-100 rounded transition-colors cursor-pointer"
                      title="Imprimir Comprovante A4"
                    >
                      <Printer className="w-4 h-4 inline" />
                    </button>

                    {isAlmoxarifeOrAdmin && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedConsumo(c);
                          setIsEstornoModalOpen(true);
                        }}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                        title="Estornar Entrega"
                      >
                        <RotateCcw className="w-4 h-4 inline" />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Novo Consumo */}
      {isNovoModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full p-6 border border-slate-200 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Registrar Entrega de Consumo Direto ({activeAreaSigla})
                </h3>
                <p className="text-xs text-slate-500">
                  Baixa direta do estoque com lote FEFO e bloqueio automático de vencidos.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsNovoModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateConsumo} className="space-y-4">
              {/* Setor e Recebedor */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Setor Atendido (Centro de Custo) *
                  </label>
                  <SearchableSelect
                    options={ccOptions}
                    value={novoCentroCustoId}
                    onChange={(val) => setNovoCentroCustoId(Number(val))}
                    placeholder="Selecione o Setor / Centro de Custo..."
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Responsável pelo Recebimento *
                  </label>
                  <input
                    type="text"
                    value={novoResponsavel}
                    onChange={(e) => setNovoResponsavel(e.target.value)}
                    placeholder="Nome de quem recebeu o material no setor"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:border-[#00237D]"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Observações Gerais (Opcional)
                </label>
                <input
                  type="text"
                  value={novaObservacao}
                  onChange={(e) => setNovaObservacao(e.target.value)}
                  placeholder="Ex: Entrega urgente para plantão, reposição emergencial..."
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:border-[#00237D]"
                />
              </div>

              {/* Seção Adicionar Itens */}
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  Adicionar Item do Catálogo da Área ({activeAreaSigla})
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                  <div className="md:col-span-5">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Produto
                    </label>
                    <SearchableSelect
                      options={productOptions}
                      value={prodSelectId}
                      onChange={(val) => setProdSelectId(Number(val))}
                      placeholder="Buscar produto..."
                    />
                  </div>

                  <div className="md:col-span-4">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Lote (FEFO)
                    </label>
                    <select
                      value={loteSelectId}
                      onChange={(e) => setLoteSelectId(Number(e.target.value))}
                      disabled={loadingLotes || lotesProduto.length === 0}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs focus:outline-none focus:border-[#00237D]"
                    >
                      {loadingLotes ? (
                        <option>Carregando lotes...</option>
                      ) : lotesProduto.length === 0 ? (
                        <option value="0">Nenhum lote com saldo</option>
                      ) : (
                        lotesProduto.map((l) => (
                          <option key={l.id} value={l.id}>
                            Lote: {l.numero_lote} | Val: {l.data_validade || 'S/V'} | Saldo: {l.quantidade_atual}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Quantidade
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0.01"
                      value={itemQuantidade}
                      onChange={(e) => setItemQuantidade(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs focus:outline-none focus:border-[#00237D]"
                    />
                  </div>

                  <div className="md:col-span-1">
                    <button
                      type="button"
                      onClick={handleAddItem}
                      className="w-full py-1.5 bg-slate-900 hover:bg-[#00237D] text-white rounded text-xs font-bold transition-colors cursor-pointer"
                      title="Incluir Item"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {/* Lista de Itens a Entregar */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-[10px] font-bold text-slate-600 uppercase">
                    <tr>
                      <th className="px-3 py-2">Item</th>
                      <th className="px-3 py-2">Lote</th>
                      <th className="px-3 py-2">Validade</th>
                      <th className="px-3 py-2 text-right">Qtd</th>
                      <th className="px-3 py-2 text-center w-12">Remover</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {itensNovoConsumo.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-slate-400">
                          Nenhum item adicionado à entrega.
                        </td>
                      </tr>
                    ) : (
                      itensNovoConsumo.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="px-3 py-2">
                            <div className="font-semibold text-slate-900">{item.produto_nome}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{item.produto_codigo}</div>
                          </td>
                          <td className="px-3 py-2 font-mono">{item.numero_lote}</td>
                          <td className="px-3 py-2">{item.data_validade || 'SEM VALIDADE'}</td>
                          <td className="px-3 py-2 text-right font-bold text-slate-900">
                            {item.quantidade} {item.unidade_medida}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Botões do Formulário */}
              <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsNovoModalOpen(false)}
                  className="px-3.5 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading || itensNovoConsumo.length === 0}
                  className="px-5 py-2 text-xs font-bold text-white bg-[#00237D] hover:bg-[#001c66] rounded-lg transition-colors shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {loading ? 'Processando baixa...' : 'Confirmar Entrega e Gerar Comprovante'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Detalhes */}
      {isDetalhesModalOpen && selectedConsumo && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 font-mono text-[#00237D]">
                  {selectedConsumo.numero_consumo}
                </h3>
                <p className="text-xs text-slate-500">
                  Data: {new Date(selectedConsumo.data_consumo).toLocaleString('pt-BR')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsDetalhesModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="text-[10px] font-bold text-slate-500 uppercase">Setor Atendido</div>
                <div className="font-semibold text-slate-800 text-sm mt-0.5">
                  {selectedConsumo.centro_custo_nome}
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="text-[10px] font-bold text-slate-500 uppercase">Responsável pelo Recebimento</div>
                <div className="font-semibold text-slate-800 text-sm mt-0.5">
                  {selectedConsumo.responsavel_recebimento}
                </div>
              </div>
            </div>

            {selectedConsumo.observacao && (
              <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-lg text-xs text-amber-900 mb-4">
                <strong>Observações:</strong> {selectedConsumo.observacao}
              </div>
            )}

            <div className="border border-slate-200 rounded-lg overflow-hidden mb-4">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-[10px] font-bold text-slate-600 uppercase">
                  <tr>
                    <th className="px-3 py-2">Produto</th>
                    <th className="px-3 py-2">Lote</th>
                    <th className="px-3 py-2">Validade</th>
                    <th className="px-3 py-2 text-right">Qtd Entregue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedConsumo.itens?.map((it, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 font-medium text-slate-900">
                        {it.produto_nome || `Produto #${it.produto_id}`}
                      </td>
                      <td className="px-3 py-2 font-mono">{it.numero_lote || '—'}</td>
                      <td className="px-3 py-2">{it.data_validade || 'SEM VALIDADE'}</td>
                      <td className="px-3 py-2 text-right font-bold text-slate-900">
                        {it.quantidade} {it.unidade_medida || 'UN'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setIsDetalhesModalOpen(false);
                  setIsPrintModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir A4</span>
              </button>
              <button
                type="button"
                onClick={() => setIsDetalhesModalOpen(false)}
                className="px-4 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Estorno */}
      {isEstornoModalOpen && selectedConsumo && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-1">
              Estorno de Consumo Direto
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Consumo: <strong className="font-mono">{selectedConsumo.numero_consumo}</strong>
            </p>

            <form onSubmit={handleConfirmEstorno} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Justificativa Obrigatória do Estorno *
                </label>
                <textarea
                  rows={3}
                  value={justificativaEstorno}
                  onChange={(e) => setJustificativaEstorno(e.target.value)}
                  placeholder="Explique o motivo do cancelamento ou estorno da entrega..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:border-[#00237D]"
                  required
                />
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  O estorno devolverá a quantidade de cada item de volta ao lote e estoque original, gerando movimentação de estorno imutável.
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsEstornoModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                  {loading ? 'Processando...' : 'Confirmar Estorno'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal / Visualizador de Impressão A4 */}
      {isPrintModalOpen && selectedConsumo && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full p-8 border border-slate-300 my-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 mb-6 print:hidden">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-[#00237D]" />
                <h3 className="text-sm font-bold text-slate-900">
                  Comprovante Oficial de Consumo Direto (Formato A4)
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={triggerDirectPrint}
                  className="px-3 py-1.5 bg-[#00237D] hover:bg-[#001c66] text-white text-xs font-bold rounded-lg shadow-sm transition-colors cursor-pointer"
                >
                  Imprimir Comprovante
                </button>
                <button
                  type="button"
                  onClick={() => setIsPrintModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Documento A4 Imprimível */}
            <div ref={printRef} className="space-y-6 text-slate-800 p-2 print:p-0">
              {/* Cabeçalho */}
              <div className="flex items-center justify-between border-b-2 border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 border border-slate-300 rounded flex items-center justify-center p-1">
                    <img src="/logo.png" alt="Logo" className="max-w-full max-h-full object-contain" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black tracking-tight text-slate-900">
                      COMPROVANTE DE CONSUMO DIRETO
                    </h2>
                    <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                      Área: {activeAreaSigla} — {activeAreaNome}
                    </p>
                  </div>
                </div>
                <div className="text-right font-mono">
                  <div className="text-base font-black text-[#00237D]">
                    {selectedConsumo.numero_consumo}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {new Date(selectedConsumo.data_consumo).toLocaleString('pt-BR')}
                  </div>
                </div>
              </div>

              {/* Informações da Entrega */}
              <div className="grid grid-cols-2 gap-4 text-xs border border-slate-300 rounded p-3 bg-slate-50/50">
                <div>
                  <span className="font-bold text-slate-600 uppercase text-[10px] block">
                    Setor Assistencial Atendido:
                  </span>
                  <span className="text-sm font-bold text-slate-900">
                    {selectedConsumo.centro_custo_nome}
                  </span>
                  {selectedConsumo.centro_custo_codigo && (
                    <span className="text-xs text-slate-500 ml-1">
                      (Cód: {selectedConsumo.centro_custo_codigo})
                    </span>
                  )}
                </div>

                <div>
                  <span className="font-bold text-slate-600 uppercase text-[10px] block">
                    Responsável pelo Recebimento:
                  </span>
                  <span className="text-sm font-bold text-slate-900">
                    {selectedConsumo.responsavel_recebimento}
                  </span>
                </div>
              </div>

              {/* Tabela de Itens */}
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Itens Entregues
                </div>
                <table className="w-full text-left border-collapse border border-slate-300 text-xs">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-300 text-[10px] font-bold text-slate-700 uppercase">
                      <th className="p-2 border-r border-slate-300">Cód.</th>
                      <th className="p-2 border-r border-slate-300">Descrição do Material</th>
                      <th className="p-2 border-r border-slate-300">Lote</th>
                      <th className="p-2 border-r border-slate-300">Validade</th>
                      <th className="p-2 text-right">Qtd</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedConsumo.itens?.map((it, idx) => (
                      <tr key={idx} className="border-b border-slate-200">
                        <td className="p-2 font-mono border-r border-slate-200">{it.produto_codigo || it.produto_id}</td>
                        <td className="p-2 font-medium border-r border-slate-200">{it.produto_nome}</td>
                        <td className="p-2 font-mono border-r border-slate-200">{it.numero_lote || 'SEM LOTE'}</td>
                        <td className="p-2 border-r border-slate-200">{it.data_validade || 'S/V'}</td>
                        <td className="p-2 text-right font-bold">{it.quantidade} {it.unidade_medida || 'UN'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Bloco de Assinaturas */}
              <div className="pt-12 grid grid-cols-2 gap-12 text-center text-xs">
                <div>
                  <div className="border-t border-slate-800 pt-2 font-semibold">
                    {selectedConsumo.usuario_nome || 'Almoxarife Responsável'}
                  </div>
                  <div className="text-[10px] text-slate-500 uppercase">
                    Entregue por (Dispensação)
                  </div>
                </div>

                <div>
                  <div className="border-t border-slate-800 pt-2 font-semibold">
                    {selectedConsumo.responsavel_recebimento}
                  </div>
                  <div className="text-[10px] text-slate-500 uppercase">
                    Recebido por (Setor Atendido)
                  </div>
                </div>
              </div>

              {/* Rodapé Oficial Exigido */}
              <div className="pt-8 text-center text-[11px] text-slate-400 border-t border-slate-200">
                Desenvolvido por Bruno Rocha - DPO
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
