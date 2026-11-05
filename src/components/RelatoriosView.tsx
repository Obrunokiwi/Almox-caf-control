import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileText,
  Printer,
  Download,
  FileSpreadsheet,
  Filter,
  ChevronDown,
  ChevronUp,
  ArrowUp,
  ArrowDown,
  CheckSquare,
  Square,
  RefreshCw,
  Search,
  AlertTriangle,
  Info,
  Layers,
  Calendar,
  Columns,
  Sliders,
  BarChart3,
  ShieldCheck,
  Eye,
  ArrowLeft,
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { CentroCusto, Produto, Movimentacao, DashboardStats, Usuario } from '../types';

export interface RelatoriosViewProps {
  centrosCusto: CentroCusto[];
  produtos: Produto[];
  movimentacoes: Movimentacao[];
  stats: DashboardStats | any | null;
  activeUnidade?: { id?: number; sigla?: string; nome?: string } | any | null;
  currentUser?: Usuario | null;
  onVoltar?: () => void;
  onNavigate?: (tab: string) => void;
}

export type MultiFilterMode = 'todos' | 'nenhum' | 'selecionados';

export interface MultiSelectFilterState<T = string | number> {
  modo: MultiFilterMode;
  valores: T[];
}

interface MultiSelectBoxOption<T = string | number> {
  id: T;
  label: string;
  sublabel?: string;
}

interface MultiSelectBoxProps<T extends string | number> {
  title: string;
  subtitle?: string;
  options: MultiSelectBoxOption<T>[];
  state: MultiSelectFilterState<T>;
  onChange: (next: MultiSelectFilterState<T>) => void;
  maxHeight?: string;
  emptyMessage?: string;
}

function MultiSelectCheckboxList<T extends string | number>({
  title,
  subtitle,
  options,
  state,
  onChange,
  maxHeight = 'max-h-48',
  emptyMessage = 'Nenhuma opção disponível para os critérios atuais.',
}: MultiSelectBoxProps<T>) {
  const [busca, setBusca] = useState('');

  const allIds = useMemo(() => options.map((o) => o.id), [options]);

  const selectedSet = useMemo(() => {
    if (state.modo === 'todos') return new Set<T>(allIds);
    if (state.modo === 'nenhum') return new Set<T>();
    return new Set<T>(state.valores);
  }, [state.modo, state.valores, allIds]);

  const filteredOptions = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.sublabel && o.sublabel.toLowerCase().includes(q)) ||
        String(o.id).toLowerCase().includes(q)
    );
  }, [options, busca]);

  const toggleItem = (id: T) => {
    const nextSet = new Set<T>(selectedSet);
    if (nextSet.has(id)) {
      nextSet.delete(id);
    } else {
      nextSet.add(id);
    }
    if (nextSet.size === 0) {
      onChange({ modo: 'nenhum', valores: [] });
    } else if (nextSet.size === allIds.length && allIds.length > 0) {
      onChange({ modo: 'todos', valores: allIds });
    } else {
      onChange({ modo: 'selecionados', valores: Array.from(nextSet) });
    }
  };

  const marcarTodos = () => {
    if (!busca.trim()) {
      onChange({ modo: 'todos', valores: allIds });
    } else {
      const nextSet = new Set<T>(selectedSet);
      for (const o of filteredOptions) nextSet.add(o.id);
      if (nextSet.size === allIds.length && allIds.length > 0) {
        onChange({ modo: 'todos', valores: allIds });
      } else {
        onChange({ modo: 'selecionados', valores: Array.from(nextSet) });
      }
    }
  };

  const desmarcarTodos = () => {
    if (!busca.trim()) {
      onChange({ modo: 'nenhum', valores: [] });
    } else {
      const nextSet = new Set<T>(selectedSet);
      for (const o of filteredOptions) nextSet.delete(o.id);
      if (nextSet.size === 0) {
        onChange({ modo: 'nenhum', valores: [] });
      } else {
        onChange({ modo: 'selecionados', valores: Array.from(nextSet) });
      }
    }
  };

  const inverterSelecao = () => {
    const targetList = busca.trim() ? filteredOptions : options;
    const nextSet = new Set<T>(selectedSet);
    for (const o of targetList) {
      if (nextSet.has(o.id)) {
        nextSet.delete(o.id);
      } else {
        nextSet.add(o.id);
      }
    }
    if (nextSet.size === 0) {
      onChange({ modo: 'nenhum', valores: [] });
    } else if (nextSet.size === allIds.length && allIds.length > 0) {
      onChange({ modo: 'todos', valores: allIds });
    } else {
      onChange({ modo: 'selecionados', valores: Array.from(nextSet) });
    }
  };

  const badgeStatus =
    state.modo === 'todos'
      ? { text: `Todos selecionados (${allIds.length})`, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
      : state.modo === 'nenhum' || selectedSet.size === 0
      ? { text: 'Nenhum selecionado (0)', cls: 'bg-rose-50 text-rose-700 border-rose-200' }
      : { text: `${selectedSet.size} de ${allIds.length} selecionado(s)`, cls: 'bg-blue-50 text-blue-700 border-blue-200' };

  return (
    <div className="border border-slate-200 rounded-lg bg-white overflow-hidden flex flex-col">
      <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">{title}</span>
          {subtitle && <p className="text-[11px] text-slate-500">{subtitle}</p>}
        </div>
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${badgeStatus.cls}`}>
          {badgeStatus.text}
        </span>
      </div>

      <div className="p-2 border-b border-slate-100 bg-white space-y-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Pesquisar na lista..."
            className="w-full pl-8 pr-2.5 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={marcarTodos}
            className="px-2 py-1 text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition-colors"
          >
            Marcar todos
          </button>
          <button
            type="button"
            onClick={desmarcarTodos}
            className="px-2 py-1 text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition-colors"
          >
            Desmarcar todos
          </button>
          <button
            type="button"
            onClick={inverterSelecao}
            className="px-2 py-1 text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded transition-colors"
          >
            Inverter seleção
          </button>
        </div>
      </div>

      <div className={`${maxHeight} overflow-y-auto divide-y divide-slate-100 p-1.5`}>
        {filteredOptions.length === 0 ? (
          <div className="py-4 px-2 text-center text-xs text-slate-400">{emptyMessage}</div>
        ) : (
          filteredOptions.map((opt) => {
            const checked = selectedSet.has(opt.id);
            return (
              <label
                key={String(opt.id)}
                className={`flex items-start gap-2 px-2 py-1.5 rounded cursor-pointer text-xs transition-colors ${
                  checked ? 'bg-blue-50/60 text-slate-900 font-medium' : 'hover:bg-slate-50 text-slate-700'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleItem(opt.id)}
                  className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <div className="flex-1 min-w-0">
                  <div className="break-words leading-snug">{opt.label}</div>
                  {opt.sublabel && <div className="text-[10px] text-slate-500">{opt.sublabel}</div>}
                </div>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}

interface ColunaConfig {
  id: string;
  label: string;
  tipo: 'texto' | 'data' | 'numero' | 'moeda' | 'percentual' | 'classe_abc';
  requerCusto?: boolean;
  requerAbc?: boolean;
  basesCompativeis: ('saldo_estoque' | 'movimentacoes' | 'consumo_saidas')[];
}

const TODAS_COLUNAS_CONSTRUTOR: ColunaConfig[] = [
  { id: 'codigo', label: 'Código', tipo: 'texto', basesCompativeis: ['saldo_estoque', 'movimentacoes', 'consumo_saidas'] },
  { id: 'descricao', label: 'Descrição Completa', tipo: 'texto', basesCompativeis: ['saldo_estoque', 'movimentacoes', 'consumo_saidas'] },
  { id: 'grupo', label: 'Grupo', tipo: 'texto', basesCompativeis: ['saldo_estoque', 'movimentacoes', 'consumo_saidas'] },
  { id: 'subgrupo', label: 'Subgrupo', tipo: 'texto', basesCompativeis: ['saldo_estoque', 'movimentacoes', 'consumo_saidas'] },
  { id: 'unidade', label: 'Unidade', tipo: 'texto', basesCompativeis: ['saldo_estoque', 'movimentacoes', 'consumo_saidas'] },
  { id: 'lote', label: 'Lote', tipo: 'texto', basesCompativeis: ['saldo_estoque', 'movimentacoes', 'consumo_saidas'] },
  { id: 'validade', label: 'Validade', tipo: 'data', basesCompativeis: ['saldo_estoque', 'movimentacoes', 'consumo_saidas'] },
  { id: 'centro_custo', label: 'Centro de Custo', tipo: 'texto', basesCompativeis: ['movimentacoes', 'consumo_saidas', 'saldo_estoque'] },
  { id: 'data', label: 'Data', tipo: 'data', basesCompativeis: ['saldo_estoque', 'movimentacoes', 'consumo_saidas'] },
  { id: 'tipo_movimentacao', label: 'Tipo de Movimentação', tipo: 'texto', basesCompativeis: ['movimentacoes', 'consumo_saidas', 'saldo_estoque'] },
  { id: 'documento', label: 'Documento', tipo: 'texto', basesCompativeis: ['movimentacoes', 'consumo_saidas'] },
  { id: 'saldo_inicial', label: 'Saldo Inicial', tipo: 'numero', basesCompativeis: ['movimentacoes', 'consumo_saidas'] },
  { id: 'entradas', label: 'Entradas', tipo: 'numero', basesCompativeis: ['saldo_estoque', 'movimentacoes', 'consumo_saidas'] },
  { id: 'saidas', label: 'Saídas', tipo: 'numero', basesCompativeis: ['saldo_estoque', 'movimentacoes', 'consumo_saidas'] },
  { id: 'saldo_final', label: 'Saldo Final', tipo: 'numero', basesCompativeis: ['saldo_estoque', 'movimentacoes', 'consumo_saidas'] },
  { id: 'quantidade_consumida', label: 'Quantidade Consumida', tipo: 'numero', basesCompativeis: ['consumo_saidas', 'movimentacoes'] },
  { id: 'custo_unitario', label: 'Custo Unitário', tipo: 'moeda', requerCusto: true, basesCompativeis: ['saldo_estoque', 'movimentacoes', 'consumo_saidas'] },
  { id: 'valor_total', label: 'Valor Total', tipo: 'moeda', requerCusto: true, basesCompativeis: ['saldo_estoque', 'movimentacoes', 'consumo_saidas'] },
  { id: 'classe_abc', label: 'Classe ABC', tipo: 'classe_abc', requerAbc: true, basesCompativeis: ['saldo_estoque', 'movimentacoes', 'consumo_saidas'] },
  { id: 'participacao_abc', label: '% Participação', tipo: 'percentual', requerAbc: true, basesCompativeis: ['saldo_estoque', 'movimentacoes', 'consumo_saidas'] },
  { id: 'acumulado_abc', label: '% Acumulado', tipo: 'percentual', requerAbc: true, basesCompativeis: ['saldo_estoque', 'movimentacoes', 'consumo_saidas'] },
];

const COLUNAS_REQUISITANTE = [
  { id: 'numero_requisicao', label: 'Nº da Requisição', tipo: 'texto' as const },
  { id: 'data_solicitacao', label: 'Data da Solicitação', tipo: 'data' as const },
  { id: 'centro_custo_nome', label: 'Centro de Custo', tipo: 'texto' as const },
  { id: 'status', label: 'Status da Requisição', tipo: 'texto' as const },
  { id: 'produto_codigo', label: 'Código do Item', tipo: 'texto' as const },
  { id: 'produto_nome', label: 'Descrição Completa do Item', tipo: 'texto' as const },
  { id: 'unidade_medida', label: 'Unidade', tipo: 'texto' as const },
  { id: 'quantidade_solicitada', label: 'Qtd. Solicitada', tipo: 'numero' as const },
  { id: 'quantidade_atendida', label: 'Qtd. Atendida', tipo: 'numero' as const },
  { id: 'status_item', label: 'Decisão do Item', tipo: 'texto' as const },
];

export const RelatoriosView: React.FC<RelatoriosViewProps> = ({
  activeUnidade,
  currentUser,
  onVoltar,
}) => {
  const isRequisitante = currentUser?.perfil === 'requisitante';
  const areaSigla =
    activeUnidade?.sigla ||
    currentUser?.area_sigla ||
    sessionStorage.getItem('multi_almox_area_sigla') ||
    localStorage.getItem('multi_almox_area_sigla') ||
    'ALM';

  const getAuthHeaders = useCallback(() => {
    const token =
      sessionStorage.getItem('multi_almox_token') ||
      localStorage.getItem('multi_almox_token') ||
      sessionStorage.getItem('token') ||
      localStorage.getItem('token') ||
      localStorage.getItem('almox_token');
    const authHeader = token
      ? `Bearer ${token}`
      : currentUser?.id
      ? `user:${currentUser.id}`
      : undefined;
    return {
      'Content-Type': 'application/json',
      ...(authHeader ? { Authorization: authHeader } : {}),
      'X-Area-Sigla': areaSigla,
    };
  }, [areaSigla, currentUser?.id]);

  // Metadados vindos do banco da área ativa
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [metadados, setMetadados] = useState<any>(null);

  // Blocos recolhíveis do Construtor Dinâmico
  const [openBlocks, setOpenBlocks] = useState<Record<string, boolean>>({
    analise: true,
    datas: true,
    filtros: true,
    colunas: true,
    organizacao: true,
    curva_abc: false,
  });

  const toggleBlock = (key: string) => {
    setOpenBlocks((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // ==========================================================================
  // ESTADOS: PERFIL REQUISITANTE ("Minhas requisições")
  // ==========================================================================
  const [reqDataInicio, setReqDataInicio] = useState<string>('');
  const [reqDataFim, setReqDataFim] = useState<string>('');
  const [reqNumeroBusca, setReqNumeroBusca] = useState<string>('');
  const [reqStatusFiltro, setReqStatusFiltro] = useState<MultiSelectFilterState<string>>({
    modo: 'todos',
    valores: [],
  });
  const [reqProdutosFiltro, setReqProdutosFiltro] = useState<MultiSelectFilterState<number>>({
    modo: 'todos',
    valores: [],
  });
  const [reqColunasOrdem, setReqColunasOrdem] = useState<string[]>(COLUNAS_REQUISITANTE.map((c) => c.id));
  const [reqColunasMarcadas, setReqColunasMarcadas] = useState<Set<string>>(
    new Set(COLUNAS_REQUISITANTE.map((c) => c.id))
  );
  const [reqOrdenacaoCol, setReqOrdenacaoCol] = useState<string>('data_solicitacao');
  const [reqOrdenacaoSentido, setReqOrdenacaoSentido] = useState<'asc' | 'desc'>('desc');

  // ==========================================================================
  // ESTADOS: CONSTRUTOR DINÂMICO (ADMIN, TI_DPO, ALMOXARIFE)
  // ==========================================================================
  const hojeStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const inicioMesStr = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  }, []);

  const [nomeRelatorio, setNomeRelatorio] = useState<string>('');
  const [base, setBase] = useState<'saldo_estoque' | 'movimentacoes' | 'consumo_saidas'>('saldo_estoque');
  const [modoSaldo, setModoSaldo] = useState<'atual' | 'data_referencia'>('atual');
  const [dataReferencia, setDataReferencia] = useState<string>(hojeStr);
  const [dataInicio, setDataInicio] = useState<string>(inicioMesStr);
  const [dataFim, setDataFim] = useState<string>(hojeStr);

  // Consumo/saídas: tipos considerados e regra de devoluções/estornos
  const [tiposSaidaFiltro, setTiposSaidaFiltro] = useState<MultiSelectFilterState<string>>({
    modo: 'selecionados',
    valores: ['Atendimento de Requisição', 'Consumo Direto', 'Consumo', 'Saída / Requisição Padrão'],
  });
  const [tratamentoDevolucoes, setTratamentoDevolucoes] = useState<'liquido' | 'separado'>('liquido');
  const [origemCusto, setOrigemCusto] = useState<'cadastro_atual' | 'movimentacao_lote'>('cadastro_atual');

  // Filtros combináveis
  const [filtroCentrosCusto, setFiltroCentrosCusto] = useState<MultiSelectFilterState<number>>({
    modo: 'todos',
    valores: [],
  });
  const [filtroGrupos, setFiltroGrupos] = useState<MultiSelectFilterState<number>>({
    modo: 'todos',
    valores: [],
  });
  const [filtroSubgrupos, setFiltroSubgrupos] = useState<MultiSelectFilterState<number>>({
    modo: 'todos',
    valores: [],
  });
  const [filtroProdutos, setFiltroProdutos] = useState<MultiSelectFilterState<number>>({
    modo: 'todos',
    valores: [],
  });
  const [filtroUnidades, setFiltroUnidades] = useState<MultiSelectFilterState<string>>({
    modo: 'todos',
    valores: [],
  });
  const [filtroTiposMov, setFiltroTiposMov] = useState<MultiSelectFilterState<string>>({
    modo: 'todos',
    valores: [],
  });
  const [filtroLotes, setFiltroLotes] = useState<MultiSelectFilterState<string>>({
    modo: 'todos',
    valores: [],
  });
  const [incluirSemLote, setIncluirSemLote] = useState<boolean>(true);
  const [validadeInicio, setValidadeInicio] = useState<string>('');
  const [validadeFim, setValidadeFim] = useState<string>('');

  const [grandezaQuantidade, setGrandezaQuantidade] = useState<
    'saldo_final' | 'quantidade_consumida' | 'entradas' | 'saidas'
  >('saldo_final');
  const [qtdMin, setQtdMin] = useState<string>('');
  const [qtdMax, setQtdMax] = useState<string>('');
  const [grandezaValor, setGrandezaValor] = useState<'valor_total' | 'custo_unitario'>('valor_total');
  const [valorMin, setValorMin] = useState<string>('');
  const [valorMax, setValorMax] = useState<string>('');
  const [incluirZeros, setIncluirZeros] = useState<boolean>(false);

  // Colunas e Organização
  const [ordemColunas, setOrdemColunas] = useState<string[]>(TODAS_COLUNAS_CONSTRUTOR.map((c) => c.id));
  const [colunasMarcadas, setColunasMarcadas] = useState<Set<string>>(
    new Set(['codigo', 'descricao', 'grupo', 'subgrupo', 'unidade', 'lote', 'validade', 'saldo_final', 'custo_unitario', 'valor_total'])
  );
  const [detalhamento, setDetalhamento] = useState<'produto' | 'produto_lote' | 'movimentacao'>('produto');
  const [agrupamento, setAgrupamento] = useState<'nenhum' | 'grupo_subgrupo' | 'centro_custo'>('nenhum');
  const [ordenacaoColuna, setOrdenacaoColuna] = useState<string>('descricao');
  const [ordenacaoSentido, setOrdenacaoSentido] = useState<'asc' | 'desc'>('asc');
  const [exibirSubtotais, setExibirSubtotais] = useState<boolean>(true);
  const [exibirTotalGeral, setExibirTotalGeral] = useState<boolean>(true);
  const [exibirCustos, setExibirCustos] = useState<boolean>(true);

  // Curva ABC Configurável
  const [calcularAbc, setCalcularAbc] = useState<boolean>(false);
  const [indicadorAbc, setIndicadorAbc] = useState<
    'quantidade_consumida' | 'valor_consumo' | 'quantidade_estoque' | 'valor_estoque'
  >('valor_estoque');
  const [pctA, setPctA] = useState<string>('80');
  const [pctB, setPctB] = useState<string>('15');
  const [pctC, setPctC] = useState<string>('5');
  const [abrangenciaAbc, setAbrangenciaAbc] = useState<'geral' | 'por_agrupamento'>('geral');
  const [regraFronteiraAbc, setRegraFronteiraAbc] = useState<'incluir_na_atual' | 'mover_para_seguinte'>('incluir_na_atual');
  const [regraEmpateAbc, setRegraEmpateAbc] = useState<'manter_mesma_classe' | 'desempatar_codigo'>('manter_mesma_classe');
  const [classesExibidasAbc, setClassesExibidasAbc] = useState<Set<string>>(new Set(['A', 'B', 'C', 'SC']));

  // Resultado do Relatório Gerado
  const [loadingRelatorio, setLoadingRelatorio] = useState<boolean>(false);
  const [erroRelatorio, setErroRelatorio] = useState<string | null>(null);
  const [resultado, setResultado] = useState<any>(null);

  // Carregar metadados ao abrir ou trocar área
  useEffect(() => {
    let cancelado = false;
    const fetchMeta = async () => {
      setLoadingMeta(true);
      setMetaError(null);
      try {
        const resp = await fetch('/api/relatorios/metadados', {
          headers: getAuthHeaders(),
        });
        const data = await resp.json();
        if (!resp.ok) {
          throw new Error(data.error || 'Falha ao carregar metadados de relatórios.');
        }
        if (!cancelado) {
          setMetadados(data);
          setResultado(null);
        }
      } catch (err: any) {
        if (!cancelado) {
          setMetaError(err.message || 'Erro ao carregar metadados.');
        }
      } finally {
        if (!cancelado) {
          setLoadingMeta(false);
        }
      }
    };
    fetchMeta();
    return () => {
      cancelado = true;
    };
  }, [getAuthHeaders]);

  // Ajustar padrões compatíveis ao trocar a base de análise
  const handleChangeBase = (novaBase: 'saldo_estoque' | 'movimentacoes' | 'consumo_saidas') => {
    setBase(novaBase);
    if (novaBase === 'saldo_estoque') {
      if (detalhamento === 'movimentacao') setDetalhamento('produto');
      if (agrupamento === 'centro_custo') setAgrupamento('nenhum');
      setGrandezaQuantidade('saldo_final');
      if (indicadorAbc === 'quantidade_consumida' || indicadorAbc === 'valor_consumo') {
        setIndicadorAbc(exibirCustos ? 'valor_estoque' : 'quantidade_estoque');
      }
      setColunasMarcadas((prev) => {
        const next = new Set(prev);
        next.add('codigo');
        next.add('descricao');
        next.add('unidade');
        next.add('saldo_final');
        next.delete('quantidade_consumida');
        next.delete('documento');
        next.delete('saldo_inicial');
        return next;
      });
    } else if (novaBase === 'movimentacoes') {
      setDetalhamento('movimentacao');
      setGrandezaQuantidade('saidas');
      setColunasMarcadas((prev) => {
        const next = new Set(prev);
        next.add('data');
        next.add('codigo');
        next.add('descricao');
        next.add('unidade');
        next.add('tipo_movimentacao');
        next.add('centro_custo');
        next.add('documento');
        next.add('entradas');
        next.add('saidas');
        return next;
      });
    } else if (novaBase === 'consumo_saidas') {
      if (detalhamento === 'movimentacao') setDetalhamento('produto');
      setGrandezaQuantidade('quantidade_consumida');
      if (indicadorAbc === 'quantidade_estoque' || indicadorAbc === 'valor_estoque') {
        setIndicadorAbc(exibirCustos ? 'valor_consumo' : 'quantidade_consumida');
      }
      setColunasMarcadas((prev) => {
        const next = new Set(prev);
        next.add('codigo');
        next.add('descricao');
        next.add('unidade');
        next.add('centro_custo');
        next.add('quantidade_consumida');
        return next;
      });
    }
  };

  // Quando Calcular Curva ABC é marcado/desmarcado, habilita/desabilita as colunas ABC automaticamente
  const handleToggleCalcularAbc = (checked: boolean) => {
    setCalcularAbc(checked);
    setOpenBlocks((prev) => ({ ...prev, curva_abc: checked || prev.curva_abc }));
    setColunasMarcadas((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add('classe_abc');
        next.add('participacao_abc');
        next.add('acumulado_abc');
        setOrdenacaoColuna('participacao_abc');
        setOrdenacaoSentido('desc');
      } else {
        next.delete('classe_abc');
        next.delete('participacao_abc');
        next.delete('acumulado_abc');
      }
      return next;
    });
  };

  // Quando Exibir Custos é desmarcado, remove colunas financeiras e ajusta indicadores ABC dependentes de valor
  const handleToggleExibirCustos = (checked: boolean) => {
    setExibirCustos(checked);
    setColunasMarcadas((prev) => {
      const next = new Set(prev);
      if (!checked) {
        next.delete('custo_unitario');
        next.delete('valor_total');
      } else {
        next.add('custo_unitario');
        next.add('valor_total');
      }
      return next;
    });
    if (!checked) {
      if (indicadorAbc === 'valor_consumo') setIndicadorAbc('quantidade_consumida');
      if (indicadorAbc === 'valor_estoque') setIndicadorAbc('quantidade_estoque');
    }
  };

  // Subgrupos filtrados estritamente pelos grupos selecionados (sem deduzir vínculos pela descrição)
  const subgruposDisponiveis = useMemo(() => {
    const todosSubgrupos: any[] = metadados?.subgrupos || [];
    if (filtroGrupos.modo === 'todos') return todosSubgrupos;
    if (filtroGrupos.modo === 'nenhum') return [];
    const setGrupos = new Set(filtroGrupos.valores.map((g) => Number(g)));
    return todosSubgrupos.filter((sg) => sg.grupo_id !== null && setGrupos.has(Number(sg.grupo_id)));
  }, [metadados?.subgrupos, filtroGrupos]);

  // Produtos disponíveis respeitando Grupos e Subgrupos selecionados
  const produtosDisponiveis = useMemo(() => {
    const todosProdutos: any[] = metadados?.produtos || [];
    return todosProdutos.filter((p) => {
      if (filtroGrupos.modo === 'nenhum') return false;
      if (filtroGrupos.modo === 'selecionados') {
        if (!p.grupo_id || !filtroGrupos.valores.some((g) => Number(g) === Number(p.grupo_id))) return false;
      }
      if (filtroSubgrupos.modo === 'nenhum') return false;
      if (filtroSubgrupos.modo === 'selecionados') {
        if (!p.subgrupo_id || !filtroSubgrupos.valores.some((s) => Number(s) === Number(p.subgrupo_id))) return false;
      }
      return true;
    });
  }, [metadados?.produtos, filtroGrupos, filtroSubgrupos]);

  // Lotes disponíveis respeitando Produtos selecionados
  const lotesDisponiveis = useMemo(() => {
    const todosLotes: any[] = metadados?.lotes || [];
    const idsProdVisiveis = new Set(produtosDisponiveis.map((p) => Number(p.id)));
    return todosLotes.filter((l) => {
      if (!idsProdVisiveis.has(Number(l.produto_id))) return false;
      if (filtroProdutos.modo === 'nenhum') return false;
      if (filtroProdutos.modo === 'selecionados') {
        if (!filtroProdutos.valores.some((id) => Number(id) === Number(l.produto_id))) return false;
      }
      return true;
    });
  }, [metadados?.lotes, produtosDisponiveis, filtroProdutos]);

  // Validação da soma de percentuais da Curva ABC
  const validacaoAbcPct = useMemo(() => {
    const a = Number(pctA || 0);
    const b = Number(pctB || 0);
    const c = Number(pctC || 0);
    const soma = Math.round((a + b + c) * 100) / 100;
    const valido = a > 0 && b >= 0 && c >= 0 && Math.abs(soma - 100) <= 0.01;
    return {
      a,
      b,
      c,
      soma,
      valido,
      faixaA: `0% até ${a}%`,
      faixaB: `>${a}% até ${Math.round((a + b) * 100) / 100}%`,
      faixaC: `>${Math.round((a + b) * 100) / 100}% até 100%`,
    };
  }, [pctA, pctB, pctC]);

  // Colunas compatíveis com a configuração atual
  const colunasCompativeis = useMemo(() => {
    return TODAS_COLUNAS_CONSTRUTOR.filter((col) => {
      if (!col.basesCompativeis.includes(base)) return false;
      if (col.requerCusto && !exibirCustos) return false;
      if (col.requerAbc && !calcularAbc) return false;
      return true;
    });
  }, [base, exibirCustos, calcularAbc]);

  const moverColuna = (id: string, direcao: 'up' | 'down', isReq = false) => {
    const setter = isReq ? setReqColunasOrdem : setOrdemColunas;
    setter((prev) => {
      const idx = prev.indexOf(id);
      if (idx === -1) return prev;
      const targetIdx = direcao === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const copy = [...prev];
      const temp = copy[idx];
      copy[idx] = copy[targetIdx];
      copy[targetIdx] = temp;
      return copy;
    });
  };

  // Resumo textual dos filtros e parâmetros antes de gerar
  const resumoConfiguracoes = useMemo(() => {
    if (isRequisitante) {
      const itens: string[] = [];
      itens.push(`Escopo: Minhas Requisições (${currentUser?.nome || 'Usuário Autenticado'}) na área ${areaSigla}`);
      if (reqDataInicio || reqDataFim) {
        itens.push(
          `Período: ${reqDataInicio ? reqDataInicio.split('-').reverse().join('/') : 'Início'} até ${
            reqDataFim ? reqDataFim.split('-').reverse().join('/') : 'Hoje'
          } (dias integrais)`
        );
      } else {
        itens.push('Período: Todo o histórico de requisições do usuário');
      }
      if (reqNumeroBusca.trim()) {
        itens.push(`Nº da Requisição contendo: "${reqNumeroBusca.trim()}"`);
      }
      itens.push(
        `Status: ${
          reqStatusFiltro.modo === 'todos'
            ? 'Todos'
            : reqStatusFiltro.modo === 'nenhum'
            ? 'Nenhum selecionado (0)'
            : `${reqStatusFiltro.valores.length} status selecionado(s)`
        }`
      );
      itens.push(
        `Itens solicitados: ${
          reqProdutosFiltro.modo === 'todos'
            ? 'Todos'
            : reqProdutosFiltro.modo === 'nenhum'
            ? 'Nenhum selecionado (0)'
            : `${reqProdutosFiltro.valores.length} item(ns) selecionado(s)`
        }`
      );
      return itens;
    }

    const itens: string[] = [];
    const baseLabel =
      base === 'saldo_estoque'
        ? modoSaldo === 'data_referencia'
          ? `Saldo em Estoque na Data de Referência (${dataReferencia.split('-').reverse().join('/')} 23:59:59)`
          : 'Saldo em Estoque (Posição Atual)'
        : base === 'movimentacoes'
        ? `Movimentações (${dataInicio ? dataInicio.split('-').reverse().join('/') : 'Início'} a ${
            dataFim ? dataFim.split('-').reverse().join('/') : 'Hoje'
          })`
        : `Consumo / Saídas (${dataInicio ? dataInicio.split('-').reverse().join('/') : 'Início'} a ${
            dataFim ? dataFim.split('-').reverse().join('/') : 'Hoje'
          })`;
    itens.push(`Base e Período: ${baseLabel}`);

    if (base === 'consumo_saidas') {
      const qtdTipos =
        tiposSaidaFiltro.modo === 'todos'
          ? 'Todos os tipos de saída'
          : tiposSaidaFiltro.modo === 'nenhum'
          ? 'Nenhum tipo de saída marcado (0)'
          : `${tiposSaidaFiltro.valores.length} tipo(s) de saída marcado(s)`;
      itens.push(
        `Consumo e Devoluções: ${qtdTipos} | Devoluções/Estornos: ${
          tratamentoDevolucoes === 'liquido' ? 'Abatidos no Resultado Líquido (1x)' : 'Exibidos Separadamente'
        }`
      );
    }

    const descreverMulti = (nome: string, f: MultiSelectFilterState<any>) => {
      if (f.modo === 'todos') return `${nome}: Todos`;
      if (f.modo === 'nenhum' || f.valores.length === 0) return `${nome}: Nenhum selecionado (0)`;
      return `${nome}: ${f.valores.length} selecionado(s)`;
    };

    const partesFiltro: string[] = [
      descreverMulti('Grupos', filtroGrupos),
      descreverMulti('Subgrupos', filtroSubgrupos),
      descreverMulti('Produtos', filtroProdutos),
      descreverMulti('Unidades', filtroUnidades),
    ];
    if (base !== 'saldo_estoque') {
      partesFiltro.push(descreverMulti('Centros de Custo', filtroCentrosCusto));
    }
    if (base === 'movimentacoes') {
      partesFiltro.push(descreverMulti('Tipos de Movimentação', filtroTiposMov));
    }
    partesFiltro.push(descreverMulti('Lotes', filtroLotes));
    itens.push(`Filtros de Seleção: ${partesFiltro.join(' | ')}`);

    const faixasTxt: string[] = [];
    if (qtdMin !== '' || qtdMax !== '') {
      faixasTxt.push(`Faixa de Quantidade (${grandezaQuantidade}): ${qtdMin || 'Mín'} a ${qtdMax || 'Máx'}`);
    }
    if (valorMin !== '' || valorMax !== '') {
      faixasTxt.push(`Faixa de Valor (${grandezaValor}): R$ ${valorMin || '0'} a R$ ${valorMax || 'Máx'}`);
    }
    if (validadeInicio || validadeFim) {
      faixasTxt.push(`Validade: ${validadeInicio || 'Início'} a ${validadeFim || 'Fim'}`);
    }
    faixasTxt.push(incluirZeros ? 'Incluindo saldos/quantidades zero' : 'Excluindo saldos/quantidades zero');
    itens.push(`Regras Adicionais: ${faixasTxt.join(' | ')}`);

    const colsAtivas = ordemColunas.filter(
      (id) => colunasMarcadas.has(id) && colunasCompativeis.some((c) => c.id === id)
    );
    itens.push(
      `Organização: Detalhamento por ${
        detalhamento === 'produto' ? 'Produto' : detalhamento === 'produto_lote' ? 'Produto / Lote' : 'Movimentação'
      } | Agrupamento: ${
        agrupamento === 'nenhum'
          ? 'Sem agrupamento'
          : agrupamento === 'grupo_subgrupo'
          ? 'Grupo / Subgrupo'
          : 'Centro de Custo'
      } | ${colsAtivas.length} coluna(s) selecionada(s) | Custos: ${exibirCustos ? 'Visíveis' : 'Ocultos'}`
    );

    if (calcularAbc) {
      itens.push(
        `Curva ABC: Indicador "${indicadorAbc}" | Faixas A=${pctA}% / B=${pctB}% / C=${pctC}% | Abrangência: ${
          abrangenciaAbc === 'por_agrupamento' ? 'Por Agrupamento' : 'Geral'
        } | Classes exibidas: ${Array.from(classesExibidasAbc).join(', ')}`
      );
    }

    return itens;
  }, [
    isRequisitante,
    currentUser?.nome,
    areaSigla,
    reqDataInicio,
    reqDataFim,
    reqNumeroBusca,
    reqStatusFiltro,
    reqProdutosFiltro,
    base,
    modoSaldo,
    dataReferencia,
    dataInicio,
    dataFim,
    tiposSaidaFiltro,
    tratamentoDevolucoes,
    filtroGrupos,
    filtroSubgrupos,
    filtroProdutos,
    filtroUnidades,
    filtroCentrosCusto,
    filtroTiposMov,
    filtroLotes,
    qtdMin,
    qtdMax,
    grandezaQuantidade,
    valorMin,
    valorMax,
    grandezaValor,
    validadeInicio,
    validadeFim,
    incluirZeros,
    ordemColunas,
    colunasMarcadas,
    colunasCompativeis,
    detalhamento,
    agrupamento,
    exibirCustos,
    calcularAbc,
    indicadorAbc,
    pctA,
    pctB,
    pctC,
    abrangenciaAbc,
    classesExibidasAbc,
  ]);

  // Função para formatar valor de célula para exibição em tela e PDF
  const formatarCelula = (valor: any, tipo: string): string => {
    if (valor === null || valor === undefined || valor === '') {
      return tipo === 'moeda' ? 'Sem custo' : '-';
    }
    if (tipo === 'data') {
      const s = String(valor);
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        return s.split('-').reverse().join('/');
      }
      if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s)) {
        const [dtPart, tmPart] = s.replace('T', ' ').split(' ');
        return `${dtPart.split('-').reverse().join('/')} ${tmPart.slice(0, 5)}`;
      }
      return s;
    }
    if (tipo === 'numero') {
      const n = Number(valor);
      if (Number.isNaN(n)) return String(valor);
      return n.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
    }
    if (tipo === 'moeda') {
      const n = Number(valor);
      if (Number.isNaN(n)) return String(valor);
      return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4 });
    }
    if (tipo === 'percentual') {
      const n = Number(valor);
      if (Number.isNaN(n)) return '-';
      return `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
    }
    return String(valor);
  };

  // ==========================================================================
  // EXECUÇÃO DA CONSULTA CONFIGURADA
  // ==========================================================================
  const executarConsulta = async (): Promise<any | null> => {
    if (!isRequisitante && calcularAbc && !validacaoAbcPct.valido) {
      setErroRelatorio(
        `Os percentuais da Curva ABC devem somar 100%. Soma atual: ${validacaoAbcPct.soma}%.`
      );
      return null;
    }

    setLoadingRelatorio(true);
    setErroRelatorio(null);

    try {
      let payload: any;
      if (isRequisitante) {
        const colsOrdenadas = reqColunasOrdem.filter((id) => reqColunasMarcadas.has(id));
        payload = {
          data_inicio: reqDataInicio || null,
          data_fim: reqDataFim || null,
          numero_requisicao: reqNumeroBusca.trim() || null,
          status_filtro: reqStatusFiltro,
          produtos_filtro: reqProdutosFiltro,
          colunas_selecionadas: colsOrdenadas,
          ordenacao_coluna: reqOrdenacaoCol,
          ordenacao_sentido: reqOrdenacaoSentido,
        };
      } else {
        const colsOrdenadas = ordemColunas.filter(
          (id) => colunasMarcadas.has(id) && colunasCompativeis.some((c) => c.id === id)
        );
        payload = {
          nome_relatorio: nomeRelatorio.trim() || undefined,
          base,
          modo_saldo: modoSaldo,
          data_referencia: dataReferencia,
          data_inicio: dataInicio,
          data_fim: dataFim,
          tipos_saida_considerados: tiposSaidaFiltro,
          tratamento_devolucoes: tratamentoDevolucoes,
          origem_custo: origemCusto,
          detalhamento,
          agrupamento,
          ordenacao_coluna: ordenacaoColuna,
          ordenacao_sentido: ordenacaoSentido,
          exibir_subtotais: exibirSubtotais,
          exibir_total_geral: exibirTotalGeral,
          exibir_custos: exibirCustos,
          colunas: colsOrdenadas,
          filtros: {
            centros_custo: filtroCentrosCusto,
            grupos: filtroGrupos,
            subgrupos: filtroSubgrupos,
            produtos: filtroProdutos,
            unidades_medida: filtroUnidades,
            tipos_movimentacao: filtroTiposMov,
            lotes: filtroLotes,
            incluir_sem_lote: incluirSemLote,
            validade_inicio: validadeInicio || null,
            validade_fim: validadeFim || null,
            grandeza_quantidade: grandezaQuantidade,
            qtd_min: qtdMin !== '' ? Number(qtdMin) : null,
            qtd_max: qtdMax !== '' ? Number(qtdMax) : null,
            grandeza_valor: grandezaValor,
            valor_min: valorMin !== '' ? Number(valorMin) : null,
            valor_max: valorMax !== '' ? Number(valorMax) : null,
            incluir_zeros: incluirZeros,
          },
          curva_abc: {
            calcular_abc: calcularAbc,
            indicador: indicadorAbc,
            pct_a: Number(pctA || 80),
            pct_b: Number(pctB || 15),
            pct_c: Number(pctC || 5),
            abrangencia: abrangenciaAbc,
            regra_fronteira: regraFronteiraAbc,
            regra_empate: regraEmpateAbc,
            classes_exibidas: Array.from(classesExibidasAbc),
          },
        };
      }

      const resp = await fetch('/api/relatorios/dinamico', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Erro ao gerar relatório.');
      }
      setResultado(data);
      return data;
    } catch (err: any) {
      setErroRelatorio(err.message || 'Falha ao processar relatório.');
      return null;
    } finally {
      setLoadingRelatorio(false);
    }
  };

  // ==========================================================================
  // IMPRESSÃO / EXPORTAÇÃO EM PDF (COM CABEÇALHO REPETIDO POR PÁGINA)
  // ==========================================================================
  const gerarPdfRelatorio = async (modo: 'download' | 'print') => {
    const dadosRel = resultado || (await executarConsulta());
    if (!dadosRel) return;

    const cols: { id: string; label: string; tipo: string }[] = dadosRel.colunas || [];
    const orientacao = cols.length > 6 ? 'landscape' : 'portrait';
    const doc = new jsPDF({ orientation: orientacao, unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    const tituloDoc = String(dadosRel.titulo || 'Relatório Dinâmico');
    const areaTexto = `${dadosRel.area_nome || areaSigla} (${dadosRel.area_sigla || areaSigla})`;
    const emissaoTexto = `Emitido em: ${dadosRel.data_emissao} | Emitente: ${dadosRel.usuario_emissor}`;

    const linhasCabecalhoMeta = resumoConfiguracoes;

    // Montar linhas da tabela (incluindo cabeçalhos de grupo, subtotais e total geral quando ativos)
    const tableBody: any[][] = [];

    const montarLinhaSubtotal = (rotulo: string, sub: any) => {
      return cols.map((col, idx) => {
        if (idx === 0) return rotulo;
        if (['entradas', 'saidas', 'quantidade_consumida', 'saldo_inicial', 'saldo_final'].includes(col.id)) {
          if (!sub.mesma_unidade) return 'Unidades mistas';
          if (sub[col.id] === null || sub[col.id] === undefined) return '-';
          return `${formatarCelula(sub[col.id], 'numero')} ${sub.unidade || ''}`.trim();
        }
        if (col.id === 'custo_unitario') return '-'; // Jamais somar custos unitários
        if (col.id === 'valor_total') {
          return sub.valor_total !== null && sub.valor_total !== undefined
            ? formatarCelula(sub.valor_total, 'moeda')
            : '-';
        }
        return '';
      });
    };

    if (dadosRel.grupos_render && Array.isArray(dadosRel.grupos_render)) {
      for (const grp of dadosRel.grupos_render) {
        tableBody.push([
          {
            content: `AGRUPAMENTO: ${grp.titulo} (${grp.linhas.length} registro(s))`,
            colSpan: cols.length,
            styles: { fillColor: [226, 232, 240], textColor: [15, 23, 42], fontStyle: 'bold' },
          },
        ]);
        for (const r of grp.linhas) {
          tableBody.push(cols.map((c) => formatarCelula(r[c.id], c.tipo)));
        }
        if (grp.subtotal) {
          tableBody.push(
            montarLinhaSubtotal(`Subtotal (${grp.titulo})`, grp.subtotal).map((cell) => ({
              content: cell,
              styles: { fillColor: [241, 245, 249], fontStyle: 'bold', textColor: [30, 41, 59] },
            }))
          );
        }
      }
    } else {
      for (const r of dadosRel.linhas || []) {
        tableBody.push(cols.map((c) => formatarCelula(r[c.id], c.tipo)));
      }
    }

    if (dadosRel.total_geral && !dadosRel.restrito_requisitante) {
      tableBody.push(
        montarLinhaSubtotal('TOTAL GERAL', dadosRel.total_geral).map((cell) => ({
          content: cell,
          styles: { fillColor: [30, 41, 59], fontStyle: 'bold', textColor: [255, 255, 255] },
        }))
      );
    } else if (dadosRel.total_geral && dadosRel.restrito_requisitante) {
      const tg = dadosRel.total_geral;
      tableBody.push(
        cols.map((c, idx) => ({
          content:
            idx === 0
              ? 'TOTAL GERAL'
              : c.id === 'quantidade_solicitada'
              ? tg.unidades_mistas
                ? 'Unidades mistas'
                : `${formatarCelula(tg.quantidade_solicitada, 'numero')} ${tg.unidade_medida || ''}`
              : c.id === 'quantidade_atendida'
              ? tg.unidades_mistas
                ? 'Unidades mistas'
                : `${formatarCelula(tg.quantidade_atendida, 'numero')} ${tg.unidade_medida || ''}`
              : '',
          styles: { fillColor: [30, 41, 59], fontStyle: 'bold', textColor: [255, 255, 255] },
        }))
      );
    }

    // Calcular espaço de topo para repetir cabeçalho institucional em todas as páginas
    const headerTopMargin = 38 + Math.min(linhasCabecalhoMeta.length * 4, 24);

    autoTable(doc, {
      startY: headerTopMargin,
      margin: { top: headerTopMargin, left: 10, right: 10, bottom: 14 },
      head: [cols.map((c) => c.label)],
      body: tableBody,
      showHead: 'everyPage',
      styles: {
        fontSize: cols.length > 9 ? 7 : 8,
        cellPadding: 2,
        overflow: 'linebreak', // Descrições completas sem corte
        valign: 'middle',
      },
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      didDrawPage: (data) => {
        // Cabeçalho repetido em todas as páginas
        doc.setFillColor(15, 23, 42);
        doc.rect(10, 8, pageWidth - 20, 14, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(`ALMOX CONTROL — ${tituloDoc.toUpperCase()}`, 13, 14);
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'normal');
        doc.text(`${areaTexto}   |   ${emissaoTexto}`, 13, 19.5);

        // Resumo de filtros e parâmetros da Curva ABC
        doc.setTextColor(51, 65, 85);
        doc.setFontSize(7);
        let yMeta = 26;
        for (const linha of linhasCabecalhoMeta.slice(0, 6)) {
          const splitText = doc.splitTextToSize(linha, pageWidth - 22);
          doc.text(splitText[0], 11, yMeta);
          yMeta += 3.8;
        }

        // Rodapé com numeração de página
        doc.setFontSize(7.5);
        doc.setTextColor(100, 116, 139);
        doc.text(
          `Página ${data.pageNumber}   |   Total de registros: ${dadosRel.total_registros}`,
          pageWidth - 11,
          pageHeight - 6,
          { align: 'right' }
        );
      },
    });

    const slug = tituloDoc
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_');

    if (modo === 'print') {
      doc.autoPrint();
      const blobUrl = doc.output('bloburl');
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.src = String(blobUrl);
      document.body.appendChild(iframe);
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch {
          doc.save(`${slug}_${areaSigla.toLowerCase()}.pdf`);
        }
      }, 500);
    } else {
      doc.save(`${slug}_${areaSigla.toLowerCase()}.pdf`);
    }
  };

  // ==========================================================================
  // EXPORTAÇÃO DE PLANILHA (XLSX E CSV) PRESERVANDO ZEROS À ESQUERDA E PRECISÃO
  // ==========================================================================
  const exportarPlanilha = async (formato: 'xlsx' | 'csv') => {
    const dadosRel = resultado || (await executarConsulta());
    if (!dadosRel) return;

    const cols: { id: string; label: string; tipo: string }[] = dadosRel.colunas || [];
    const COLUNAS_TEXTO_PRESERVADO = new Set(['codigo', 'lote', 'produto_codigo', 'numero_requisicao', 'documento']);

    // Cabeçalho de metadados na planilha
    const aoa: any[][] = [
      [`RELATÓRIO: ${dadosRel.titulo}`],
      [`ÁREA: ${dadosRel.area_nome} (${dadosRel.area_sigla})`],
      [`DATA/HORA DE EMISSÃO: ${dadosRel.data_emissao}`],
      [`USUÁRIO EMISSOR: ${dadosRel.usuario_emissor}`],
      ...resumoConfiguracoes.map((item) => [item]),
      [],
      cols.map((c) => c.label),
    ];

    const headerRowIndex = aoa.length - 1;

    const formatarValorPlanilha = (val: any, col: { id: string; tipo: string }) => {
      if (val === null || val === undefined || val === '') return '';
      if (COLUNAS_TEXTO_PRESERVADO.has(col.id)) {
        return String(val);
      }
      if (col.tipo === 'numero' || col.tipo === 'moeda' || col.tipo === 'percentual') {
        const n = Number(val);
        return Number.isNaN(n) ? String(val) : n;
      }
      if (col.tipo === 'data') {
        return formatarCelula(val, 'data');
      }
      return String(val);
    };

    if (dadosRel.grupos_render && Array.isArray(dadosRel.grupos_render)) {
      for (const grp of dadosRel.grupos_render) {
        aoa.push([`AGRUPAMENTO: ${grp.titulo} (${grp.linhas.length} registro(s))`]);
        for (const r of grp.linhas) {
          aoa.push(cols.map((c) => formatarValorPlanilha(r[c.id], c)));
        }
        if (grp.subtotal) {
          aoa.push(
            cols.map((c, idx) => {
              if (idx === 0) return `Subtotal (${grp.titulo})`;
              if (['entradas', 'saidas', 'quantidade_consumida', 'saldo_inicial', 'saldo_final'].includes(c.id)) {
                if (!grp.subtotal.mesma_unidade) return 'Unidades mistas';
                return grp.subtotal[c.id] ?? '';
              }
              if (c.id === 'valor_total') return grp.subtotal.valor_total ?? '';
              return '';
            })
          );
        }
      }
    } else {
      for (const r of dadosRel.linhas || []) {
        aoa.push(cols.map((c) => formatarValorPlanilha(r[c.id], c)));
      }
    }

    if (dadosRel.total_geral && !dadosRel.restrito_requisitante) {
      const tg = dadosRel.total_geral;
      aoa.push(
        cols.map((c, idx) => {
          if (idx === 0) return 'TOTAL GERAL';
          if (['entradas', 'saidas', 'quantidade_consumida', 'saldo_inicial', 'saldo_final'].includes(c.id)) {
            if (!tg.mesma_unidade) return 'Unidades mistas';
            return tg[c.id] ?? '';
          }
          if (c.id === 'valor_total') return tg.valor_total ?? '';
          return '';
        })
      );
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Garantir que códigos e lotes com zeros à esquerda permaneçam explícitos como texto ('s')
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    for (let R = headerRowIndex + 1; R <= range.e.r; ++R) {
      for (let C = 0; C < cols.length; ++C) {
        const col = cols[C];
        if (!col) continue;
        const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = ws[cellRef];
        if (!cell) continue;
        if (COLUNAS_TEXTO_PRESERVADO.has(col.id)) {
          cell.t = 's';
          cell.v = String(cell.v ?? '');
          cell.z = '@';
        }
      }
    }

    ws['!cols'] = cols.map((c) => ({
      wch: c.id === 'descricao' || c.id === 'produto_nome' ? 45 : c.id === 'codigo' ? 16 : 20,
    }));

    const slug = String(dadosRel.titulo || 'relatorio')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_');

    if (formato === 'xlsx') {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Relatorio');
      XLSX.writeFile(wb, `${slug}_${areaSigla.toLowerCase()}.xlsx`);
    } else {
      // CSV com ponto-e-vírgula (padrão Excel PT-BR) e preservação de zeros à esquerda
      const csvLines = aoa.map((row, rowIdx) =>
        row
          .map((val, colIdx) => {
            const col = cols[colIdx];
            const str = val === null || val === undefined ? '' : String(val);
            if (rowIdx > headerRowIndex && col && COLUNAS_TEXTO_PRESERVADO.has(col.id) && str !== '') {
              return `"=""${str.replace(/"/g, '""')}"""`;
            }
            return `"${str.replace(/"/g, '""')}"`;
          })
          .join(';')
      );
      const csvContent = '\uFEFF' + csvLines.join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slug}_${areaSigla.toLowerCase()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  if (loadingMeta) {
    return (
      <div className="p-8 flex flex-col items-center justify-center text-slate-600 gap-3">
        <RefreshCw className="w-7 h-7 animate-spin text-blue-600" />
        <p className="text-sm font-medium">Carregando estrutura do Construtor de Relatórios ({areaSigla})...</p>
      </div>
    );
  }

  if (metaError) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-5 text-rose-800 flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 shrink-0 text-rose-600" />
          <div>
            <h3 className="font-bold text-sm">Não foi possível carregar o módulo de relatórios</h3>
            <p className="text-xs mt-1">{metaError}</p>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // RENDERIZAÇÃO RESTRITA: PERFIL REQUISITANTE ("Minhas requisições")
  // ==========================================================================
  if (isRequisitante) {
    const statusOpts: MultiSelectBoxOption<string>[] = (metadados?.status_opcoes || []).map((st: string) => ({
      id: st,
      label: st,
    }));
    const prodOpts: MultiSelectBoxOption<number>[] = (metadados?.produtos || []).map((p: any) => ({
      id: Number(p.id),
      label: `${p.codigo} — ${p.nome}`,
      sublabel: `Unidade: ${p.unidade_medida || 'UN'}`,
    }));

    return (
      <div className="space-y-6 pb-12">
        {/* Cabeçalho */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {onVoltar && (
              <button
                type="button"
                onClick={onVoltar}
                className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600"
                title="Voltar"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-slate-900">Minhas Requisições — Relatório Pessoal</h1>
                <span className="px-2.5 py-0.5 text-xs font-bold rounded bg-blue-50 text-blue-700 border border-blue-200">
                  Área: {areaSigla}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Consulta exclusiva das requisições emitidas por {currentUser?.nome} na área ativa ({areaSigla}).
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={executarConsulta}
              disabled={loadingRelatorio}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition-colors disabled:opacity-50"
            >
              <Eye className="w-4 h-4" />
              {loadingRelatorio ? 'Consultando...' : 'Visualizar em Tela'}
            </button>
            <button
              type="button"
              onClick={() => gerarPdfRelatorio('print')}
              disabled={loadingRelatorio}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold transition-colors"
            >
              <Printer className="w-4 h-4" />
              Imprimir PDF
            </button>
            <button
              type="button"
              onClick={() => gerarPdfRelatorio('download')}
              disabled={loadingRelatorio}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors"
            >
              <Download className="w-4 h-4" />
              Salvar PDF
            </button>
            <button
              type="button"
              onClick={() => exportarPlanilha('xlsx')}
              disabled={loadingRelatorio}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Exportar XLSX
            </button>
            <button
              type="button"
              onClick={() => exportarPlanilha('csv')}
              disabled={loadingRelatorio}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors"
            >
              <FileText className="w-4 h-4" />
              Exportar CSV
            </button>
          </div>
        </div>

        {/* Filtros de Minhas Requisições */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-5">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide flex items-center gap-2">
            <Filter className="w-4 h-4 text-blue-600" />
            Filtros de Minhas Requisições
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Data Inicial (Solicitação — dia integral)
              </label>
              <input
                type="date"
                value={reqDataInicio}
                onChange={(e) => setReqDataInicio(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Data Final (Solicitação — dia integral)
              </label>
              <input
                type="date"
                value={reqDataFim}
                onChange={(e) => setReqDataFim(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Número da Requisição</label>
              <input
                type="text"
                value={reqNumeroBusca}
                onChange={(e) => setReqNumeroBusca(e.target.value)}
                placeholder="Ex.: REQ-ALM-2026-0001"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <MultiSelectCheckboxList
              title="Status da Requisição"
              subtitle="Marque um ou mais status para filtrar suas requisições"
              options={statusOpts}
              state={reqStatusFiltro}
              onChange={setReqStatusFiltro}
            />
            <MultiSelectCheckboxList
              title="Itens Solicitados"
              subtitle="Produtos presentes nas requisições emitidas por você"
              options={prodOpts}
              state={reqProdutosFiltro}
              onChange={setReqProdutosFiltro}
            />
          </div>

          {/* Colunas e Ordenação */}
          <div className="border-t border-slate-200 pt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <span className="block text-xs font-bold text-slate-800 uppercase mb-2">
                Colunas Exibidas e Ordem (Subir / Descer)
              </span>
              <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-48 overflow-y-auto">
                {reqColunasOrdem.map((colId, idx) => {
                  const def = COLUNAS_REQUISITANTE.find((c) => c.id === colId);
                  if (!def) return null;
                  const checked = reqColunasMarcadas.has(colId);
                  return (
                    <div key={colId} className="flex items-center justify-between px-3 py-1.5 text-xs hover:bg-slate-50">
                      <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setReqColunasMarcadas((prev) => {
                              const next = new Set(prev);
                              if (next.has(colId)) next.delete(colId);
                              else next.add(colId);
                              return next;
                            });
                          }}
                          className="rounded border-slate-300 text-blue-600"
                        />
                        {def.label}
                      </label>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moverColuna(colId, 'up', true)}
                          disabled={idx === 0}
                          className="p-1 text-slate-500 hover:text-slate-900 disabled:opacity-30"
                          title="Subir coluna"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moverColuna(colId, 'down', true)}
                          disabled={idx === reqColunasOrdem.length - 1}
                          className="p-1 text-slate-500 hover:text-slate-900 disabled:opacity-30"
                          title="Descer coluna"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Ordenar por Coluna</label>
                <select
                  value={reqOrdenacaoCol}
                  onChange={(e) => setReqOrdenacaoCol(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                >
                  {COLUNAS_REQUISITANTE.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <span className="block text-xs font-semibold text-slate-700 mb-1">Sentido da Ordenação</span>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name="req_ord_dir"
                      checked={reqOrdenacaoSentido === 'asc'}
                      onChange={() => setReqOrdenacaoSentido('asc')}
                    />
                    Crescente (A → Z / Menor → Maior)
                  </label>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name="req_ord_dir"
                      checked={reqOrdenacaoSentido === 'desc'}
                      onChange={() => setReqOrdenacaoSentido('desc')}
                    />
                    Decrescente (Mais recente / Maior → Menor)
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Resumo antes de gerar */}
        <div className="bg-slate-800 text-slate-100 rounded-xl p-4 space-y-1.5">
          <div className="text-xs font-bold uppercase tracking-wider text-blue-300">
            Resumo das Configurações Selecionadas
          </div>
          <ul className="text-xs space-y-1 text-slate-200 list-disc list-inside">
            {resumoConfiguracoes.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        </div>

        {erroRelatorio && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-4 text-xs font-medium">
            {erroRelatorio}
          </div>
        )}

        {/* Tabela de Visualização */}
        {resultado && (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold">{resultado.titulo}</h3>
                <p className="text-[11px] text-slate-300">
                  Área: {resultado.area_nome} ({resultado.area_sigla}) | Emissão: {resultado.data_emissao} | Usuário:{' '}
                  {resultado.usuario_emissor}
                </p>
              </div>
              <span className="px-2.5 py-1 rounded bg-slate-800 text-xs font-semibold">
                {resultado.total_registros} registro(s)
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-[11px] font-bold text-slate-700 uppercase">
                    {(resultado.colunas || []).map((col: any) => (
                      <th key={col.id} className="py-2.5 px-3">
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                  {(resultado.linhas || []).length === 0 ? (
                    <tr>
                      <td colSpan={(resultado.colunas || []).length || 1} className="py-8 text-center text-slate-400">
                        Nenhuma requisição encontrada para os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    (resultado.linhas || []).map((row: any, rIdx: number) => (
                      <tr key={rIdx} className="hover:bg-slate-50">
                        {(resultado.colunas || []).map((col: any) => (
                          <td key={col.id} className="py-2 px-3 align-top break-words">
                            {formatarCelula(row[col.id], col.tipo)}
                          </td>
                        ))}
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
  }

  // ==========================================================================
  // RENDERIZAÇÃO COMPLETA: CONSTRUTOR DINÂMICO (ADMIN, TI_DPO, ALMOXARIFE)
  // ==========================================================================
  const opcoesTiposSaida: MultiSelectBoxOption<string>[] = (metadados?.tipos_saida || []).map((t: string) => ({
    id: t,
    label: t,
  }));

  const opcoesCentrosCusto: MultiSelectBoxOption<number>[] = (metadados?.centros_custo || []).map((cc: any) => ({
    id: Number(cc.id),
    label: `${cc.nome}${cc.sigla ? ` (${cc.sigla})` : ''}`,
    sublabel: cc.codigo ? `Código: ${cc.codigo}` : undefined,
  }));

  const opcoesGrupos: MultiSelectBoxOption<number>[] = (metadados?.grupos || []).map((g: any) => ({
    id: Number(g.id),
    label: g.nome,
    sublabel: g.descricao || undefined,
  }));

  const opcoesSubgrupos: MultiSelectBoxOption<number>[] = subgruposDisponiveis.map((sg: any) => ({
    id: Number(sg.id),
    label: sg.nome,
    sublabel: sg.grupo_nome ? `Grupo vinculado: ${sg.grupo_nome}` : undefined,
  }));

  const opcoesProdutos: MultiSelectBoxOption<number>[] = produtosDisponiveis.map((p: any) => ({
    id: Number(p.id),
    label: `${p.codigo} — ${p.nome}`,
    sublabel: `Unid: ${p.unidade_medida || 'UN'} | Grupo: ${p.grupo_nome || 'Sem Grupo'}`,
  }));

  const opcoesUnidades: MultiSelectBoxOption<string>[] = (metadados?.unidades_medida || []).map((u: any) => ({
    id: String(u.sigla),
    label: `${u.sigla} — ${u.descricao || u.sigla}`,
  }));

  const opcoesTiposMov: MultiSelectBoxOption<string>[] = (metadados?.tipos_movimentacao || []).map((tm: any) => ({
    id: String(tm.id),
    label: tm.label,
  }));

  const lotesUnicosMap = new Map<string, MultiSelectBoxOption<string>>();
  for (const l of lotesDisponiveis) {
    const num = String(l.numero_lote || '').trim();
    if (!num) continue;
    if (!lotesUnicosMap.has(num)) {
      lotesUnicosMap.set(num, {
        id: num,
        label: `Lote: ${num}`,
        sublabel: `${l.produto_codigo} — ${l.produto_nome}${
          l.data_validade ? ` (Val: ${String(l.data_validade).slice(0, 10).split('-').reverse().join('/')})` : ''
        }`,
      });
    }
  }
  const opcoesLotes = Array.from(lotesUnicosMap.values());

  return (
    <div className="space-y-5 pb-14">
      {/* Barra Superior do Construtor Dinâmico */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {onVoltar && (
            <button
              type="button"
              onClick={onVoltar}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600"
              title="Voltar"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-bold text-slate-900">Construtor Dinâmico de Relatórios</h1>
              <span className="px-2.5 py-0.5 text-xs font-bold rounded bg-blue-50 text-blue-700 border border-blue-200">
                Área Ativa: {areaSigla}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Configure a base de análise, datas, filtros combináveis, colunas, agrupamentos e parâmetros da Curva ABC.
            </p>
          </div>
        </div>

        {/* Botões de Ação Unificados (a partir da mesma consulta configurada) */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={executarConsulta}
            disabled={loadingRelatorio}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition-colors disabled:opacity-50"
          >
            <Eye className="w-4 h-4" />
            {loadingRelatorio ? 'Processando...' : 'Visualizar em Tela'}
          </button>
          <button
            type="button"
            onClick={() => gerarPdfRelatorio('print')}
            disabled={loadingRelatorio}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold transition-colors"
          >
            <Printer className="w-4 h-4" />
            Imprimir PDF
          </button>
          <button
            type="button"
            onClick={() => gerarPdfRelatorio('download')}
            disabled={loadingRelatorio}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors"
          >
            <Download className="w-4 h-4" />
            Salvar PDF
          </button>
          <button
            type="button"
            onClick={() => exportarPlanilha('xlsx')}
            disabled={loadingRelatorio}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Exportar XLSX
          </button>
          <button
            type="button"
            onClick={() => exportarPlanilha('csv')}
            disabled={loadingRelatorio}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors"
          >
            <FileText className="w-4 h-4" />
            Exportar CSV
          </button>
        </div>
      </div>

      {/* ====================================================================
          BLOCO 1: ANÁLISE (Recolhível)
      ==================================================================== */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => toggleBlock('analise')}
          className="w-full px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-2.5">
            <Layers className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-bold text-slate-800">1. Análise (Base de Dados e Regras de Apuração)</span>
          </div>
          {openBlocks.analise ? (
            <ChevronUp className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-500" />
          )}
        </button>

        {openBlocks.analise && (
          <div className="p-5 space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Escolha única (Radio): Base do Relatório */}
              <label
                className={`p-4 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                  base === 'saldo_estoque'
                    ? 'border-blue-600 bg-blue-50/40 ring-1 ring-blue-600'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="base_analise"
                  checked={base === 'saldo_estoque'}
                  onChange={() => handleChangeBase('saldo_estoque')}
                  className="mt-1 text-blue-600"
                />
                <div>
                  <div className="text-xs font-bold text-slate-900">Saldo em Estoque</div>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Posição física e financeira do estoque atual ou reconstruída em uma data de referência histórica.
                  </p>
                </div>
              </label>

              <label
                className={`p-4 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                  base === 'movimentacoes'
                    ? 'border-blue-600 bg-blue-50/40 ring-1 ring-blue-600'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="base_analise"
                  checked={base === 'movimentacoes'}
                  onChange={() => handleChangeBase('movimentacoes')}
                  className="mt-1 text-blue-600"
                />
                <div>
                  <div className="text-xs font-bold text-slate-900">Movimentações</div>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Histórico analítico ou consolidado de entradas, saídas e estornos em um período.
                  </p>
                </div>
              </label>

              <label
                className={`p-4 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                  base === 'consumo_saidas'
                    ? 'border-blue-600 bg-blue-50/40 ring-1 ring-blue-600'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="base_analise"
                  checked={base === 'consumo_saidas'}
                  onChange={() => handleChangeBase('consumo_saidas')}
                  className="mt-1 text-blue-600"
                />
                <div>
                  <div className="text-xs font-bold text-slate-900">Consumo / Saídas</div>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Apuração de consumo com seleção explícita dos tipos de saída considerados e tratamento de devoluções.
                  </p>
                </div>
              </label>
            </div>

            {/* Opções específicas para Consumo/Saídas */}
            {base === 'consumo_saidas' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pt-3 border-t border-slate-200">
                <MultiSelectCheckboxList
                  title="Tipos de Saída Considerados como Consumo"
                  subtitle="Não tratamos automaticamente toda saída como consumo. Marque os motivos que compõem esta apuração:"
                  options={opcoesTiposSaida}
                  state={tiposSaidaFiltro}
                  onChange={setTiposSaidaFiltro}
                />

                <div className="space-y-4">
                  <div className="p-4 rounded-lg border border-slate-200 bg-slate-50 space-y-2.5">
                    <span className="block text-xs font-bold text-slate-800 uppercase">
                      Tratamento de Devoluções de Setor e Estornos de Saída
                    </span>
                    <label className="flex items-start gap-2.5 text-xs cursor-pointer">
                      <input
                        type="radio"
                        name="tratamento_devolucoes"
                        checked={tratamentoDevolucoes === 'liquido'}
                        onChange={() => setTratamentoDevolucoes('liquido')}
                        className="mt-0.5 text-blue-600"
                      />
                      <div>
                        <span className="font-semibold text-slate-900">Considerar no Resultado Líquido</span>
                        <p className="text-[11px] text-slate-600">
                          A Quantidade Consumida abate uma única vez os registros de "Estorno de Saída" e "Devolução de
                          Setor" do período, sem descontar duas vezes.
                        </p>
                      </div>
                    </label>
                    <label className="flex items-start gap-2.5 text-xs cursor-pointer">
                      <input
                        type="radio"
                        name="tratamento_devolucoes"
                        checked={tratamentoDevolucoes === 'separado'}
                        onChange={() => setTratamentoDevolucoes('separado')}
                        className="mt-0.5 text-blue-600"
                      />
                      <div>
                        <span className="font-semibold text-slate-900">Exibir Separadamente (Consumo Bruto)</span>
                        <p className="text-[11px] text-slate-600">
                          Mantém a Quantidade Consumida pelo total bruto das saídas selecionadas e apresenta devoluções e
                          estornos separadamente na coluna de Entradas.
                        </p>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Origem do custo e Nome personalizado */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-3 border-t border-slate-200">
              <div>
                <span className="block text-xs font-bold text-slate-800 uppercase mb-1.5">
                  Base de Custo Unitário Utilizada
                </span>
                <div className="space-y-2">
                  <label className="flex items-start gap-2 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name="origem_custo"
                      checked={origemCusto === 'cadastro_atual'}
                      onChange={() => setOrigemCusto('cadastro_atual')}
                      className="mt-0.5 text-blue-600"
                    />
                    <div>
                      <span className="font-semibold text-slate-800">
                        Custo Unitário do Cadastro Atual do Produto (`produtos.valor_unitario`)
                      </span>
                      <p className="text-[11px] text-slate-500">
                        Utiliza o valor unitário vigente cadastrado no catálogo da área ativa.
                      </p>
                    </div>
                  </label>
                  <label className="flex items-start gap-2 text-xs cursor-pointer">
                    <input
                      type="radio"
                      name="origem_custo"
                      checked={origemCusto === 'movimentacao_lote'}
                      onChange={() => setOrigemCusto('movimentacao_lote')}
                      className="mt-0.5 text-blue-600"
                    />
                    <div>
                      <span className="font-semibold text-slate-800">
                        Custo Unitário Gravado no Lote / Movimentação Histórica
                      </span>
                      <p className="text-[11px] text-slate-500">
                        Usa estritamente o custo gravado no lote ou na movimentação. Quando ausente no histórico, exibe
                        aviso de limitação sem substituir silenciosamente pelo custo atual.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 uppercase mb-1.5">
                  Título Personalizado do Relatório (Opcional)
                </label>
                <input
                  type="text"
                  value={nomeRelatorio}
                  onChange={(e) => setNomeRelatorio(e.target.value)}
                  placeholder="Deixe em branco para usar o título automático da análise..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ====================================================================
          BLOCO 2: DATAS (Recolhível)
      ==================================================================== */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => toggleBlock('datas')}
          className="w-full px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-2.5">
            <Calendar className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-bold text-slate-800">2. Datas (Período ou Data de Referência)</span>
          </div>
          {openBlocks.datas ? (
            <ChevronUp className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-500" />
          )}
        </button>

        {openBlocks.datas && (
          <div className="p-5 space-y-4">
            {base === 'saldo_estoque' ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-6">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                    <input
                      type="radio"
                      name="modo_saldo"
                      checked={modoSaldo === 'atual'}
                      onChange={() => setModoSaldo('atual')}
                      className="text-blue-600"
                    />
                    Saldo Atual em Estoque
                  </label>
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                    <input
                      type="radio"
                      name="modo_saldo"
                      checked={modoSaldo === 'data_referencia'}
                      onChange={() => setModoSaldo('data_referencia')}
                      className="text-blue-600"
                    />
                    Saldo Histórico em uma Data de Referência
                  </label>
                </div>

                {modoSaldo === 'data_referencia' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Data de Referência (considera o dia integral até 23:59:59)
                      </label>
                      <input
                        type="date"
                        value={dataReferencia}
                        max={hojeStr}
                        onChange={(e) => setDataReferencia(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900 flex items-start gap-2">
                      <Info className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                      <span>
                        O saldo histórico reconstrói a posição ao final do dia selecionado a partir do histórico de
                        movimentações disponível. Caso faltem custos históricos nos lançamentos, a limitação será
                        informada no relatório.
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Data Inicial (00:00:00 incluído)
                  </label>
                  <input
                    type="date"
                    value={dataInicio}
                    onChange={(e) => setDataInicio(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Data Final (23:59:59 incluído)
                  </label>
                  <input
                    type="date"
                    value={dataFim}
                    onChange={(e) => setDataFim(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                  Os dias inicial e final selecionados são incluídos integralmente na consulta (das 00:00:00 do dia
                  inicial até as 23:59:59 do dia final).
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ====================================================================
          BLOCO 3: FILTROS COMBINÁVEIS (Recolhível)
      ==================================================================== */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => toggleBlock('filtros')}
          className="w-full px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-2.5">
            <Filter className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-bold text-slate-800">
              3. Filtros Combináveis (Múltipla Seleção com Busca e Faixas)
            </span>
          </div>
          {openBlocks.filtros ? (
            <ChevronUp className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-500" />
          )}
        </button>

        {openBlocks.filtros && (
          <div className="p-5 space-y-5">
            <div className="p-3 rounded-lg bg-blue-50/60 border border-blue-200 text-xs text-slate-700 flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <span>
                Dentro do mesmo filtro, qualquer opção marcada é aceita (OU). Entre filtros diferentes, todos os
                critérios são aplicados simultaneamente (E). Subgrupos respeitam os grupos escolhidos pelo vínculo de
                cadastro.
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Centros de custo: compatível com movimentações e consumo/saídas */}
              {base !== 'saldo_estoque' ? (
                <MultiSelectCheckboxList
                  title="Centros de Custo (Origem / Destinação)"
                  subtitle="Representa o setor de origem/destinação das movimentações, não estoque próprio do setor"
                  options={opcoesCentrosCusto}
                  state={filtroCentrosCusto}
                  onChange={setFiltroCentrosCusto}
                />
              ) : (
                <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 flex flex-col justify-center text-xs text-slate-500">
                  <span className="font-bold text-slate-700 uppercase mb-1">Filtro de Centro de Custo</span>
                  Indisponível para a base "Saldo em Estoque", pois o Centro de Custo representa a origem/destinação das
                  movimentações e não um estoque próprio do setor. Para filtrar por Centro de Custo, escolha a base
                  "Movimentações" ou "Consumo / Saídas".
                </div>
              )}

              {base === 'movimentacoes' && (
                <MultiSelectCheckboxList
                  title="Tipos de Movimentação"
                  subtitle="Filtre entradas, saídas e estornos"
                  options={opcoesTiposMov}
                  state={filtroTiposMov}
                  onChange={setFiltroTiposMov}
                />
              )}

              <MultiSelectCheckboxList
                title="Grupos de Produtos"
                subtitle="Filtra grupos cadastrados na área ativa"
                options={opcoesGrupos}
                state={filtroGrupos}
                onChange={setFiltroGrupos}
              />

              <MultiSelectCheckboxList
                title="Subgrupos de Produtos"
                subtitle="Exibe apenas subgrupos pertencentes aos grupos selecionados"
                options={opcoesSubgrupos}
                state={filtroSubgrupos}
                onChange={setFiltroSubgrupos}
                emptyMessage="Nenhum subgrupo vinculado aos grupos selecionados."
              />

              <MultiSelectCheckboxList
                title="Produtos"
                subtitle="Catálogo de produtos compatível com os grupos/subgrupos escolhidos"
                options={opcoesProdutos}
                state={filtroProdutos}
                onChange={setFiltroProdutos}
              />

              <MultiSelectCheckboxList
                title="Unidades de Medida"
                subtitle="Unidades cadastradas e utilizadas nos produtos da área"
                options={opcoesUnidades}
                state={filtroUnidades}
                onChange={setFiltroUnidades}
              />

              <MultiSelectCheckboxList
                title="Lotes"
                subtitle="Lotes registrados em estoque ou movimentações dos produtos filtrados"
                options={opcoesLotes}
                state={filtroLotes}
                onChange={setFiltroLotes}
              />
            </div>

            {/* Intervalo de Validade, Faixas de Quantidade/Valor e Zeros */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-3 border-t border-slate-200">
              <div className="p-3.5 border border-slate-200 rounded-lg space-y-3 bg-slate-50/50">
                <span className="block text-xs font-bold text-slate-800 uppercase">Lotes e Intervalo de Validade</span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Validade Inicial</label>
                    <input
                      type="date"
                      value={validadeInicio}
                      onChange={(e) => setValidadeInicio(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Validade Final</label>
                    <input
                      type="date"
                      value={validadeFim}
                      onChange={(e) => setValidadeFim(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded"
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={incluirSemLote}
                    onChange={(e) => setIncluirSemLote(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600"
                  />
                  Incluir registros sem lote informado
                </label>
              </div>

              <div className="p-3.5 border border-slate-200 rounded-lg space-y-3 bg-slate-50/50">
                <span className="block text-xs font-bold text-slate-800 uppercase">Faixa de Quantidade</span>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Grandeza Filtrada</label>
                  <select
                    value={grandezaQuantidade}
                    onChange={(e) => setGrandezaQuantidade(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white"
                  >
                    <option value="saldo_final">Saldo Final em Estoque</option>
                    <option value="quantidade_consumida">Quantidade Consumida</option>
                    <option value="entradas">Quantidade de Entradas</option>
                    <option value="saidas">Quantidade de Saídas</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Qtd. Mínima</label>
                    <input
                      type="number"
                      step="any"
                      value={qtdMin}
                      onChange={(e) => setQtdMin(e.target.value)}
                      placeholder="Sem mín."
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Qtd. Máxima</label>
                    <input
                      type="number"
                      step="any"
                      value={qtdMax}
                      onChange={(e) => setQtdMax(e.target.value)}
                      placeholder="Sem máx."
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white"
                    />
                  </div>
                </div>
              </div>

              <div className="p-3.5 border border-slate-200 rounded-lg space-y-3 bg-slate-50/50">
                <span className="block text-xs font-bold text-slate-800 uppercase">
                  Faixa de Valor Financeiro & Zeros
                </span>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Grandeza de Valor</label>
                  <select
                    value={grandezaValor}
                    onChange={(e) => setGrandezaValor(e.target.value as any)}
                    disabled={!exibirCustos}
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white disabled:opacity-50"
                  >
                    <option value="valor_total">Valor Total (R$)</option>
                    <option value="custo_unitario">Custo Unitário (R$)</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Valor Mín. (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={valorMin}
                      onChange={(e) => setValorMin(e.target.value)}
                      disabled={!exibirCustos}
                      placeholder="Sem mín."
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">Valor Máx. (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={valorMax}
                      onChange={(e) => setValorMax(e.target.value)}
                      disabled={!exibirCustos}
                      placeholder="Sem máx."
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded bg-white disabled:opacity-50"
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={incluirZeros}
                    onChange={(e) => setIncluirZeros(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600"
                  />
                  Incluir registros com saldo / quantidade igual a zero
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ====================================================================
          BLOCO 4: COLUNAS (Recolhível)
      ==================================================================== */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => toggleBlock('colunas')}
          className="w-full px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-2.5">
            <Columns className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-bold text-slate-800">
              4. Colunas (Seleção e Ordem de Exibição com Subir / Descer)
            </span>
          </div>
          {openBlocks.colunas ? (
            <ChevronUp className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-500" />
          )}
        </button>

        {openBlocks.colunas && (
          <div className="p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-600">
                Marque as colunas desejadas e utilize os botões <strong>Subir</strong> e <strong>Descer</strong> para
                definir a ordem na visualização, no PDF e na planilha. Apenas campos compatíveis com a análise estão
                disponíveis.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setColunasMarcadas(new Set(colunasCompativeis.map((c) => c.id)))}
                  className="px-2.5 py-1 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded"
                >
                  Marcar todas compatíveis
                </button>
                <button
                  type="button"
                  onClick={() => setColunasMarcadas(new Set(['codigo', 'descricao']))}
                  className="px-2.5 py-1 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 rounded"
                >
                  Mínimo (Código e Descrição)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {ordemColunas.map((colId, idx) => {
                const colDef = colunasCompativeis.find((c) => c.id === colId);
                if (!colDef) return null;
                const checked = colunasMarcadas.has(colId);
                return (
                  <div
                    key={colId}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs transition-colors ${
                      checked ? 'border-blue-300 bg-blue-50/40 font-semibold text-slate-900' : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setColunasMarcadas((prev) => {
                            const next = new Set(prev);
                            if (next.has(colId)) next.delete(colId);
                            else next.add(colId);
                            return next;
                          });
                        }}
                        className="rounded border-slate-300 text-blue-600"
                      />
                      <span className="truncate">{colDef.label}</span>
                    </label>
                    <div className="flex items-center gap-1 ml-2">
                      <button
                        type="button"
                        onClick={() => moverColuna(colId, 'up')}
                        disabled={idx === 0}
                        className="p-1 rounded hover:bg-slate-200 text-slate-600 disabled:opacity-30"
                        title="Subir coluna"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moverColuna(colId, 'down')}
                        disabled={idx === ordemColunas.length - 1}
                        className="p-1 rounded hover:bg-slate-200 text-slate-600 disabled:opacity-30"
                        title="Descer coluna"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ====================================================================
          BLOCO 5: ORGANIZAÇÃO (Recolhível)
      ==================================================================== */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => toggleBlock('organizacao')}
          className="w-full px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-2.5">
            <Sliders className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-bold text-slate-800">
              5. Organização (Detalhamento, Agrupamento, Ordenação, Subtotais e Custos)
            </span>
          </div>
          {openBlocks.organizacao ? (
            <ChevronUp className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-500" />
          )}
        </button>

        {openBlocks.organizacao && (
          <div className="p-5 grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Detalhamento */}
            <div className="space-y-2 border border-slate-200 rounded-lg p-3.5">
              <span className="block text-xs font-bold text-slate-800 uppercase">Nível de Detalhamento</span>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="radio"
                  name="detalhamento"
                  checked={detalhamento === 'produto'}
                  onChange={() => setDetalhamento('produto')}
                  className="text-blue-600"
                />
                Por Produto (Consolidado por Item)
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="radio"
                  name="detalhamento"
                  checked={detalhamento === 'produto_lote'}
                  onChange={() => setDetalhamento('produto_lote')}
                  className="text-blue-600"
                />
                Por Produto / Lote (Rastreabilidade de Lote e Validade)
              </label>
              {base !== 'saldo_estoque' && (
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="radio"
                    name="detalhamento"
                    checked={detalhamento === 'movimentacao'}
                    onChange={() => setDetalhamento('movimentacao')}
                    className="text-blue-600"
                  />
                  Por Movimentação (Cada lançamento individual)
                </label>
              )}
            </div>

            {/* Agrupamento */}
            <div className="space-y-2 border border-slate-200 rounded-lg p-3.5">
              <span className="block text-xs font-bold text-slate-800 uppercase">Agrupamento</span>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="radio"
                  name="agrupamento"
                  checked={agrupamento === 'nenhum'}
                  onChange={() => setAgrupamento('nenhum')}
                  className="text-blue-600"
                />
                Sem Agrupamento (Lista contínua)
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="radio"
                  name="agrupamento"
                  checked={agrupamento === 'grupo_subgrupo'}
                  onChange={() => setAgrupamento('grupo_subgrupo')}
                  className="text-blue-600"
                />
                Por Grupo / Subgrupo de Produto
              </label>
              {base !== 'saldo_estoque' && (
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input
                    type="radio"
                    name="agrupamento"
                    checked={agrupamento === 'centro_custo'}
                    onChange={() => setAgrupamento('centro_custo')}
                    className="text-blue-600"
                  />
                  Por Centro de Custo (Origem / Destino)
                </label>
              )}
            </div>

            {/* Ordenação e Checkboxes de Totalização e Custos */}
            <div className="space-y-3 border border-slate-200 rounded-lg p-3.5">
              <span className="block text-xs font-bold text-slate-800 uppercase">Ordenação e Totalizadores</span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Coluna de Ordenação</label>
                  <select
                    value={ordenacaoColuna}
                    onChange={(e) => setOrdenacaoColuna(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded"
                  >
                    {colunasCompativeis.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">Sentido</label>
                  <select
                    value={ordenacaoSentido}
                    onChange={(e) => setOrdenacaoSentido(e.target.value as 'asc' | 'desc')}
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded"
                  >
                    <option value="asc">Crescente (A→Z / 0→9)</option>
                    <option value="desc">Decrescente (Z→A / 9→0)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-slate-100">
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={exibirSubtotais}
                    onChange={(e) => setExibirSubtotais(e.target.checked)}
                    disabled={agrupamento === 'nenhum'}
                    className="rounded border-slate-300 text-blue-600 disabled:opacity-50"
                  />
                  Exibir Subtotais por Agrupamento
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={exibirTotalGeral}
                    onChange={(e) => setExibirTotalGeral(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600"
                  />
                  Exibir Total Geral (sem somar unidades incompatíveis ou custos unitários)
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={exibirCustos}
                    onChange={(e) => handleToggleExibirCustos(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600"
                  />
                  Exibir Custos e Valores Financeiros
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ====================================================================
          BLOCO 6: CURVA ABC CONFIGURÁVEL (Recolhível)
      ==================================================================== */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BarChart3 className="w-4 h-4 text-blue-600" />
            <label className="flex items-center gap-2 text-sm font-bold text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={calcularAbc}
                onChange={(e) => handleToggleCalcularAbc(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              6. Calcular Curva ABC Configurável
            </label>
          </div>
          <button
            type="button"
            onClick={() => toggleBlock('curva_abc')}
            className="text-slate-500 hover:text-slate-800 p-1"
          >
            {openBlocks.curva_abc ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {(openBlocks.curva_abc || calcularAbc) && (
          <div className="p-5 space-y-5">
            {!calcularAbc ? (
              <p className="text-xs text-slate-500">
                Marque a caixa <strong>"Calcular Curva ABC Configurável"</strong> acima para habilitar os parâmetros de
                classificação ABC neste relatório.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {/* Indicador de Classificação */}
                  <div className="border border-slate-200 rounded-lg p-4 space-y-2.5">
                    <span className="block text-xs font-bold text-slate-800 uppercase">
                      Indicador de Classificação (Escolha Única)
                    </span>
                    <p className="text-[11px] text-slate-500">
                      Consolidado sempre por Produto (lotes de um mesmo produto não são classificados separadamente).
                    </p>

                    {base !== 'saldo_estoque' && (
                      <>
                        <label className="flex items-center gap-2 text-xs cursor-pointer">
                          <input
                            type="radio"
                            name="indicador_abc"
                            checked={indicadorAbc === 'quantidade_consumida'}
                            onChange={() => setIndicadorAbc('quantidade_consumida')}
                            className="text-blue-600"
                          />
                          Quantidade Consumida no Período Selecionado
                        </label>
                        <label className="flex items-center gap-2 text-xs cursor-pointer">
                          <input
                            type="radio"
                            name="indicador_abc"
                            checked={indicadorAbc === 'valor_consumo'}
                            disabled={!exibirCustos}
                            onChange={() => setIndicadorAbc('valor_consumo')}
                            className="text-blue-600 disabled:opacity-50"
                          />
                          Valor Financeiro do Consumo (Quantidade Consumida × Custo Unitário)
                        </label>
                      </>
                    )}

                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="radio"
                        name="indicador_abc"
                        checked={indicadorAbc === 'quantidade_estoque'}
                        onChange={() => setIndicadorAbc('quantidade_estoque')}
                        className="text-blue-600"
                      />
                      Quantidade em Estoque ({modoSaldo === 'data_referencia' ? 'na Data de Referência' : 'Saldo Atual'})
                    </label>
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="radio"
                        name="indicador_abc"
                        checked={indicadorAbc === 'valor_estoque'}
                        disabled={!exibirCustos}
                        onChange={() => setIndicadorAbc('valor_estoque')}
                        className="text-blue-600 disabled:opacity-50"
                      />
                      Valor Financeiro do Estoque (Saldo em Estoque × Custo Unitário)
                    </label>
                  </div>

                  {/* Percentuais Editáveis das Classes A, B e C */}
                  <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                    <span className="block text-xs font-bold text-slate-800 uppercase">
                      Percentuais de Participação das Classes A, B e C
                    </span>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-emerald-700 mb-1">
                          Classe A (%)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          max="100"
                          value={pctA}
                          onChange={(e) => setPctA(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-amber-700 mb-1">
                          Classe B (%)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={pctB}
                          onChange={(e) => setPctB(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Classe C (%)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={pctC}
                          onChange={(e) => setPctC(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded font-bold"
                        />
                      </div>
                    </div>

                    {validacaoAbcPct.valido ? (
                      <div className="p-2.5 rounded bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-900">
                        <strong>Faixas acumuladas resultantes (Total = 100%):</strong> Classe A: {validacaoAbcPct.faixaA}{' '}
                        | Classe B: {validacaoAbcPct.faixaB} | Classe C: {validacaoAbcPct.faixaC}
                      </div>
                    ) : (
                      <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-[11px] text-rose-800 font-semibold">
                        A soma dos percentuais de A, B e C deve ser exatamente 100% (Soma atual: {validacaoAbcPct.soma}%).
                      </div>
                    )}
                  </div>
                </div>

                {/* Abrangência, Regra de Fronteira, Regra de Empate e Classes Exibidas */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="border border-slate-200 rounded-lg p-3.5 space-y-2">
                    <span className="block text-xs font-bold text-slate-800 uppercase">Abrangência do Cálculo</span>
                    <label className="flex items-start gap-2 text-xs cursor-pointer">
                      <input
                        type="radio"
                        name="abrangencia_abc"
                        checked={abrangenciaAbc === 'geral'}
                        onChange={() => setAbrangenciaAbc('geral')}
                        className="mt-0.5 text-blue-600"
                      />
                      <span>Uma classificação única para todo o resultado filtrado</span>
                    </label>
                    <label className="flex items-start gap-2 text-xs cursor-pointer">
                      <input
                        type="radio"
                        name="abrangencia_abc"
                        checked={abrangenciaAbc === 'por_agrupamento'}
                        disabled={agrupamento === 'nenhum'}
                        onChange={() => setAbrangenciaAbc('por_agrupamento')}
                        className="mt-0.5 text-blue-600 disabled:opacity-50"
                      />
                      <span>
                        Uma classificação independente por agrupamento{' '}
                        {agrupamento === 'nenhum' && '(requer agrupamento ativo)'}
                      </span>
                    </label>
                  </div>

                  <div className="border border-slate-200 rounded-lg p-3.5 space-y-2">
                    <span className="block text-xs font-bold text-slate-800 uppercase">
                      Item que Ultrapassa o Limite da Classe
                    </span>
                    <label className="flex items-start gap-2 text-xs cursor-pointer">
                      <input
                        type="radio"
                        name="fronteira_abc"
                        checked={regraFronteiraAbc === 'incluir_na_atual'}
                        onChange={() => setRegraFronteiraAbc('incluir_na_atual')}
                        className="mt-0.5 text-blue-600"
                      />
                      <div>
                        <span className="font-semibold">Manter na classe que está sendo preenchida</span>
                        <p className="text-[10px] text-slate-500">
                          O item cujo percentual acumulado atinge ou cruza a fronteira fecha a classe atual.
                        </p>
                      </div>
                    </label>
                    <label className="flex items-start gap-2 text-xs cursor-pointer">
                      <input
                        type="radio"
                        name="fronteira_abc"
                        checked={regraFronteiraAbc === 'mover_para_seguinte'}
                        onChange={() => setRegraFronteiraAbc('mover_para_seguinte')}
                        className="mt-0.5 text-blue-600"
                      />
                      <div>
                        <span className="font-semibold">Alocar na classe seguinte</span>
                        <p className="text-[10px] text-slate-500">
                          Se a inclusão do item faz o acumulado ultrapassar o limite da faixa, ele inicia a próxima
                          classe.
                        </p>
                      </div>
                    </label>
                  </div>

                  <div className="border border-slate-200 rounded-lg p-3.5 space-y-2.5">
                    <span className="block text-xs font-bold text-slate-800 uppercase">
                      Regra de Empate & Filtro Pós-Cálculo
                    </span>
                    <div className="space-y-1">
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <input
                          type="radio"
                          name="empate_abc"
                          checked={regraEmpateAbc === 'manter_mesma_classe'}
                          onChange={() => setRegraEmpateAbc('manter_mesma_classe')}
                          className="text-blue-600"
                        />
                        Empates: Manter itens empatados na mesma classe
                      </label>
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <input
                          type="radio"
                          name="empate_abc"
                          checked={regraEmpateAbc === 'desempatar_codigo'}
                          onChange={() => setRegraEmpateAbc('desempatar_codigo')}
                          className="text-blue-600"
                        />
                        Empates: Desempatar por código crescente
                      </label>
                    </div>

                    <div className="pt-2 border-t border-slate-100">
                      <span className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Exibir Classes após o cálculo (sem recalcular %):
                      </span>
                      <div className="flex flex-wrap items-center gap-3">
                        {[
                          { id: 'A', label: 'Classe A' },
                          { id: 'B', label: 'Classe B' },
                          { id: 'C', label: 'Classe C' },
                          { id: 'SC', label: 'Sem Classificação (Zero/Sem dado)' },
                        ].map((cl) => (
                          <label key={cl.id} className="flex items-center gap-1.5 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={classesExibidasAbc.has(cl.id)}
                              onChange={() => {
                                setClassesExibidasAbc((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(cl.id)) next.delete(cl.id);
                                  else next.add(cl.id);
                                  return next;
                                });
                              }}
                              className="rounded border-slate-300 text-blue-600"
                            />
                            {cl.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ====================================================================
          RESUMO DAS CONFIGURAÇÕES ANTES DE GERAR O RELATÓRIO
      ==================================================================== */}
      <div className="bg-slate-900 text-slate-100 rounded-xl p-4 shadow-sm space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-blue-300 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-400" />
            Resumo da Configuração Antes de Gerar o Relatório
          </span>
          <span className="text-[11px] text-slate-400">Somente leitura • Isolamento por área ({areaSigla})</span>
        </div>
        <ul className="text-xs space-y-1 text-slate-200 list-disc list-inside">
          {resumoConfiguracoes.map((linha, idx) => (
            <li key={idx}>{linha}</li>
          ))}
        </ul>
      </div>

      {erroRelatorio && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-xs text-rose-800 font-medium flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          {erroRelatorio}
        </div>
      )}

      {/* ====================================================================
          VISUALIZAÇÃO EM TELA DO RELATÓRIO GERADO
      ==================================================================== */}
      {resultado && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden space-y-4">
          {/* Cabeçalho Institucional Completo */}
          <div className="p-5 bg-slate-900 text-white space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-bold">{resultado.titulo}</h2>
                <p className="text-xs text-slate-300 mt-0.5">
                  Área: <strong>{resultado.area_nome} ({resultado.area_sigla})</strong> | Data/Hora de Emissão:{' '}
                  <strong>{resultado.data_emissao}</strong> | Emitido por: <strong>{resultado.usuario_emissor}</strong>
                </p>
              </div>
              <div className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs font-bold">
                {resultado.total_registros} registro(s) encontrado(s)
              </div>
            </div>

            {resultado.curva_abc && resultado.curva_abc.ativa && (
              <div className="p-3 rounded-lg bg-slate-800/90 border border-slate-700 text-[11px] text-slate-200 space-y-1">
                <div className="font-bold text-blue-300 uppercase">Parâmetros da Curva ABC Aplicados:</div>
                <div>
                  Indicador: <strong>{resultado.curva_abc.indicador_label}</strong> | Origem do Custo:{' '}
                  <strong>{resultado.curva_abc.origem_custo}</strong>
                </div>
                <div>
                  Faixas: <strong>{resultado.curva_abc.faixas_acumuladas}</strong> | Abrangência:{' '}
                  <strong>{resultado.curva_abc.abrangencia}</strong>
                </div>
                <div>
                  Fronteira: {resultado.curva_abc.regra_fronteira} | Empates: {resultado.curva_abc.regra_empate}
                </div>
              </div>
            )}

            {Array.isArray(resultado.avisos) && resultado.avisos.length > 0 && (
              <div className="space-y-1">
                {resultado.avisos.map((av: string, idx: number) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded bg-amber-500/20 border border-amber-400/40 text-amber-200 text-xs flex items-start gap-2"
                  >
                    <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-300" />
                    <span>{av}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tabela de Dados */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 text-[11px] font-bold text-slate-700 uppercase">
                  {(resultado.colunas || []).map((col: any) => (
                    <th key={col.id} className="py-2.5 px-3">
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {resultado.grupos_render && Array.isArray(resultado.grupos_render) ? (
                  resultado.grupos_render.length === 0 ? (
                    <tr>
                      <td colSpan={(resultado.colunas || []).length || 1} className="py-8 text-center text-slate-400">
                        Nenhum registro encontrado para os critérios selecionados.
                      </td>
                    </tr>
                  ) : (
                    resultado.grupos_render.map((grp: any) => (
                      <React.Fragment key={grp.chave}>
                        <tr className="bg-slate-200/80 font-bold text-slate-900">
                          <td colSpan={(resultado.colunas || []).length || 1} className="py-2 px-3">
                            Agrupamento: {grp.titulo} ({grp.linhas.length} registro(s))
                          </td>
                        </tr>
                        {grp.linhas.map((row: any, rIdx: number) => (
                          <tr key={`${grp.chave}-${rIdx}`} className="hover:bg-slate-50">
                            {(resultado.colunas || []).map((col: any) => (
                              <td key={col.id} className="py-2 px-3 align-top break-words">
                                {col.tipo === 'classe_abc' ? (
                                  <span
                                    className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                                      row.classe_abc === 'A'
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : row.classe_abc === 'B'
                                        ? 'bg-amber-100 text-amber-800'
                                        : row.classe_abc === 'C'
                                        ? 'bg-blue-100 text-blue-800'
                                        : 'bg-slate-100 text-slate-600'
                                    }`}
                                  >
                                    {row.classe_abc || 'SC'}
                                  </span>
                                ) : (
                                  formatarCelula(row[col.id], col.tipo)
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                        {grp.subtotal && (
                          <tr className="bg-slate-100 font-bold text-slate-900 border-t border-slate-300">
                            {(resultado.colunas || []).map((col: any, cIdx: number) => {
                              if (cIdx === 0) {
                                return (
                                  <td key={col.id} className="py-2 px-3">
                                    Subtotal ({grp.titulo})
                                  </td>
                                );
                              }
                              if (
                                ['entradas', 'saidas', 'quantidade_consumida', 'saldo_inicial', 'saldo_final'].includes(
                                  col.id
                                )
                              ) {
                                return (
                                  <td key={col.id} className="py-2 px-3">
                                    {!grp.subtotal.mesma_unidade
                                      ? 'Unidades mistas'
                                      : grp.subtotal[col.id] !== null && grp.subtotal[col.id] !== undefined
                                      ? `${formatarCelula(grp.subtotal[col.id], 'numero')} ${grp.subtotal.unidade || ''}`
                                      : '-'}
                                  </td>
                                );
                              }
                              if (col.id === 'custo_unitario') {
                                return (
                                  <td key={col.id} className="py-2 px-3 text-slate-400">
                                    -
                                  </td>
                                );
                              }
                              if (col.id === 'valor_total') {
                                return (
                                  <td key={col.id} className="py-2 px-3">
                                    {grp.subtotal.valor_total !== null && grp.subtotal.valor_total !== undefined
                                      ? formatarCelula(grp.subtotal.valor_total, 'moeda')
                                      : '-'}
                                  </td>
                                );
                              }
                              return <td key={col.id} className="py-2 px-3" />;
                            })}
                          </tr>
                        )}
                      </React.Fragment>
                    ))
                  )
                ) : (resultado.linhas || []).length === 0 ? (
                  <tr>
                    <td colSpan={(resultado.colunas || []).length || 1} className="py-8 text-center text-slate-400">
                      Nenhum registro encontrado para os critérios selecionados.
                    </td>
                  </tr>
                ) : (
                  (resultado.linhas || []).map((row: any, rIdx: number) => (
                    <tr key={rIdx} className="hover:bg-slate-50">
                      {(resultado.colunas || []).map((col: any) => (
                        <td key={col.id} className="py-2 px-3 align-top break-words">
                          {col.tipo === 'classe_abc' ? (
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                                row.classe_abc === 'A'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : row.classe_abc === 'B'
                                  ? 'bg-amber-100 text-amber-800'
                                  : row.classe_abc === 'C'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {row.classe_abc || 'SC'}
                            </span>
                          ) : (
                            formatarCelula(row[col.id], col.tipo)
                          )}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>

              {resultado.total_geral && (
                <tfoot>
                  <tr className="bg-slate-900 text-white font-bold text-xs">
                    {(resultado.colunas || []).map((col: any, cIdx: number) => {
                      const tg = resultado.total_geral;
                      if (cIdx === 0) {
                        return (
                          <td key={col.id} className="py-2.5 px-3">
                            TOTAL GERAL ({tg.total_linhas} linha(s))
                          </td>
                        );
                      }
                      if (
                        ['entradas', 'saidas', 'quantidade_consumida', 'saldo_inicial', 'saldo_final'].includes(col.id)
                      ) {
                        return (
                          <td key={col.id} className="py-2.5 px-3">
                            {!tg.mesma_unidade
                              ? 'Unidades mistas'
                              : tg[col.id] !== null && tg[col.id] !== undefined
                              ? `${formatarCelula(tg[col.id], 'numero')} ${tg.unidade || ''}`
                              : '-'}
                          </td>
                        );
                      }
                      if (col.id === 'custo_unitario') {
                        return (
                          <td key={col.id} className="py-2.5 px-3 text-slate-400">
                            -
                          </td>
                        );
                      }
                      if (col.id === 'valor_total') {
                        return (
                          <td key={col.id} className="py-2.5 px-3">
                            {tg.valor_total !== null && tg.valor_total !== undefined
                              ? formatarCelula(tg.valor_total, 'moeda')
                              : '-'}
                          </td>
                        );
                      }
                      return <td key={col.id} className="py-2.5 px-3" />;
                    })}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
export default RelatoriosView;
