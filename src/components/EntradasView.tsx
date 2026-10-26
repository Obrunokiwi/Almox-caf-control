import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  PackagePlus,
  Plus,
  Search,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  Save,
  Building2,
  Calendar,
  DollarSign,
  Printer,
  Download,
  Truck,
  Package,
  Tag,
  Lock,
  Unlock,
  Eye,
  Trash2,
  History,
  X,
  FileText,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import type {
  Produto,
  Fornecedor,
  Usuario,
  Movimentacao,
  EmpresaUnidade,
  CentroCusto,
  NotaFiscal,
  NotaFiscalItem,
  HistoricoNotaFiscal,
} from '../types/index.ts';
import {
  generateComprovanteNotaFiscalPDF,
  generateRelatorioMovimentacoesTelaPDF,
  type PdfGeneratedDocument,
} from '../utils/pdfGenerator.ts';
import { PdfPrintModal } from './PdfPrintModal.tsx';
import { HelpFloatingModal } from './HelpFloatingModal.tsx';
import { CentroCustoAlertBanner } from './CentroCustoAlertBanner.tsx';
import { SearchableSelect, type SearchableOption } from './SearchableSelect.tsx';
import { useToast } from '../context/ToastContext.tsx';

interface EntradasViewProps {
  produtos: Produto[];
  fornecedores?: Fornecedor[];
  centrosCusto?: CentroCusto[];
  movimentacoes: Movimentacao[];
  currentUser: Usuario | null;
  activeUnidade?: EmpresaUnidade | null;
  onRefresh: () => void;
  isCreateModalOpen?: boolean;
  setIsCreateModalOpen?: (open: boolean) => void;
  onVoltar?: () => void;
  onNavigate?: (tab: string) => void;
}

// Formata data e hora para o padrão de Brasília (dd/mm/aaaa HH:mm:ss, sem fuso)
function formatBrasiliaDateTime(dateStr?: string | null): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
  } catch {
    return String(dateStr);
  }
}

function formatDataValidade(dateStr?: string | null): string {
  if (!dateStr) return '—';
  try {
    const clean = dateStr.slice(0, 10);
    const parts = clean.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return clean;
  } catch {
    return String(dateStr);
  }
}

export const EntradasView: React.FC<EntradasViewProps> = ({
  produtos,
  fornecedores = [],
  centrosCusto = [],
  movimentacoes,
  currentUser,
  activeUnidade,
  onRefresh,
  isCreateModalOpen = false,
  setIsCreateModalOpen,
  onVoltar,
  onNavigate,
}) => {
  const { toast } = useToast();
  const canManage = currentUser && (currentUser.perfil === 'admin' || currentUser.perfil === 'almoxarife');

  // Estado da listagem de Notas Fiscais agrupadas (A.1)
  const [notasList, setNotasList] = useState<NotaFiscal[]>([]);
  const [isLoadingNotas, setIsLoadingNotas] = useState(false);

  // Filtros de busca da tela
  const [filtroDoc, setFiltroDoc] = useState('');
  const [filtroProduto, setFiltroProduto] = useState('');
  const [filtroSituacao, setFiltroSituacao] = useState<'todas' | 'ABERTA' | 'FECHADA'>('todas');
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filtroDoc.trim()) count++;
    if (filtroProduto.trim()) count++;
    if (filtroSituacao !== 'todas') count++;
    return count;
  }, [filtroDoc, filtroProduto, filtroSituacao]);

  const handleLimparFiltros = () => {
    setFiltroDoc('');
    setFiltroProduto('');
    setFiltroSituacao('todas');
    setCurrentPage(1);
  };

  // Paginação da listagem
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Estado do Modal de Detalhe / Edição de Nota (A.2, A.3, A.4)
  const [selectedNotaId, setSelectedNotaId] = useState<number | null>(null);
  const [detalheNota, setDetalheNota] = useState<NotaFiscal | null>(null);
  const [detalheItens, setDetalheItens] = useState<NotaFiscalItem[]>([]);
  const [detalheHistorico, setDetalheHistorico] = useState<HistoricoNotaFiscal[]>([]);
  const [isLoadingDetalhe, setIsLoadingDetalhe] = useState(false);
  const [isEditingNota, setIsEditingNota] = useState(false);
  const [isConfirmingImpacto, setIsConfirmingImpacto] = useState(false);
  const [impactoSummary, setImpactoSummary] = useState<string[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Estado do Formulário de Criação de Nova Nota Fiscal
  const [isNewNotaOpen, setIsNewNotaOpen] = useState(isCreateModalOpen);
  const [newNotaDoc, setNewNotaDoc] = useState(`NF-${Math.floor(10000 + Math.random() * 90000)}`);
  const [newNotaFornecedorId, setNewNotaFornecedorId] = useState<number>(fornecedores[0]?.id || 0);
  const [newNotaCentroCustoId, setNewNotaCentroCustoId] = useState<number>(centrosCusto[0]?.id || 0);
  const [newNotaObservacao, setNewNotaObservacao] = useState('Recebimento e conferência física');
  const [newNotaItens, setNewNotaItens] = useState<
    Array<{
      tempId: string;
      produto_id: number;
      numero_lote: string;
      data_validade: string;
      quantidade: number;
      valor_unitario: number;
      marca: string;
      nomenclatura_fornecedor: string;
    }>
  >([]);

  // Preview de PDF
  const [pdfPreviewDoc, setPdfPreviewDoc] = useState<PdfGeneratedDocument | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  // Sincroniza abertura do modal externo se passado via prop
  useEffect(() => {
    if (isCreateModalOpen) {
      handleAbrirNovaNota();
    }
  }, [isCreateModalOpen]);

  // Carrega lista de Notas Fiscais da API
  const carregarNotas = useCallback(async () => {
    if (!canManage) return;
    setIsLoadingNotas(true);
    try {
      const params = new URLSearchParams();
      if (filtroDoc.trim()) params.append('busca', filtroDoc.trim());
      if (filtroProduto.trim()) params.append('produto_busca', filtroProduto.trim());
      if (filtroSituacao !== 'todas') params.append('situacao', filtroSituacao);

      const res = await fetch(`/api/notas-fiscais?${params.toString()}`, {
        headers: {
          Authorization: `user:${currentUser?.id}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setNotasList(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Erro ao carregar notas fiscais:', err);
    } finally {
      setIsLoadingNotas(false);
    }
  }, [canManage, filtroDoc, filtroProduto, filtroSituacao, currentUser?.id]);

  useEffect(() => {
    carregarNotas();
  }, [carregarNotas]);

  // Carrega os detalhes completos de uma nota específica (A.2)
  const carregarDetalheNota = async (notaId: number) => {
    setIsLoadingDetalhe(true);
    setValidationError(null);
    try {
      const res = await fetch(`/api/notas-fiscais/${notaId}`, {
        headers: {
          Authorization: `user:${currentUser?.id}`,
        },
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Erro ao carregar detalhes da nota fiscal.');
      }
      const data = await res.json();
      setDetalheNota(data.nota);
      setDetalheItens(data.itens || []);
      setDetalheHistorico(data.historico || []);
      setSelectedNotaId(notaId);
      setIsEditingNota(false);
      setIsConfirmingImpacto(false);
    } catch (err: any) {
      toast.error('Erro ao Abrir Nota', err.message);
    } finally {
      setIsLoadingDetalhe(false);
    }
  };

  // Prepara opções para o SearchableSelect
  const fornecedoresOptions: SearchableOption[] = useMemo(() => {
    return fornecedores
      .filter((f) => f.ativo === 1)
      .map((f) => ({
        value: f.id,
        label: `${f.codigo} - ${f.nome_fantasia || f.razao_social}`,
        secondaryLabel: f.cnpj ? `CNPJ: ${f.cnpj}` : undefined,
        keywords: `${f.razao_social} ${f.nome_fantasia || ''} ${f.cnpj || ''}`,
      }));
  }, [fornecedores]);

  const centrosCustoOptions: SearchableOption[] = useMemo(() => {
    return centrosCusto
      .filter((c) => c.ativo !== 0)
      .map((c) => ({
        value: c.id,
        label: `${c.codigo} - ${c.nome}`,
        secondaryLabel: c.departamento ? `(${c.departamento})` : undefined,
      }));
  }, [centrosCusto]);

  const produtosOptions: SearchableOption[] = useMemo(() => {
    return produtos
      .filter((p) => p.ativo === 1)
      .map((p) => ({
        value: p.id,
        label: `${p.codigo} - ${p.nome}`,
        secondaryLabel: `${p.unidade_medida} • Saldo: ${p.quantidade_atual}`,
        badge: p.tipo === 'consumivel' ? 'Consumível' : 'Patrimônio',
        badgeVariant: p.tipo === 'consumivel' ? 'info' : 'regular',
        keywords: `${p.codigo} ${p.nome} ${p.descricao || ''}`,
      }));
  }, [produtos]);

  const situacaoOptions: SearchableOption[] = [
    { value: 'todas', label: 'Todas as Situações' },
    { value: 'ABERTA', label: 'ABERTA (Em Conferência / Editável)', badge: 'Aberta', badgeVariant: 'warning' },
    { value: 'FECHADA', label: 'FECHADA (Concluída / Bloqueada)', badge: 'Fechada', badgeVariant: 'regular' },
  ];

  // Paginação de notas
  const totalPages = Math.ceil(notasList.length / pageSize) || 1;
  const paginatedNotas = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return notasList.slice(start, start + pageSize);
  }, [notasList, currentPage, pageSize]);

  // Abertura do formulário de criação de nova nota fiscal
  const handleAbrirNovaNota = () => {
    const defaultFornId = fornecedores[0]?.id || 0;
    const defaultCcId = centrosCusto[0]?.id || 0;
    const defaultProdId = produtos[0]?.id || 0;

    setNewNotaDoc(`NF-${Math.floor(10000 + Math.random() * 90000)}`);
    setNewNotaFornecedorId(defaultFornId);
    setNewNotaCentroCustoId(defaultCcId);
    setNewNotaObservacao('Recebimento e conferência física');

    // Inicializa com 1 item padrão
    setNewNotaItens([
      {
        tempId: String(Date.now()),
        produto_id: defaultProdId,
        numero_lote: `LT-${Math.floor(1000 + Math.random() * 9000)}`,
        data_validade: '2027-12-31',
        quantidade: 50,
        valor_unitario: 10.0,
        marca: '',
        nomenclatura_fornecedor: '',
      },
    ]);

    setIsNewNotaOpen(true);
    if (setIsCreateModalOpen) setIsCreateModalOpen(true);
  };

  const handleAddNewItemToNewNota = () => {
    const defaultProdId = produtos[0]?.id || 0;
    setNewNotaItens((prev) => [
      ...prev,
      {
        tempId: String(Date.now() + Math.random()),
        produto_id: defaultProdId,
        numero_lote: `LT-${Math.floor(1000 + Math.random() * 9000)}`,
        data_validade: '2027-12-31',
        quantidade: 10,
        valor_unitario: 0,
        marca: '',
        nomenclatura_fornecedor: '',
      },
    ]);
  };

  const handleRemoveItemFromNewNota = (tempId: string) => {
    if (newNotaItens.length <= 1) {
      toast.warning('Aviso', 'A nota fiscal deve conter ao menos 1 item.');
      return;
    }
    setNewNotaItens((prev) => prev.filter((it) => it.tempId !== tempId));
  };

  const handleSalvarNovaNota = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNotaDoc.trim()) {
      toast.error('Campo Obrigatório', 'Informe o número do documento / NF.');
      return;
    }
    if (!newNotaFornecedorId) {
      toast.error('Campo Obrigatório', 'Selecione o Fornecedor da Nota Fiscal.');
      return;
    }
    if (newNotaItens.length === 0) {
      toast.error('Itens Obrigatórios', 'Adicione ao menos um item à Nota Fiscal.');
      return;
    }

    // Valida cada item
    for (const it of newNotaItens) {
      if (!it.produto_id || Number(it.quantidade) <= 0) {
        toast.error('Item Inválido', 'Todos os itens devem ter produto selecionado e quantidade maior que zero.');
        return;
      }
      const prod = produtos.find((p) => p.id === it.produto_id);
      const exigeValidade = prod?.controla_validade === undefined ? prod?.tipo === 'consumivel' : prod?.controla_validade === 1;
      if (exigeValidade && (!it.numero_lote.trim() || !it.data_validade.trim())) {
        toast.error('Lote Obrigatório', `O item "${prod?.codigo} - ${prod?.nome}" exige número de lote e validade.`);
        return;
      }
    }

    setIsProcessingAction(true);
    try {
      const res = await fetch('/api/entradas', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `user:${currentUser?.id}`,
        },
        body: JSON.stringify({
          documento_referencia: newNotaDoc.trim().toUpperCase(),
          fornecedor_id: newNotaFornecedorId,
          centro_custo_id: newNotaCentroCustoId || null,
          observacao: newNotaObservacao.trim() || null,
          itens: newNotaItens.map((it) => ({
            produto_id: it.produto_id,
            quantidade: Number(it.quantidade),
            numero_lote: it.numero_lote.trim().toUpperCase(),
            data_validade: it.data_validade.trim(),
            valor_unitario: Number(it.valor_unitario) || 0,
            marca: it.marca ? it.marca.trim() : null,
            nomenclatura_fornecedor: it.nomenclatura_fornecedor ? it.nomenclatura_fornecedor.trim() : null,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao registrar Nota Fiscal.');
      }

      toast.success(
        'Nota Fiscal Registrada (ABERTA)',
        `Documento ${newNotaDoc.trim().toUpperCase()} registrado com ${newNotaItens.length} item(ns).`
      );

      setIsNewNotaOpen(false);
      if (setIsCreateModalOpen) setIsCreateModalOpen(false);
      onRefresh();
      carregarNotas();
    } catch (err: any) {
      toast.error('Falha ao Registrar Nota', err.message);
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Manipulação de Edição na Nota Aberta (A.3)
  const handleAddNewItemToDetalhe = () => {
    const defaultProdId = produtos[0]?.id || 0;
    const defaultProd = produtos.find((p) => p.id === defaultProdId);
    setDetalheItens((prev) => [
      ...prev,
      {
        produto_id: defaultProdId,
        produto_codigo: defaultProd?.codigo || 'MAT-NOVO',
        produto_nome: defaultProd?.nome || 'Novo Material',
        unidade_medida: defaultProd?.unidade_medida || 'UN',
        numero_lote: `LT-${Math.floor(1000 + Math.random() * 9000)}`,
        data_validade: '2027-12-31',
        quantidade: 10,
        valor_unitario: 0,
        marca: '',
        nomenclatura_fornecedor: '',
        saldo_atual_lote: 0,
        consumido_lote: 0,
      },
    ]);
  };

  const handleRemoveItemFromDetalhe = (index: number) => {
    const targetItem = detalheItens[index];
    if (detalheItens.length <= 1) {
      toast.warning('Aviso', 'A nota fiscal deve possuir ao menos um item.');
      return;
    }

    // Regra estrita A.3: se o item já teve saídas/consumo, bloqueia a remoção
    if (targetItem.consumido_lote && targetItem.consumido_lote > 0) {
      const msg = `Correção bloqueada: O lote "${targetItem.numero_lote || '—'}" do produto "${targetItem.produto_codigo} - ${targetItem.produto_nome}" já teve ${targetItem.consumido_lote} unidades consumidas/dispensadas. Este item não pode ser removido da nota fiscal.`;
      setValidationError(msg);
      toast.error('Bloqueio por Consumo', msg);
      return;
    }

    setDetalheItens((prev) => prev.filter((_, i) => i !== index));
    setValidationError(null);
  };

  // Prepara resumo do impacto no saldo antes de confirmar a correção (A.3)
  const handlePrepararImpacto = () => {
    if (!detalheNota) return;
    setValidationError(null);

    // Validação de saldo negativo e consumo já ocorrido
    for (const it of detalheItens) {
      if (!it.produto_id || Number(it.quantidade) <= 0) {
        setValidationError('Todos os itens devem ter produto válido e quantidade maior que zero.');
        return;
      }
      if (it.consumido_lote && it.consumido_lote > 0 && Number(it.quantidade) < it.consumido_lote) {
        const msg = `Correção bloqueada: O lote "${it.numero_lote || '—'}" do produto "${it.produto_codigo} - ${it.produto_nome}" já teve ${it.consumido_lote} unidades consumidas/dispensadas. A nova quantidade não pode ser menor que ${it.consumido_lote}.`;
        setValidationError(msg);
        toast.error('Bloqueio de Saldo Negativo', msg);
        return;
      }
    }

    // Monta resumo do impacto
    const summary: string[] = [];
    for (const it of detalheItens) {
      const prod = produtos.find((p) => p.id === it.produto_id);
      const prodLabel = `${it.produto_codigo || prod?.codigo} - ${it.produto_nome || prod?.nome}`;
      if (!it.movimentacao_id) {
        summary.push(`+ Novo item: ${prodLabel} (+${it.quantidade} ${it.unidade_medida}, Lote: ${it.numero_lote || '—'})`);
      } else {
        summary.push(
          `• Item ${prodLabel}: lote "${it.numero_lote || '—'}" com ${it.quantidade} ${it.unidade_medida} (consumido até o momento: ${it.consumido_lote || 0} un.)`
        );
      }
    }

    setImpactoSummary(summary);
    setIsConfirmingImpacto(true);
  };

  // Salva correção da Nota Fiscal (A.3)
  const handleSalvarCorrecaoNota = async () => {
    if (!detalheNota) return;
    setIsProcessingAction(true);
    setValidationError(null);

    try {
      const res = await fetch(`/api/notas-fiscais/${detalheNota.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `user:${currentUser?.id}`,
        },
        body: JSON.stringify({
          numero_documento: detalheNota.numero_documento.trim().toUpperCase(),
          fornecedor_id: detalheNota.fornecedor_id || null,
          centro_custo_id: detalheNota.centro_custo_id || null,
          observacao: detalheNota.observacao || null,
          itens: detalheItens.map((it) => ({
            movimentacao_id: it.movimentacao_id,
            produto_id: it.produto_id,
            quantidade: Number(it.quantidade),
            numero_lote: it.numero_lote ? String(it.numero_lote).trim().toUpperCase() : null,
            data_validade: it.data_validade ? String(it.data_validade).trim().slice(0, 10) : null,
            valor_unitario: Number(it.valor_unitario) || 0,
            marca: it.marca ? String(it.marca).trim() : null,
            nomenclatura_fornecedor: it.nomenclatura_fornecedor ? String(it.nomenclatura_fornecedor).trim() : null,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao salvar correções da nota fiscal.');
      }

      toast.success('Nota Fiscal Corrigida', 'Correções salvas com geração automática de estorno e nova entrada.');
      setIsConfirmingImpacto(false);
      setIsEditingNota(false);
      onRefresh();
      carregarNotas();
      carregarDetalheNota(detalheNota.id);
    } catch (err: any) {
      setValidationError(err.message);
      toast.error('Erro na Correção', err.message);
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Fechamento da Nota Fiscal (A.4)
  const handleFecharNota = async () => {
    if (!detalheNota) return;

    const confirmou = window.confirm(
      'Após fechar, a nota não poderá mais ser alterada. Deseja fechar?'
    );
    if (!confirmou) return;

    setIsProcessingAction(true);
    try {
      const res = await fetch(`/api/notas-fiscais/${detalheNota.id}/fechar`, {
        method: 'POST',
        headers: {
          Authorization: `user:${currentUser?.id}`,
        },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao fechar nota fiscal.');
      }

      toast.success(
        'Nota Fiscal FECHADA',
        `Nota ${detalheNota.numero_documento} fechada em definitivo. Todos os campos foram travados como somente leitura.`
      );

      setIsEditingNota(false);
      setIsConfirmingImpacto(false);
      onRefresh();
      carregarNotas();
      carregarDetalheNota(detalheNota.id);
    } catch (err: any) {
      toast.error('Erro ao Fechar Nota', err.message);
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Gera comprovante PDF da Nota Fiscal
  const handleGerarPdfNota = async (nota: NotaFiscal, mode: 'print' | 'download' = 'print') => {
    setIsGeneratingPdf(true);
    try {
      // Se já temos os itens da nota selecionada em memória, usamos diretamente
      let itensNota = detalheItens;
      if (!detalheNota || detalheNota.id !== nota.id) {
        const res = await fetch(`/api/notas-fiscais/${nota.id}`, {
          headers: { Authorization: `user:${currentUser?.id}` },
        });
        if (res.ok) {
          const data = await res.json();
          itensNota = data.itens || [];
        }
      }

      const doc = await generateComprovanteNotaFiscalPDF({
        nota,
        itens: itensNota,
        currentUser,
        activeUnidade,
        mode,
      });

      if (mode === 'print') {
        setPdfPreviewDoc(doc);
      } else {
        toast.success('Download Concluído', `PDF da Nota Fiscal ${nota.numero_documento} baixado.`);
      }
    } catch (err: any) {
      toast.error('Erro ao Gerar PDF', err.message);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Se o usuário for requisitante, bloqueia acesso a esta tela (A.2)
  if (!canManage) {
    return (
      <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm text-center space-y-3">
        <div className="p-3 bg-rose-50 text-rose-700 w-12 h-12 rounded-full mx-auto flex items-center justify-center">
          <Lock className="w-6 h-6" />
        </div>
        <h2 className="text-base font-bold text-slate-800">Acesso Restrito ao Almoxarifado</h2>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          Usuários com perfil Requisitante não possuem acesso ao módulo de Entrada de Estoque por Nota Fiscal.
          Utilize o módulo &ldquo;Requisição&rdquo; para solicitar materiais.
        </p>
        {onVoltar && (
          <button
            type="button"
            onClick={onVoltar}
            className="mt-2 bg-teal-600 hover:bg-teal-700 text-white font-medium px-4 py-2 rounded text-xs inline-flex items-center gap-1.5 transition-all shadow cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar ao Painel Principal</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho Compacto */}
      <div className="bg-white px-4 py-3 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-teal-100 text-teal-800 rounded-lg">
            <PackagePlus className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800 tracking-tight">Entrada de Estoque por Nota Fiscal</h1>
            <p className="text-xs text-slate-500">
              Gestão por Documento Fiscal: Abertura, Conferência, Correção e Fechamento com Imutabilidade
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <HelpFloatingModal
            title="Ajuda — Entrada por Nota Fiscal"
            subtitle="Regras de Abertura, Correção e Fechamento de Notas"
            currentStep={3}
            onNavigate={onNavigate}
            sections={[
              {
                title: 'Listagem por Nota Fiscal',
                badge: 'A.1 Agrupado',
                tone: 'teal',
                description:
                  'A listagem exibe uma linha por Documento Fiscal, indicando a Situação (ABERTA em amarelo ou FECHADA em verde), quantidade de itens e responsável.',
              },
              {
                title: 'Correção de Notas Abertas',
                badge: 'A.3 Imutabilidade',
                tone: 'amber',
                description:
                  'Enquanto ABERTA, a nota permite correções de cabeçalho e de itens. Cada alteração que afete o saldo gera automaticamente um estorno do lançamento anterior e nova entrada. A redução abaixo do saldo consumido é sumariamente bloqueada.',
              },
              {
                title: 'Fechamento Definitivo',
                badge: 'A.4 Somente Leitura',
                tone: 'blue',
                description:
                  'Ao clicar em "FECHAR NOTA", a situação muda para FECHADA e todos os campos ficam bloqueados em modo somente leitura. Não há reabertura.',
              },
            ]}
          />

          {onVoltar && (
            <button
              type="button"
              onClick={onVoltar}
              className="bg-teal-600 hover:bg-teal-700 text-white font-medium px-4 py-2 rounded text-xs flex items-center gap-1.5 transition-all shadow uppercase tracking-wide cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>VOLTAR AO PAINEL</span>
            </button>
          )}
        </div>
      </div>

      {/* Alerta de Centro de Custo Vazio */}
      {currentUser?.perfil === 'admin' && centrosCusto.filter((cc) => cc.ativo === 1).length === 0 && (
        <CentroCustoAlertBanner
          isAdmin={currentUser?.perfil === 'admin'}
          onCadastrarCentroCusto={() => onNavigate?.('centros-custo')}
          mensagemPersonalizada="Cadastre ao menos um Centro de Custo para começar a receber notas e estocar materiais."
        />
      )}

      {/* Top Action Bar: + NOVA NOTA FISCAL e 🔍 FILTROS */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-teal-50 text-teal-800 rounded-lg">
            <PackagePlus className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-800">Entradas por Nota Fiscal</h2>
            <p className="text-[11px] text-slate-500">Lançamento de notas fiscais e recebimento de materiais</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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
            onClick={handleAbrirNovaNota}
            className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-medium px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 transition-all shadow-sm uppercase tracking-wide cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span className="font-bold">NOVA NOTA FISCAL</span>
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Documento / NF ou Fornecedor
              </label>
              <input
                type="text"
                value={filtroDoc}
                onChange={(e) => {
                  setFiltroDoc(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Pesquisar por NF, fornecedor, CNPJ..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded text-xs text-slate-800 focus:bg-white focus:border-teal-500 shadow-inner"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Produto contido na Nota
              </label>
              <input
                type="text"
                value={filtroProduto}
                onChange={(e) => {
                  setFiltroProduto(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Código ou nome do produto na NF..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded text-xs text-slate-800 focus:bg-white focus:border-teal-500 shadow-inner"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Situação da Nota Fiscal
              </label>
              <SearchableSelect
                options={situacaoOptions}
                value={filtroSituacao}
                onChange={(val) => {
                  setFiltroSituacao(val || 'todas');
                  setCurrentPage(1);
                }}
                placeholder="Filtrar por situação..."
                allowClear={false}
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
              onClick={() => setCurrentPage(1)}
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

      {/* Grid de Notas Fiscais Agrupadas por Nota (A.1) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3">Data / Hora Lançamento</th>
                <th className="py-2.5 px-3">Documento / NF</th>
                <th className="py-2.5 px-3">Fornecedor</th>
                <th className="py-2.5 px-3 text-center">Qtd de Itens</th>
                <th className="py-2.5 px-3">Responsável</th>
                <th className="py-2.5 px-3 text-center">Situação</th>
                <th className="py-2.5 px-3 text-right">Ações & Comprovante PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoadingNotas ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">
                    <div className="inline-block animate-spin w-5 h-5 border-2 border-teal-600 border-t-transparent rounded-full mr-2" />
                    Carregando notas fiscais...
                  </td>
                </tr>
              ) : paginatedNotas.length > 0 ? (
                paginatedNotas.map((nota) => {
                  const isFechada = nota.situacao === 'FECHADA';
                  return (
                    <tr
                      key={nota.id}
                      onClick={() => carregarDetalheNota(nota.id)}
                      className="odd:bg-white even:bg-slate-50/70 hover:bg-teal-50/50 transition-colors cursor-pointer"
                    >
                      <td className="py-2 px-3 text-slate-600 font-mono text-[11px]">
                        {formatBrasiliaDateTime(nota.data_emissao)}
                      </td>
                      <td className="py-2 px-3 font-mono font-bold text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-teal-600" />
                          <span>{nota.numero_documento}</span>
                        </div>
                      </td>
                      <td className="py-2 px-3 font-medium text-slate-800 max-w-xs truncate">
                        <div>{nota.fornecedor_nome || '—'}</div>
                        {nota.fornecedor_cnpj && (
                          <div className="text-[10px] text-slate-400 font-mono">CNPJ: {nota.fornecedor_cnpj}</div>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center font-bold text-slate-700">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 border border-slate-200">
                          {nota.total_itens || 0} item(ns)
                        </span>
                      </td>
                      <td className="py-2 px-3 text-slate-600">{nota.responsavel_nome}</td>
                      <td className="py-2 px-3 text-center">
                        {isFechada ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            <Lock className="w-3 h-3" />
                            FECHADA
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 animate-pulse">
                            <Unlock className="w-3 h-3" />
                            ABERTA
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => carregarDetalheNota(nota.id)}
                            className="px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-white hover:bg-slate-100 rounded border border-slate-300 inline-flex items-center gap-1 cursor-pointer transition-colors"
                            title="Abrir detalhe da nota fiscal"
                          >
                            <Eye className="w-3 h-3 text-slate-500" />
                            <span>Detalhes</span>
                          </button>

                          <button
                            type="button"
                            disabled={isGeneratingPdf}
                            onClick={() => handleGerarPdfNota(nota, 'print')}
                            className="px-2.5 py-1 text-[11px] font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 rounded border border-teal-200 inline-flex items-center gap-1 cursor-pointer transition-colors"
                            title="Imprimir comprovante da nota em PDF"
                          >
                            <Printer className="w-3 h-3 text-teal-700" />
                            <span>Imprimir</span>
                          </button>

                          <button
                            type="button"
                            disabled={isGeneratingPdf}
                            onClick={() => handleGerarPdfNota(nota, 'download')}
                            className="p-1 text-slate-600 hover:text-blue-700 bg-slate-100 hover:bg-blue-50 rounded border border-slate-200 cursor-pointer"
                            title="Baixar comprovante PDF"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    Nenhuma nota fiscal localizada com os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Rodapé de Paginação */}
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
          <div>
            Página <strong>{currentPage}</strong> de <strong>{totalPages}</strong> ({notasList.length} notas no total)
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 transition-all cursor-pointer"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 transition-all cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 py-1 font-semibold text-slate-700">
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 transition-all cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 transition-all cursor-pointer"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL DE DETALHE / EDIÇÃO DA NOTA FISCAL (A.2, A.3, A.4)                 */}
      {/* ========================================================================= */}
      {selectedNotaId && detalheNota && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-start justify-center p-3 sm:p-6 py-8 sm:py-12 animate-fadeIn">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-5xl my-0 overflow-visible flex flex-col">
            {/* Cabeçalho do Modal */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div
                  className={`p-2 rounded-lg ${
                    detalheNota.situacao === 'FECHADA'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-slate-900">
                      Nota Fiscal: {detalheNota.numero_documento}
                    </h2>
                    {detalheNota.situacao === 'FECHADA' ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                        FECHADA (Somente Leitura)
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                        ABERTA (Editável)
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    Lançada em {formatBrasiliaDateTime(detalheNota.data_emissao)} por {detalheNota.responsavel_nome}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleGerarPdfNota(detalheNota, 'print')}
                  className="px-3 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 rounded border border-teal-200 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Imprimir PDF</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedNotaId(null)}
                  className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Conteúdo com rolagem interna */}
            <div className="p-6 space-y-6 overflow-y-auto flex-1 text-xs">
              {validationError && (
                <div className="p-3 bg-rose-50 border border-rose-300 rounded-lg text-rose-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="flex-1">{validationError}</div>
                </div>
              )}

              {/* Banner de Fechamento se a Nota estiver FECHADA */}
              {detalheNota.situacao === 'FECHADA' && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span className="font-medium">
                    Nota fechada em {formatBrasiliaDateTime(detalheNota.fechada_em)} por{' '}
                    <strong>{detalheNota.fechada_por_nome || 'Almoxarife'}</strong>. Todos os campos estão em modo
                    somente leitura.
                  </span>
                </div>
              )}

              {/* Informações do Cabeçalho da Nota (A.2) */}
              <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                    Dados do Cabeçalho Fiscal
                  </span>
                  {detalheNota.situacao === 'ABERTA' && !isEditingNota && (
                    <button
                      type="button"
                      onClick={() => setIsEditingNota(true)}
                      className="text-teal-700 hover:text-teal-900 font-semibold underline cursor-pointer text-xs"
                    >
                      Habilitar Edição da Nota
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  {/* Número da NF */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Número do Documento / NF
                    </label>
                    {isEditingNota ? (
                      <input
                        type="text"
                        value={detalheNota.numero_documento}
                        onChange={(e) =>
                          setDetalheNota({ ...detalheNota, numero_documento: e.target.value.toUpperCase() })
                        }
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono font-bold"
                      />
                    ) : (
                      <div className="font-mono font-bold text-slate-800 text-sm">
                        {detalheNota.numero_documento}
                      </div>
                    )}
                  </div>

                  {/* Fornecedor */}
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Fornecedor / Entidade
                    </label>
                    {isEditingNota ? (
                      <SearchableSelect
                        options={fornecedoresOptions}
                        value={detalheNota.fornecedor_id || 0}
                        onChange={(val, opt) =>
                          setDetalheNota({
                            ...detalheNota,
                            fornecedor_id: Number(val),
                            fornecedor_nome: opt?.label || detalheNota.fornecedor_nome,
                          })
                        }
                        placeholder="Selecione o fornecedor..."
                      />
                    ) : (
                      <div className="font-medium text-slate-800">
                        {detalheNota.fornecedor_nome || '—'}
                      </div>
                    )}
                  </div>

                  {/* Centro de Custo */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Centro de Custo
                    </label>
                    {isEditingNota ? (
                      <SearchableSelect
                        options={centrosCustoOptions}
                        value={detalheNota.centro_custo_id || 0}
                        onChange={(val, opt) =>
                          setDetalheNota({
                            ...detalheNota,
                            centro_custo_id: Number(val),
                            centro_custo_nome: opt?.label || detalheNota.centro_custo_nome,
                          })
                        }
                        placeholder="Selecione o centro de custo..."
                      />
                    ) : (
                      <div className="text-slate-800 font-medium">
                        {detalheNota.centro_custo_nome || 'Almoxarifado Central'}
                      </div>
                    )}
                  </div>

                  {/* Observação */}
                  <div className="md:col-span-4">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Observações de Recebimento
                    </label>
                    {isEditingNota ? (
                      <input
                        type="text"
                        value={detalheNota.observacao || ''}
                        onChange={(e) => setDetalheNota({ ...detalheNota, observacao: e.target.value })}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs"
                        placeholder="Observações..."
                      />
                    ) : (
                      <div className="text-slate-600 italic">
                        {detalheNota.observacao || 'Nenhuma observação registrada.'}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Tabela de Itens da Nota Fiscal (A.2, A.3) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                    Itens Recebidos na Nota ({detalheItens.length})
                  </span>

                  {isEditingNota && (
                    <button
                      type="button"
                      onClick={handleAddNewItemToDetalhe}
                      className="px-2.5 py-1 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 rounded border border-teal-200 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Adicionar Item à Nota</span>
                    </button>
                  )}
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3">Código Único / Produto</th>
                        <th className="py-2 px-3 text-center">Lote</th>
                        <th className="py-2 px-3 text-center">Validade</th>
                        <th className="py-2 px-3 text-center">UN</th>
                        <th className="py-2 px-3 text-right">Quantidade</th>
                        <th className="py-2 px-3">Marca / NF</th>
                        <th className="py-2 px-3 text-right">Custo Unit. (R$)</th>
                        {isEditingNota && <th className="py-2 px-3 text-center">Remover</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {detalheItens.map((it, idx) => {
                        const jaConsumido = Number(it.consumido_lote || 0);

                        return (
                          <tr key={idx} className="hover:bg-slate-50 transition-colors">
                            {/* Produto */}
                            <td className="py-2 px-3">
                              {isEditingNota && !it.movimentacao_id ? (
                                <SearchableSelect
                                  options={produtosOptions}
                                  value={it.produto_id}
                                  onChange={(val, opt) => {
                                    const p = produtos.find((x) => x.id === Number(val));
                                    const next = [...detalheItens];
                                    next[idx].produto_id = Number(val);
                                    next[idx].produto_codigo = p?.codigo || '';
                                    next[idx].produto_nome = p?.nome || '';
                                    next[idx].unidade_medida = p?.unidade_medida || 'UN';
                                    setDetalheItens(next);
                                  }}
                                  placeholder="Selecione o produto..."
                                />
                              ) : (
                                <div>
                                  <span className="font-mono font-semibold text-teal-800">
                                    {it.produto_codigo}
                                  </span>{' '}
                                  - <span className="font-medium text-slate-800">{it.produto_nome}</span>
                                </div>
                              )}
                            </td>

                            {/* Lote */}
                            <td className="py-2 px-3 text-center">
                              {isEditingNota ? (
                                <input
                                  type="text"
                                  value={it.numero_lote || ''}
                                  onChange={(e) => {
                                    const next = [...detalheItens];
                                    next[idx].numero_lote = e.target.value.toUpperCase();
                                    setDetalheItens(next);
                                  }}
                                  className="w-24 px-2 py-1 border border-slate-300 rounded font-mono text-center text-xs"
                                />
                              ) : (
                                <span className="font-mono font-bold text-slate-700">
                                  {it.numero_lote || '—'}
                                </span>
                              )}
                            </td>

                            {/* Validade */}
                            <td className="py-2 px-3 text-center">
                              {isEditingNota ? (
                                <input
                                  type="date"
                                  value={it.data_validade ? it.data_validade.slice(0, 10) : ''}
                                  onChange={(e) => {
                                    const next = [...detalheItens];
                                    next[idx].data_validade = e.target.value;
                                    setDetalheItens(next);
                                  }}
                                  className="px-2 py-1 border border-slate-300 rounded text-center text-xs"
                                />
                              ) : (
                                <span className="font-mono text-slate-700">
                                  {formatDataValidade(it.data_validade)}
                                </span>
                              )}
                            </td>

                            {/* UN */}
                            <td className="py-2 px-3 text-center font-bold text-slate-600">
                              {it.unidade_medida}
                            </td>

                            {/* Quantidade */}
                            <td className="py-2 px-3 text-right">
                              {isEditingNota ? (
                                <div className="space-y-0.5">
                                  <input
                                    type="number"
                                    min={jaConsumido}
                                    step="any"
                                    value={it.quantidade}
                                    onChange={(e) => {
                                      const next = [...detalheItens];
                                      next[idx].quantidade = Number(e.target.value);
                                      setDetalheItens(next);
                                    }}
                                    className={`w-20 px-2 py-1 border rounded text-right font-mono font-bold text-xs ${
                                      Number(it.quantidade) < jaConsumido
                                        ? 'border-rose-500 bg-rose-50 text-rose-700'
                                        : 'border-slate-300'
                                    }`}
                                  />
                                  {jaConsumido > 0 && (
                                    <div className="text-[10px] text-amber-700">
                                      Mín: {jaConsumido} (já consumido)
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div>
                                  <span className="font-mono font-bold text-emerald-700 text-sm">
                                    {it.quantidade}
                                  </span>
                                  {jaConsumido > 0 && (
                                    <div className="text-[10px] text-slate-400">
                                      Consumido: {jaConsumido} un.
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>

                            {/* Marca / Nomenclatura */}
                            <td className="py-2 px-3 text-slate-600">
                              {isEditingNota ? (
                                <input
                                  type="text"
                                  value={it.marca || ''}
                                  placeholder="Marca..."
                                  onChange={(e) => {
                                    const next = [...detalheItens];
                                    next[idx].marca = e.target.value;
                                    setDetalheItens(next);
                                  }}
                                  className="w-full px-2 py-1 border border-slate-300 rounded text-xs"
                                />
                              ) : (
                                <span>{it.marca || it.nomenclatura_fornecedor || '—'}</span>
                              )}
                            </td>

                            {/* Custo Unitário */}
                            <td className="py-2 px-3 text-right font-mono">
                              {isEditingNota ? (
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={it.valor_unitario ?? 0}
                                  onChange={(e) => {
                                    const next = [...detalheItens];
                                    next[idx].valor_unitario = Number(e.target.value);
                                    setDetalheItens(next);
                                  }}
                                  className="w-20 px-2 py-1 border border-slate-300 rounded text-right font-mono text-xs"
                                />
                              ) : (
                                <span>
                                  {it.valor_unitario
                                    ? Number(it.valor_unitario).toLocaleString('pt-BR', {
                                        style: 'currency',
                                        currency: 'BRL',
                                      })
                                    : '—'}
                                </span>
                              )}
                            </td>

                            {/* Remover item */}
                            {isEditingNota && (
                              <td className="py-2 px-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveItemFromDetalhe(idx)}
                                  className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded cursor-pointer"
                                  title="Remover item da nota"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Trilha de Auditoria da Nota Fiscal (A.3) */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center gap-2 text-slate-800 font-bold text-xs uppercase tracking-wider">
                  <History className="w-4 h-4 text-teal-700" />
                  <span>Trilha de Auditoria e Histórico da Nota Fiscal</span>
                </div>
                <div className="divide-y divide-slate-200 max-h-44 overflow-y-auto">
                  {detalheHistorico.length > 0 ? (
                    detalheHistorico.map((h) => (
                      <div key={h.id} className="py-2 text-[11px] flex items-start justify-between gap-3">
                        <div>
                          <span className="font-semibold text-slate-800">{h.usuario_nome}: </span>
                          <span className="text-slate-600">{h.detalhes}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono shrink-0">
                          {formatBrasiliaDateTime(h.data_registro)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="py-2 text-slate-400 text-center text-[11px]">
                      Nenhum histórico registrado até o momento.
                    </div>
                  )}
                </div>
              </div>

              {/* Modal de Confirmação do Impacto no Saldo (A.3) */}
              {isConfirmingImpacto && (
                <div className="p-4 bg-teal-50 border border-teal-300 rounded-xl space-y-3 animate-fadeIn">
                  <div className="flex items-center gap-2 text-teal-900 font-bold">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span>Confirmar Impacto no Saldo de Estoque</span>
                  </div>
                  <p className="text-xs text-teal-800">
                    Como as movimentações são imutáveis, a confirmação gerará automaticamente um estorno dos
                    lançamentos anteriores e nova entrada com os valores corrigidos:
                  </p>
                  <ul className="list-disc pl-5 space-y-1 text-xs text-slate-700">
                    {impactoSummary.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-teal-200">
                    <button
                      type="button"
                      onClick={() => setIsConfirmingImpacto(false)}
                      className="px-3 py-1.5 bg-white border border-slate-300 rounded text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                    >
                      Voltar e Ajustar
                    </button>
                    <button
                      type="button"
                      disabled={isProcessingAction}
                      onClick={handleSalvarCorrecaoNota}
                      className="px-4 py-1.5 bg-teal-700 hover:bg-teal-800 text-white rounded text-xs font-bold shadow cursor-pointer disabled:opacity-50"
                    >
                      {isProcessingAction ? 'Processando...' : 'Confirmar e Gravar Correções'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Rodapé com Botões de Ação do Detalhe (A.4) */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div>
                {detalheNota.situacao === 'ABERTA' && (
                  <button
                    type="button"
                    disabled={isProcessingAction}
                    onClick={handleFecharNota}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold rounded text-xs flex items-center gap-1.5 shadow uppercase tracking-wide cursor-pointer disabled:opacity-50"
                  >
                    <Lock className="w-4 h-4" />
                    <span>FECHAR NOTA FISCAL</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {isEditingNota ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingNota(false);
                        setIsConfirmingImpacto(false);
                        carregarDetalheNota(detalheNota.id);
                      }}
                      className="px-3.5 py-2 bg-white border border-slate-300 rounded text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                    >
                      Cancelar Edição
                    </button>
                    <button
                      type="button"
                      disabled={isProcessingAction}
                      onClick={handlePrepararImpacto}
                      className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded text-xs font-bold shadow flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Save className="w-4 h-4" />
                      <span>Verificar Impacto e Gravar</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setSelectedNotaId(null)}
                    className="px-4 py-2 bg-white border border-slate-300 rounded text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    Fechar Janela
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL DE CRIAÇÃO DE NOVA NOTA FISCAL (COM MÚLTIPLOS ITENS E AUTOCOMPLETE) */}
      {/* ========================================================================= */}
      {isNewNotaOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-start justify-center p-3 sm:p-6 py-8 sm:py-12 animate-fadeIn">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-4xl my-0 overflow-visible flex flex-col">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-teal-100 text-teal-800 rounded-lg">
                  <PackagePlus className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Registrar Entrada por Nota Fiscal</h2>
                  <p className="text-xs text-slate-500">
                    Abertura da Nota Fiscal com lote, validade e múltiplos itens no Código Único de Estoque
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsNewNotaOpen(false);
                  if (setIsCreateModalOpen) setIsCreateModalOpen(false);
                }}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSalvarNovaNota} className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
              {/* Cabeçalho */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 bg-slate-50/70 p-4 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Número da NF / Documento *
                  </label>
                  <input
                    type="text"
                    required
                    value={newNotaDoc}
                    onChange={(e) => setNewNotaDoc(e.target.value.toUpperCase())}
                    placeholder="ex: NF-58492"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded text-xs font-mono font-bold"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Fornecedor / Entidade Homologada *
                  </label>
                  <SearchableSelect
                    options={fornecedoresOptions}
                    value={newNotaFornecedorId}
                    onChange={(val) => setNewNotaFornecedorId(Number(val))}
                    placeholder="Busque por código, razão social ou CNPJ..."
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Centro de Custo (Local de Estocagem)
                  </label>
                  <SearchableSelect
                    options={centrosCustoOptions}
                    value={newNotaCentroCustoId}
                    onChange={(val) => setNewNotaCentroCustoId(Number(val))}
                    placeholder="Selecione o centro de custo..."
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Observações de Recebimento
                  </label>
                  <input
                    type="text"
                    value={newNotaObservacao}
                    onChange={(e) => setNewNotaObservacao(e.target.value)}
                    placeholder="Condições de transporte, conferência de temperatura..."
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded text-xs"
                  />
                </div>
              </div>

              {/* Itens da Nota Fiscal */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                    Itens da Nota Fiscal ({newNotaItens.length})
                  </span>
                  <button
                    type="button"
                    onClick={handleAddNewItemToNewNota}
                    className="px-2.5 py-1 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 rounded border border-teal-200 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Adicionar Item</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {newNotaItens.map((item, index) => {
                    const prod = produtos.find((p) => p.id === item.produto_id);
                    return (
                      <div
                        key={item.tempId}
                        className="p-3 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-2 relative"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-teal-800 uppercase tracking-wider">
                            Item #{index + 1}
                          </span>
                          {newNotaItens.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveItemFromNewNota(item.tempId)}
                              className="text-rose-500 hover:text-rose-700 text-xs flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Remover</span>
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-2.5">
                          <div className="md:col-span-3">
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">
                              Produto (Código Único de Estoque) *
                            </label>
                            <SearchableSelect
                              options={produtosOptions}
                              value={item.produto_id}
                              onChange={(val) => {
                                const next = [...newNotaItens];
                                next[index].produto_id = Number(val);
                                setNewNotaItens(next);
                              }}
                              placeholder="Digite código ou nome..."
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">
                              Lote *
                            </label>
                            <input
                              type="text"
                              required
                              value={item.numero_lote}
                              onChange={(e) => {
                                const next = [...newNotaItens];
                                next[index].numero_lote = e.target.value.toUpperCase();
                                setNewNotaItens(next);
                              }}
                              className="w-full px-2 py-1.5 border border-slate-300 rounded font-mono text-xs uppercase"
                              placeholder="LOTE"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">
                              Validade *
                            </label>
                            <input
                              type="date"
                              required
                              value={item.data_validade}
                              onChange={(e) => {
                                const next = [...newNotaItens];
                                next[index].data_validade = e.target.value;
                                setNewNotaItens(next);
                              }}
                              className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">
                              Quantidade ({prod?.unidade_medida || 'UN'}) *
                            </label>
                            <input
                              type="number"
                              required
                              min="0.01"
                              step="any"
                              value={item.quantidade}
                              onChange={(e) => {
                                const next = [...newNotaItens];
                                next[index].quantidade = Number(e.target.value);
                                setNewNotaItens(next);
                              }}
                              className="w-full px-2 py-1.5 border border-slate-300 rounded font-mono font-bold text-right text-xs"
                            />
                          </div>

                          <div className="md:col-span-3">
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">
                              Marca / Nomenclatura na NF (Opcional)
                            </label>
                            <input
                              type="text"
                              value={item.marca}
                              onChange={(e) => {
                                const next = [...newNotaItens];
                                next[index].marca = e.target.value;
                                setNewNotaItens(next);
                              }}
                              placeholder="ex: Cremer, Descarpack..."
                              className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs"
                            />
                          </div>

                          <div className="md:col-span-3">
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">
                              Custo Unitário (R$)
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={item.valor_unitario}
                              onChange={(e) => {
                                const next = [...newNotaItens];
                                next[index].valor_unitario = Number(e.target.value);
                                setNewNotaItens(next);
                              }}
                              className="w-full px-2 py-1.5 border border-slate-300 rounded font-mono text-right text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Botões do Formulário de Criação */}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setIsNewNotaOpen(false);
                    if (setIsCreateModalOpen) setIsCreateModalOpen(false);
                  }}
                  className="px-4 py-2 bg-white border border-slate-300 rounded text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isProcessingAction}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded text-xs shadow flex items-center gap-1.5 uppercase tracking-wide cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{isProcessingAction ? 'Gravando...' : 'Gravar Entrada da Nota'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Impressão Direta / Visualização PDF */}
      <PdfPrintModal pdfDoc={pdfPreviewDoc} onClose={() => setPdfPreviewDoc(null)} />
    </div>
  );
};
