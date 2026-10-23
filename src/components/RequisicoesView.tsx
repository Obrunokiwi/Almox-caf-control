import React, { useState, useMemo, useRef } from 'react';
import { SearchableSelect } from './SearchableSelect.tsx';
import {
  ClipboardList,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Plus,
  RotateCcw,
  Eye,
  Trash2,
  Building2,
  Search,
  Check,
  X,
  Printer,
  ArrowLeft,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  Send,
  Sparkles,
  CheckSquare,
  Flame,
  History,
  ShieldCheck,
  UserCheck,
  FileText,
  Download,
  Layers,
  Tag
} from 'lucide-react';
import type {
  Requisicao,
  Produto,
  CentroCusto,
  Usuario,
  ItemRequisicao,
  PrioridadeRequisicao,
  HistoricoRequisicao,
  EmpresaUnidade,
} from '../types/index.ts';
import {
  generateComprovanteRequisicaoPDF,
  formatDataValidade,
  type PdfGeneratedDocument,
} from '../utils/pdfGenerator.ts';
import { PdfPrintModal } from './PdfPrintModal.tsx';
import { HelpFloatingModal } from './HelpFloatingModal.tsx';
import { CentroCustoAlertBanner } from './CentroCustoAlertBanner.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { ConfirmDeleteModal } from './ConfirmDeleteModal.tsx';
import { QuantityStepper } from './QuantityStepper.tsx';

interface RequisicoesViewProps {
  requisicoes: Requisicao[];
  produtos: Produto[];
  centrosCusto: CentroCusto[];
  currentUser: Usuario | null;
  activeUnidade?: EmpresaUnidade | null;
  onRefresh: () => void;
  isCreateModalOpen?: boolean;
  setIsCreateModalOpen?: (open: boolean) => void;
  onVoltar?: () => void;
  onNavigate?: (tab: string) => void;
}

export const RequisicoesView: React.FC<RequisicoesViewProps> = ({
  requisicoes,
  produtos,
  centrosCusto,
  currentUser,
  activeUnidade,
  onRefresh,
  isCreateModalOpen = false,
  setIsCreateModalOpen,
  onVoltar,
  onNavigate,
}) => {
  // Filtros de busca
  const [filtroNumero, setFiltroNumero] = useState('');
  const [filtroCcId, setFiltroCcId] = useState<string>('');
  const [filtroStatus, setFiltroStatus] = useState<string>('todas');
  const [filtroPrioridade, setFiltroPrioridade] = useState<string>('todas');
  const [filtroSolicitante, setFiltroSolicitante] = useState<string>('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filtroNumero.trim()) count++;
    if (filtroCcId !== '') count++;
    if (filtroStatus !== 'todas') count++;
    if (filtroPrioridade !== 'todas') count++;
    if (filtroSolicitante.trim()) count++;
    return count;
  }, [filtroNumero, filtroCcId, filtroStatus, filtroPrioridade, filtroSolicitante]);

  const handleLimparFiltros = () => {
    setFiltroNumero('');
    setFiltroCcId('');
    setFiltroStatus('todas');
    setFiltroPrioridade('todas');
    setFiltroSolicitante('');
    setCurrentPage(1);
  };

  // Abertura de Nova Requisição em Abas
  const [isFormOpen, setIsFormOpen] = useState(isCreateModalOpen);
  const [activeFormTab, setActiveFormTab] = useState<'cabecalho' | 'itens'>('cabecalho');

  // Campos do Cabeçalho da Requisição
  const [formCcId, setFormCcId] = useState<number>(
    currentUser?.centro_custo_id || centrosCusto[0]?.id || 1
  );
  const [formPrioridade, setFormPrioridade] = useState<PrioridadeRequisicao>('normal');
  const [formObservacao, setFormObservacao] = useState('');

  // Itens da Requisição
  const [selectedProdutoId, setSelectedProdutoId] = useState<number>(0);
  const [selectedQtd, setSelectedQtd] = useState<number>(1);
  const produtoInputRef = useRef<HTMLInputElement>(null);
  const quantidadeInputRef = useRef<HTMLInputElement>(null);
  const [itensAdicionados, setItensAdicionados] = useState<Array<{
    produto_id: number;
    produto_codigo: string;
    produto_nome: string;
    unidade_medida: string;
    saldo_atual: number;
    quantidade_solicitada: number;
  }>>([]);

  // Análise / Atendimento pelo Almoxarife e Auditoria
  const [selectedReq, setSelectedReq] = useState<Requisicao | null>(null);
  const [reqDetails, setReqDetails] = useState<{
    requisicao: Requisicao;
    itens: ItemRequisicao[];
    historico?: HistoricoRequisicao[];
  } | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<'conferencia' | 'historico'>('conferencia');
  const [historicoFiltro, setHistoricoFiltro] = useState<'todos' | 'itens' | 'fluxo'>('todos');
  const [itemDecisoes, setItemDecisoes] = useState<
    Record<
      number,
      {
        decisao: 'aprovado' | 'negado';
        quantidade_atendida: number;
        motivo_decisao: string;
        lotes_distribuicao?: Record<number, number>;
      }
    >
  >({});
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [motivoRejeicaoCurto, setMotivoRejeicaoCurto] = useState('Sem estoque');
  const [motivoRejeicao, setMotivoRejeicao] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pdfPreviewDoc, setPdfPreviewDoc] = useState<PdfGeneratedDocument | null>(null);
  const [deletingRequisicao, setDeletingRequisicao] = useState<Requisicao | null>(null);

  const { toast } = useToast();

  const handleEmitirPdfRequisicao = async (
    reqObj: Requisicao,
    mode: 'download' | 'print',
    preloadedDetails?: {
      requisicao: Requisicao;
      itens: ItemRequisicao[];
      historico?: HistoricoRequisicao[];
    } | null,
    comHistorico: boolean = false
  ) => {
    try {
      let targetReq = preloadedDetails?.requisicao || reqObj;
      let targetItens = preloadedDetails?.itens || [];
      let targetHist = preloadedDetails?.historico || [];

      if (!preloadedDetails || targetItens.length === 0) {
        const res = await fetch(`/api/requisicoes/${reqObj.id}`, {
          headers: { Authorization: `user:${currentUser?.id}` },
        });
        if (res.ok) {
          const data = await res.json();
          targetReq = data.requisicao || reqObj;
          targetItens = data.itens || [];
          targetHist = data.historico || [];
        }
      }

      const generated = await generateComprovanteRequisicaoPDF({
        requisicao: targetReq,
        itens: targetItens,
        historico: targetHist,
        currentUser,
        activeUnidade,
        mode,
        comHistorico,
      });

      if (mode === 'print') {
        setPdfPreviewDoc(generated);
      }
    } catch (err) {
      console.error('Erro ao gerar PDF da requisição:', err);
    }
  };

  // Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;

  const isAlmoxarifeOrAdmin = currentUser && (currentUser.perfil === 'admin' || currentUser.perfil === 'almoxarife');
  const isRequisitante = currentUser?.perfil === 'requisitante';

  // Motivos padrão de recusa conforme regulamento hospitalar
  const MOTIVOS_NEGACAO_CURTA = [
    'Sem estoque',
    'Quantidade acima do necessário',
    'Item não padronizado',
    'Outro',
  ];

  const formatMotivoParaRequisitante = (motivo?: string | null): string => {
    if (!motivo) return 'Item não atendido na análise técnica.';
    const lower = motivo.toLowerCase();
    if (lower.includes('sem estoque')) {
      return 'Item temporariamente indisponível no almoxarifado.';
    }
    if (lower.includes('quantidade acima') || lower.includes('acima do necessário')) {
      return 'Quantidade reavaliada conforme histórico e padrão de consumo do setor.';
    }
    if (lower.includes('não padronizado') || lower.includes('nao padronizado')) {
      return 'Item não padronizado para o setor solicitante.';
    }
    if (lower.includes('outro')) {
      const parts = motivo.split(':');
      if (parts.length > 1) {
        return parts.slice(1).join(':').replace(/\b\d+(\.\d+)?\b/g, '').trim() || 'Ajustado conforme parecer técnico da chefia.';
      }
    }
    return motivo.replace(/\b\d+(\.\d+)?\b/g, '').trim() || 'Item não atendido na análise técnica.';
  };

  // Produtos apenas consumíveis para a requisição
  const produtosConsumiveis = useMemo(() => {
    return produtos.filter((p) => p.tipo === 'consumivel' && p.ativo === 1);
  }, [produtos]);

  // Opções para autocompletar de produtos consumíveis
  // REQUISITANTE NÃO VÊ ESTOQUE: Apenas código, descrição completa e UN (sem badge de saldo ou indisponível)
  const produtosOptions = useMemo(() => {
    return produtosConsumiveis.map((p) => {
      if (isRequisitante) {
        return {
          value: p.id,
          label: `${p.codigo} - ${p.nome}`,
          secondaryLabel: p.unidade_medida,
          keywords: `${p.codigo} ${p.nome} ${p.unidade_medida} ${p.grupo_nome || ''} ${p.descricao || ''}`,
        };
      }
      const isSemEstoque = p.quantidade_atual <= 0;
      const isCritico = p.quantidade_atual <= (p.estoque_minimo || 5);
      return {
        value: p.id,
        label: `${p.codigo} - ${p.nome}`,
        secondaryLabel: p.unidade_medida,
        badge: isSemEstoque
          ? 'SEM ESTOQUE'
          : `Saldo: ${p.quantidade_atual} ${p.unidade_medida}`,
        badgeVariant: isSemEstoque
          ? ('danger' as const)
          : isCritico
          ? ('warning' as const)
          : ('regular' as const),
        keywords: `${p.codigo} ${p.nome} ${p.unidade_medida} ${p.grupo_nome || ''} ${p.descricao || ''}`,
      };
    });
  }, [produtosConsumiveis, isRequisitante]);

  // Opções para autocompletar de Centros de Custo
  const centrosCustoOptions = useMemo(() => {
    return centrosCusto.map((cc) => ({
      value: cc.id,
      label: `${cc.codigo} - ${cc.nome}`,
      secondaryLabel: cc.departamento ? `(${cc.departamento})` : undefined,
      keywords: `${cc.codigo} ${cc.nome} ${cc.departamento || ''}`,
    }));
  }, [centrosCusto]);

  // Filtragem das Requisições
  const filteredRequisicoes = useMemo(() => {
    return requisicoes.filter((r) => {
      if (filtroNumero && !r.numero_requisicao.toLowerCase().includes(filtroNumero.toLowerCase())) return false;
      if (filtroCcId && String(r.centro_custo_id) !== filtroCcId) return false;
      if (filtroStatus !== 'todas' && r.status !== filtroStatus) return false;
      if (filtroPrioridade !== 'todas' && (r.prioridade || 'normal') !== filtroPrioridade) return false;
      if (filtroSolicitante && !r.solicitante_nome?.toLowerCase().includes(filtroSolicitante.toLowerCase())) return false;
      return true;
    });
  }, [requisicoes, filtroNumero, filtroCcId, filtroStatus, filtroPrioridade, filtroSolicitante]);

  const totalPages = Math.ceil(filteredRequisicoes.length / pageSize) || 1;
  const paginatedRequisicoes = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRequisicoes.slice(start, start + pageSize);
  }, [filteredRequisicoes, currentPage, pageSize]);

  // Abre criação de nova requisição
  const handleAbrirCriacao = () => {
    setFormCcId(currentUser?.centro_custo_id || centrosCusto[0]?.id || 1);
    setFormPrioridade('normal');
    setFormObservacao('');
    setItensAdicionados([]);
    setSelectedProdutoId(0);
    setSelectedQtd(1);
    setActiveFormTab('cabecalho');
    setActionError(null);
    setIsFormOpen(true);
    if (setIsCreateModalOpen) setIsCreateModalOpen(true);
  };

  // Adicionar item à cesta da requisição com retorno do foco para o produto
  const handleAddItem = () => {
    if (!selectedProdutoId || selectedQtd <= 0) {
      toast.warning(
        'Selecione um Produto',
        'Por favor, selecione um produto com quantidade maior que zero para adicionar.'
      );
      produtoInputRef.current?.focus();
      return;
    }
    const prod = produtosConsumiveis.find((p) => p.id === selectedProdutoId);
    if (!prod) return;

    // Se já estiver na lista, apenas soma a quantidade
    const existingIndex = itensAdicionados.findIndex((it) => it.produto_id === selectedProdutoId);
    if (existingIndex >= 0) {
      const updated = [...itensAdicionados];
      updated[existingIndex].quantidade_solicitada += selectedQtd;
      setItensAdicionados(updated);
    } else {
      setItensAdicionados([
        ...itensAdicionados,
        {
          produto_id: prod.id,
          produto_codigo: prod.codigo,
          produto_nome: prod.nome,
          unidade_medida: prod.unidade_medida,
          saldo_atual: prod.quantidade_atual,
          quantidade_solicitada: selectedQtd,
        },
      ]);
    }

    // Reseta produto e quantidade para permitir digitação rápida do próximo item
    setSelectedProdutoId(0);
    setSelectedQtd(1);
    setTimeout(() => {
      produtoInputRef.current?.focus();
    }, 50);
  };

  const handleRemoveItem = (index: number) => {
    setItensAdicionados(itensAdicionados.filter((_, i) => i !== index));
  };

  // Enviar requisição para o almoxarifado
  const handleSubmitRequisicao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (itensAdicionados.length === 0) {
      const msg = 'A requisição deve conter pelo menos 1 item consumível adicionado.';
      setActionError(msg);
      toast.error('Cesta de Itens Vazia', msg);
      setActiveFormTab('itens');
      return;
    }

    setIsProcessing(true);
    setActionError(null);

    try {
      const res = await fetch('/api/requisicoes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `user:${currentUser?.id}`,
        },
        body: JSON.stringify({
          centro_custo_id: formCcId,
          prioridade: formPrioridade,
          observacao: formObservacao ? formObservacao.trim() : null,
          itens: itensAdicionados.map((it) => ({
            produto_id: it.produto_id,
            quantidade_solicitada: it.quantidade_solicitada,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao gerar requisição.');
      }

      toast.success(
        'Requisição Registrada com Sucesso',
        `Solicitação ${data.data?.numero_requisicao || ''} aberta com ${itensAdicionados.length} item(ns) e enviada para análise.`
      );

      setIsFormOpen(false);
      if (setIsCreateModalOpen) setIsCreateModalOpen(false);
      onRefresh();
    } catch (err: any) {
      const msg = err.message || 'Falha ao processar solicitação.';
      setActionError(msg);
      toast.error('Erro ao Criar Requisição', msg);
    } finally {
      setIsProcessing(false);
    }
  };

  // Carregar detalhes de requisição existente (Análise ou Histórico de Auditoria)
  const handleAbrirAnalise = async (req: Requisicao, initialTab: 'conferencia' | 'historico' = 'conferencia') => {
    setSelectedReq(req);
    setActiveDetailTab(initialTab);
    setHistoricoFiltro('todos');
    setIsLoadingDetails(true);
    setActionError(null);
    setReqDetails(null);
    setItemDecisoes({});

    try {
      const res = await fetch(`/api/requisicoes/${req.id}`, {
        headers: { 'Authorization': `user:${currentUser?.id}` },
      });
      const data = await res.json();
      if (res.ok) {
        setReqDetails(data);
        // Inicializa decisões de itens para requisições pendentes
        if (data.itens && Array.isArray(data.itens)) {
          const initMap: Record<
            number,
            {
              decisao: 'aprovado' | 'negado';
              quantidade_atendida: number;
              motivo_decisao: string;
              lotes_distribuicao?: Record<number, number>;
            }
          > = {};
          for (const it of data.itens as ItemRequisicao[]) {
            const saldo = it.saldo_atual_estoque ?? 0;
            const lotes = it.lotes_disponiveis || [];
            const dist: Record<number, number> = {};

            if (lotes.length > 0) {
              // Distribuição sugerida automática (FEFO: o que vence primeiro)
              let restante = it.quantidade_solicitada;
              for (const l of lotes) {
                if (restante <= 0) {
                  dist[l.id] = 0;
                } else {
                  const abater = Math.min(Number(l.quantidade_atual), restante);
                  dist[l.id] = abater;
                  restante -= abater;
                }
              }
              const soma = Object.values(dist).reduce((a, b) => a + b, 0);
              initMap[it.id] = {
                decisao: soma > 0 ? 'aprovado' : 'negado',
                quantidade_atendida: soma > 0 ? soma : it.quantidade_solicitada,
                motivo_decisao: soma > 0
                  ? 'Item conferido, aprovado e dispensado pelo almoxarifado.'
                  : `Saldo físico insuficiente em estoque (Disponível: ${saldo} ${it.unidade_medida || ''}).`,
                lotes_distribuicao: dist,
              };
            } else {
              const temSaldo = saldo >= it.quantidade_solicitada;
              initMap[it.id] = {
                decisao: temSaldo ? 'aprovado' : 'negado',
                quantidade_atendida: temSaldo ? it.quantidade_solicitada : 0,
                motivo_decisao: temSaldo
                  ? 'Item conferido, aprovado e dispensado pelo almoxarifado.'
                  : `Saldo físico insuficiente em estoque (Disponível: ${saldo} ${it.unidade_medida || ''}).`,
                lotes_distribuicao: {},
              };
            }
          }
          setItemDecisoes(initMap);
        }
      } else {
        setActionError(data.error || 'Erro ao obter dados da requisição');
      }
    } catch (err: any) {
      setActionError('Erro de conexão: ' + err.message);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const isUnidadeFracionavel = (unidade?: string | null): boolean => {
    if (!unidade) return false;
    const u = String(unidade).trim().toUpperCase();
    return ['KG', 'KILO', 'QUILO', 'G', 'GR', 'GRAMA', 'L', 'LT', 'LTS', 'LITRO', 'ML', 'M', 'MT', 'METRO', 'M2', 'M3'].includes(u);
  };

  // Atualiza quantidade diretamente quando o produto não utiliza lotes individuais
  const handleItemQuantityChange = (itemId: number, newQty: number) => {
    setItemDecisoes((prev) => {
      const cur = prev[itemId] || {
        decisao: 'aprovado',
        quantidade_atendida: 0,
        motivo_decisao: 'Item conferido, aprovado e dispensado pelo almoxarifado.',
        lotes_distribuicao: {},
      };
      const q = Math.max(0, newQty);
      return {
        ...prev,
        [itemId]: {
          ...cur,
          quantidade_atendida: q,
          decisao: q > 0 ? 'aprovado' : cur.decisao,
        },
      };
    });
  };

  // Atualiza quantidade de um lote específico e recalcula a soma atendida do item
  const handleLotQuantityChange = (itemId: number, loteId: number, newQty: number) => {
    setItemDecisoes((prev) => {
      const cur = prev[itemId] || {
        decisao: 'aprovado',
        quantidade_atendida: 0,
        motivo_decisao: 'Item conferido, aprovado e dispensado pelo almoxarifado.',
        lotes_distribuicao: {},
      };
      const updatedDist = {
        ...(cur.lotes_distribuicao || {}),
        [loteId]: Math.max(0, newQty),
      };
      const totalQtd = Object.values(updatedDist).reduce((sum, q) => sum + q, 0);
      return {
        ...prev,
        [itemId]: {
          ...cur,
          quantidade_atendida: totalQtd,
          lotes_distribuicao: updatedDist,
          decisao: totalQtd > 0 ? 'aprovado' : cur.decisao,
        },
      };
    });
  };

  // Ação Almoxarife: Efetivar decisões por item (Aprovação Total, Parcial ou Negação por Item)
  const handleAprovar = async () => {
    if (!selectedReq || !reqDetails) return;

    // Prepara payload de decisões e lotes dispensados
    const decisoesPayload = reqDetails.itens.map((it) => {
      const dec = itemDecisoes[it.id] || {
        decisao: 'aprovado' as const,
        quantidade_atendida: it.quantidade_solicitada,
        motivo_decisao: 'Item conferido, aprovado e dispensado.',
        lotes_distribuicao: {},
      };

      const lotesDispensadosPayload: Array<{
        lote_id: number;
        numero_lote: string;
        data_validade?: string | null;
        quantidade: number;
      }> = [];

      if (dec.decisao === 'aprovado' && dec.lotes_distribuicao) {
        for (const [lIdStr, qtd] of Object.entries(dec.lotes_distribuicao)) {
          const q = Number(qtd);
          if (q > 0) {
            const lotObj = it.lotes_disponiveis?.find((l) => l.id === Number(lIdStr));
            lotesDispensadosPayload.push({
              lote_id: Number(lIdStr),
              numero_lote: lotObj?.numero_lote || '',
              data_validade: lotObj?.data_validade || null,
              quantidade: q,
            });
          }
        }
      }

      return {
        item_id: it.id,
        produto_nome: it.produto_nome,
        decisao: dec.decisao,
        quantidade_atendida: dec.decisao === 'aprovado' ? dec.quantidade_atendida : 0,
        motivo_decisao: dec.motivo_decisao.trim(),
        lotes_dispensados: lotesDispensadosPayload.length > 0 ? lotesDispensadosPayload : undefined,
      };
    });

    const itemAprovadoSemQtd = decisoesPayload.find((d) => d.decisao === 'aprovado' && d.quantidade_atendida <= 0);
    if (itemAprovadoSemQtd) {
      const msg = `O item "${itemAprovadoSemQtd.produto_nome}" está marcado como aprovado, mas a quantidade a dispensar é 0. Distribua quantidade nos lotes ou marque o item como "Negar".`;
      setActionError(msg);
      toast.error('Quantidade Zerada', msg);
      return;
    }

    const itemSemMotivo = decisoesPayload.find((d) => d.decisao === 'negado' && !d.motivo_decisao);
    if (itemSemMotivo) {
      const msg = `Informe a justificativa técnica para negar o item "${itemSemMotivo.produto_nome}".`;
      setActionError(msg);
      toast.error('Parecer Obrigatório', msg);
      return;
    }

    setIsProcessing(true);
    setActionError(null);

    try {
      const res = await fetch(`/api/requisicoes/${selectedReq.id}/aprovar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `user:${currentUser?.id}`,
        },
        body: JSON.stringify({
          decisoes_itens: decisoesPayload,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao processar análise da requisição.');
      }

      if (data.data?.status === 'rejeitada') {
        toast.warning('Requisição Concluída (Itens Negados)', data.message);
      } else {
        toast.success('Requisição Atendida com Sucesso', data.message);
      }

      setSelectedReq(null);
      setReqDetails(null);
      onRefresh();
    } catch (err: any) {
      const msg = err.message || 'Falha ao aprovar.';
      setActionError(msg);
      toast.error('Erro na Análise da Requisição', msg);
    } finally {
      setIsProcessing(false);
    }
  };

  // Ação Almoxarife: Rejeitar com parecer
  const handleRejeitar = async () => {
    if (!selectedReq || !motivoRejeicaoCurto) {
      const msg = 'Selecione o motivo da rejeição.';
      setActionError(msg);
      toast.error('Motivo Obrigatório', msg);
      return;
    }

    const motivoFinal = motivoRejeicao.trim()
      ? `${motivoRejeicaoCurto}: ${motivoRejeicao.trim()}`
      : motivoRejeicaoCurto;

    setIsProcessing(true);
    setActionError(null);

    try {
      const res = await fetch(`/api/requisicoes/${selectedReq.id}/rejeitar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `user:${currentUser?.id}`,
        },
        body: JSON.stringify({ motivo_rejeicao: motivoFinal }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao rejeitar requisição.');
      }

      toast.warning(
        'Requisição Rejeitada',
        data.message || `A requisição ${selectedReq.numero_requisicao} foi rejeitada com parecer técnico.`
      );

      setIsRejectModalOpen(false);
      setSelectedReq(null);
      setReqDetails(null);
      setMotivoRejeicao('');
      onRefresh();
    } catch (err: any) {
      const msg = err.message || 'Falha ao rejeitar.';
      setActionError(msg);
      toast.error('Erro ao Rejeitar Requisição', msg);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmDeleteRequisicao = async () => {
    if (!deletingRequisicao) return;
    setIsProcessing(true);
    try {
      const res = await fetch(`/api/requisicoes/${deletingRequisicao.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `user:${currentUser?.id}`,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao excluir requisição.');
      }

      toast.success(
        'Requisição Excluída',
        data.message || `A requisição "${deletingRequisicao.numero_requisicao}" foi excluída.`
      );
      if (selectedReq?.id === deletingRequisicao.id) {
        setSelectedReq(null);
        setReqDetails(null);
      }
      setDeletingRequisicao(null);
      onRefresh();
    } catch (err: any) {
      toast.error('Erro ao Excluir Requisição', err.message || 'Não foi possível excluir a requisição.');
    } finally {
      setIsProcessing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pendente':
        return (
          <span className="inline-flex items-center gap-1 text-amber-800 font-bold bg-amber-50 px-2 py-0.5 rounded text-[10px] border border-amber-300">
            <Clock className="w-3 h-3 text-amber-600" />
            <span>PENDENTE</span>
          </span>
        );
      case 'aprovada':
        return (
          <span className="inline-flex items-center gap-1 text-blue-800 font-bold bg-blue-50 px-2 py-0.5 rounded text-[10px] border border-blue-300">
            <CheckCircle2 className="w-3 h-3 text-blue-600" />
            <span>APROVADA</span>
          </span>
        );
      case 'aprovada_atendida':
      case 'atendida':
        return (
          <span className="inline-flex items-center gap-1 text-emerald-800 font-bold bg-emerald-50 px-2 py-0.5 rounded text-[10px] border border-emerald-300">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>ATENDIDA</span>
          </span>
        );
      case 'parcial':
        return (
          <span className="inline-flex items-center gap-1 text-purple-800 font-bold bg-purple-50 px-2 py-0.5 rounded text-[10px] border border-purple-300">
            <CheckCircle2 className="w-3 h-3 text-purple-600" />
            <span>PARCIAL</span>
          </span>
        );
      case 'rejeitada':
      case 'negada':
        return (
          <span className="inline-flex items-center gap-1 text-rose-800 font-bold bg-rose-50 px-2 py-0.5 rounded text-[10px] border border-rose-300">
            <XCircle className="w-3 h-3 text-rose-600" />
            <span>NEGADA</span>
          </span>
        );
      default:
        return <span className="text-xs text-slate-500 uppercase">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho Compacto */}
      <div className="bg-white px-4 py-3 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-teal-100 text-teal-800 rounded-lg">
            <ClipboardList className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800 tracking-tight">Requisições de Materiais</h1>
            <p className="text-xs text-slate-500">Solicitação de materiais, conferência de saldo e atendimento</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <HelpFloatingModal
            title="Ajuda & Regras — Requisições de Materiais"
            subtitle="Horários de Entrega (Regra 12h/13h), Prioridade e Conferência de Saldo"
            sections={[
              {
                title: 'Limite de Horário e Janela de Entrega (24h)',
                badge: 'Regra 12h / 13h',
                tone: 'amber',
                description:
                  'Requisições enviadas até as 12:00h são entregues no mesmo dia à tarde (após as 13:00h). Requisições enviadas após as 12:00h são programadas para entrega no dia seguinte após as 13:00h.',
              },
              {
                title: 'Definição de Prioridade pelo Almoxarifado',
                badge: 'Triagem Técnica',
                tone: 'blue',
                description:
                  'A prioridade de atendimento é definida exclusivamente pela equipe do Almoxarifado durante a análise e separação. O solicitante registra apenas o Centro de Custo, os itens e a Observação.',
              },
              {
                title: 'Aviso de Itens com Estoque Zerado e Bloqueio de Vencidos',
                badge: 'Controle de Saldo',
                tone: 'rose',
                description:
                  'Ao selecionar um item com saldo zerado (0), um alerta imediato de falta de estoque é exibido. Além disso, lotes vencidos são bloqueados automaticamente na dispensação.',
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
          mensagemPersonalizada="Cadastre ao menos um Centro de Custo para começar a solicitar requisições de materiais."
        />
      )}

      {/* =========================================================================
          NOVA REQUISIÇÃO EM ABAS / ETAPAS
         ========================================================================= */}
      {isFormOpen && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-md overflow-hidden animate-fadeIn">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-teal-100 text-teal-800 px-2 py-0.5 rounded">
                Fluxo Assistencial de Saída
              </span>
              <h2 className="text-base font-bold text-slate-800 mt-1">Abertura de Requisição de Insumos</h2>
            </div>

            <button
              type="button"
              onClick={() => {
                setIsFormOpen(false);
                if (setIsCreateModalOpen) setIsCreateModalOpen(false);
              }}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Voltar para Listagem</span>
            </button>
          </div>

          {actionError && (
            <div className="mx-6 mt-4 p-3 rounded bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {actionError}
            </div>
          )}

          {/* Abas */}
          <div className="flex border-b border-slate-200 px-6 pt-2 bg-slate-50/50">
            <button
              type="button"
              onClick={() => setActiveFormTab('cabecalho')}
              className={`px-5 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
                activeFormTab === 'cabecalho'
                  ? 'border-teal-600 text-teal-700 bg-white rounded-t'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              1. Cabeçalho da Requisição
            </button>

            <button
              type="button"
              onClick={() => setActiveFormTab('itens')}
              className={`px-5 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
                activeFormTab === 'itens'
                  ? 'border-teal-600 text-teal-700 bg-white rounded-t'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <span>2. Itens Solicitados</span>
              <span className="bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded-full text-[10px]">
                {itensAdicionados.length}
              </span>
            </button>
          </div>

          <form onSubmit={handleSubmitRequisicao} className="p-6 space-y-6">
            {/* ABA 1: CABEÇALHO */}
            {activeFormTab === 'cabecalho' && (
              <div className="space-y-4">
                {new Date().getHours() >= 12 ? (
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>
                      <strong>Aviso de Horário (Após as 12h):</strong> Como esta requisição está sendo realizada após as 12:00h, ela será entregue <strong>no dia posterior após as 13:00h</strong>.
                    </span>
                  </div>
                ) : (
                  <div className="p-2.5 rounded-lg bg-teal-50/70 border border-teal-200 text-teal-900 text-xs flex items-center gap-2">
                    <Clock className="w-4 h-4 text-teal-700 shrink-0" />
                    <span>
                      <strong>Janela de Entrega:</strong> Requisições enviadas até as 12:00h são entregues no mesmo dia após as 13:00h.
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                      Centro de Custo Solicitante *
                    </label>
                    <SearchableSelect
                      options={centrosCustoOptions}
                      value={formCcId}
                      onChange={(val) => setFormCcId(Number(val))}
                      disabled={currentUser?.perfil === 'requisitante'}
                      placeholder="Pesquise por código ou nome do Centro de Custo..."
                      emptyMessage="Nenhum Centro de Custo encontrado com esse nome ou código."
                    />
                    {currentUser?.perfil === 'requisitante' && (
                      <p className="text-[10px] text-slate-500 mt-1">Vinculado automaticamente ao seu setor hospitalar.</p>
                    )}
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                      Observação / Justificativa
                    </label>
                    <textarea
                      rows={2}
                      value={formObservacao}
                      onChange={(e) => setFormObservacao(e.target.value)}
                      placeholder="Observações sobre a solicitação (opcional)..."
                      className="w-full px-3 py-2 bg-[#f1f3f5] border border-slate-300 rounded text-xs text-slate-800 focus:bg-white focus:border-teal-500 shadow-inner"
                    />
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      <span className="text-[10px] text-slate-500 font-semibold">Sugestões rápidas:</span>
                      {[
                        'Reposição de rotina do setor',
                        'Consumo assistencial diário',
                        'Solicitação de urgência',
                        'Plantão de fim de semana',
                        'Ajuste de estoque do posto',
                      ].map((sug) => (
                        <button
                          key={sug}
                          type="button"
                          onClick={() => setFormObservacao((prev) => (prev ? `${prev}; ${sug}` : sug))}
                          className="text-[10px] bg-slate-100 hover:bg-teal-50 hover:text-teal-800 text-slate-600 px-2 py-0.5 rounded border border-slate-200 transition-colors cursor-pointer"
                        >
                          + {sug}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ABA 2: ITENS DA REQUISIÇÃO */}
            {activeFormTab === 'itens' && (
              <div className="space-y-6">
                {/* Linha de Adição de Item */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                  <div className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                    Adicionar Insumo Consumível
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                    <div className="md:col-span-7">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        {isRequisitante
                          ? 'Produto Consumível (código ou descrição)'
                          : 'Produto Consumível (digite código ou nome — saldo em tempo real)'}
                      </label>
                      <SearchableSelect
                        inputRef={produtoInputRef}
                        options={produtosOptions}
                        value={selectedProdutoId}
                        onChange={(val) => {
                          const nextId = Number(val);
                          setSelectedProdutoId(nextId);
                          if (!isRequisitante) {
                            const prod = produtosConsumiveis.find((p) => p.id === nextId);
                            if (prod && prod.quantidade_atual <= 0) {
                              toast.warning(
                                'Item Sem Estoque',
                                `Atenção: O produto "${prod.codigo} - ${prod.nome}" está com estoque zerado (0 ${prod.unidade_medida}) no momento.`
                              );
                            }
                          }
                        }}
                        onSelectCallback={() => {
                          quantidadeInputRef.current?.focus();
                          quantidadeInputRef.current?.select();
                        }}
                        placeholder="Digite código ou nome do insumo (ex: 1001, Seringa, Álcool)..."
                        emptyMessage="Nenhum produto consumível encontrado com esse código ou nome."
                      />
                      {!isRequisitante && (() => {
                        const selProd = produtosConsumiveis.find((p) => p.id === selectedProdutoId);
                        if (selProd && selProd.quantidade_atual <= 0) {
                          return (
                            <div className="mt-1.5 p-2 rounded bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-semibold flex items-center gap-1.5 animate-fadeIn">
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                              <span>Aviso: Este item encontra-se SEM ESTOQUE (Saldo: 0 {selProd.unidade_medida}). A requisição poderá ser encaminhada para análise gerencial.</span>
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>

                    <div className="md:col-span-3">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Quantidade Desejada (pressione Enter para adicionar)
                      </label>
                      <input
                        ref={quantidadeInputRef}
                        type="number"
                        min="1"
                        value={selectedQtd}
                        onChange={(e) => setSelectedQtd(Math.max(1, Number(e.target.value)))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddItem();
                          }
                        }}
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs text-slate-800 font-mono focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <button
                        type="button"
                        onClick={handleAddItem}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 px-3 rounded text-xs flex items-center justify-center gap-1.5 uppercase tracking-wide transition-all shadow cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>ADICIONAR</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Tabela de Itens Adicionados */}
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200 text-xs font-bold text-slate-700 uppercase tracking-wide">
                    Lista de Insumos da Requisição ({itensAdicionados.length} itens)
                  </div>
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3">Código</th>
                        <th className="py-2 px-3">Produto / Material</th>
                        <th className="py-2 px-3 text-center">UN</th>
                        {!isRequisitante && <th className="py-2 px-3 text-right">Saldo Almox.</th>}
                        <th className="py-2 px-3 text-right">Qtd Solicitada</th>
                        <th className="py-2 px-3 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {itensAdicionados.length > 0 ? (
                        itensAdicionados.map((it, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="py-2 px-3 font-mono text-slate-700 font-semibold">{it.produto_codigo}</td>
                            <td className="py-2 px-3 text-slate-800">{it.produto_nome}</td>
                            <td className="py-2 px-3 text-center font-bold text-slate-600">{it.unidade_medida}</td>
                            {!isRequisitante && (
                              <td className="py-2 px-3 text-right font-mono text-slate-600">{it.saldo_atual}</td>
                            )}
                            <td className="py-2 px-3 text-right font-mono font-bold text-teal-800">
                              {it.quantidade_solicitada}
                            </td>
                            <td className="py-2 px-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(idx)}
                                className="p-1 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded"
                                title="Remover item"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={isRequisitante ? 5 : 6} className="py-6 text-center text-slate-400">
                            Nenhum item adicionado à requisição ainda.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Rodapé: ENVIAR REQUISIÇÃO (verde) e VOLTAR (teal) */}
            <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsFormOpen(false);
                  if (setIsCreateModalOpen) setIsCreateModalOpen(false);
                }}
                className="bg-teal-600 hover:bg-teal-700 text-white font-medium px-4 py-2 rounded text-xs flex items-center gap-1.5 transition-all shadow uppercase tracking-wide cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>VOLTAR</span>
              </button>

              <button
                type="submit"
                disabled={isProcessing || itensAdicionados.length === 0}
                className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-medium px-5 py-2 rounded text-xs flex items-center gap-1.5 transition-all shadow uppercase tracking-wide cursor-pointer disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                <span>{isProcessing ? 'ENVIANDO...' : 'ENVIAR REQUISIÇÃO AO ALMOXARIFADO'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Top Action Bar: + NOVA REQUISIÇÃO e 🔍 FILTROS */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-teal-50 text-teal-800 rounded-lg">
            <ClipboardList className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-800">Requisições de Insumos</h2>
            <p className="text-[11px] text-slate-500">Abertura e acompanhamento de pedidos para os setores</p>
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
            onClick={handleAbrirCriacao}
            className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-medium px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 transition-all shadow-sm uppercase tracking-wide cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ NOVA REQUISIÇÃO</span>
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
                Número da Requisição
              </label>
              <input
                type="text"
                value={filtroNumero}
                onChange={(e) => { setFiltroNumero(e.target.value); setCurrentPage(1); }}
                placeholder="ex: REQ-2026-0001"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded text-xs text-slate-800 focus:bg-white focus:border-teal-500 shadow-inner"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Centro de Custo
              </label>
              <SearchableSelect
                options={[
                  { value: '', label: '(Todos os Centros de Custo)' },
                  ...centrosCusto.map((cc) => ({
                    value: String(cc.id),
                    label: `${cc.codigo} - ${cc.nome}`,
                    secondaryLabel: cc.departamento ? `(${cc.departamento})` : undefined,
                  })),
                ]}
                value={filtroCcId}
                onChange={(val) => {
                  setFiltroCcId(String(val || ''));
                  setCurrentPage(1);
                }}
                placeholder="Filtrar por centro de custo..."
                allowClear={false}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Status da Requisição
              </label>
              <SearchableSelect
                options={[
                  { value: 'todas', label: 'TODAS AS SITUAÇÕES' },
                  { value: 'pendente', label: 'Pendente (Em Análise)', badge: 'Pendente', badgeVariant: 'warning' },
                  { value: 'aprovada_atendida', label: 'Aprovada e Atendida (Baixa Efetuada)', badge: 'Atendida', badgeVariant: 'regular' },
                  { value: 'rejeitada', label: 'Rejeitada (Com Parecer)', badge: 'Rejeitada', badgeVariant: 'danger' },
                  { value: 'cancelada', label: 'Cancelada', badge: 'Cancelada', badgeVariant: 'danger' },
                ]}
                value={filtroStatus}
                onChange={(val) => {
                  setFiltroStatus(String(val || 'todas'));
                  setCurrentPage(1);
                }}
                placeholder="Filtrar por status..."
                allowClear={false}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Prioridade
              </label>
              <SearchableSelect
                options={[
                  { value: 'todas', label: 'TODAS AS PRIORIDADES' },
                  { value: 'normal', label: 'Normal (Rotina)' },
                  { value: 'urgente', label: 'Urgente (Alta Prioridade)', badge: 'Urgente', badgeVariant: 'danger' },
                ]}
                value={filtroPrioridade}
                onChange={(val) => {
                  setFiltroPrioridade(String(val || 'todas'));
                  setCurrentPage(1);
                }}
                placeholder="Filtrar por prioridade..."
                allowClear={false}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Solicitante
              </label>
              <input
                type="text"
                value={filtroSolicitante}
                onChange={(e) => { setFiltroSolicitante(e.target.value); setCurrentPage(1); }}
                placeholder="Pesquisar por nome do solicitante..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded text-xs text-slate-800 focus:bg-white focus:border-teal-500 shadow-inner"
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

      {/* Grid de Resultados Zebrada */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3">Nº Requisição</th>
                <th className="py-2.5 px-3">Data / Hora</th>
                <th className="py-2.5 px-3">Centro de Custo</th>
                <th className="py-2.5 px-3">Solicitante</th>
                <th className="py-2.5 px-3 text-center">Prioridade</th>
                <th className="py-2.5 px-3 text-center">Status</th>
                <th className="py-2.5 px-3 text-center">Itens</th>
                <th className="py-2.5 px-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {paginatedRequisicoes.length > 0 ? (
                paginatedRequisicoes.map((r) => (
                  <tr key={r.id} className="odd:bg-white even:bg-slate-50/70 hover:bg-teal-50/40 transition-colors">
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-800">{r.numero_requisicao}</td>
                    <td className="py-2.5 px-3 text-slate-600">
                      {new Date(r.data_solicitacao).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-800">{r.centro_custo_nome}</td>
                    <td className="py-2.5 px-3 text-slate-600">{r.solicitante_nome}</td>
                    <td className="py-2.5 px-3 text-center">
                      {r.prioridade === 'urgente' ? (
                        <span className="inline-flex items-center gap-1 text-rose-700 font-bold bg-rose-50 px-2 py-0.5 rounded text-[10px] border border-rose-200">
                          <Flame className="w-3 h-3 text-rose-600" />
                          <span>URGENTE</span>
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                          Normal
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center">{getStatusBadge(r.status)}</td>
                    <td className="py-2.5 px-3 text-center">
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="font-bold text-slate-700">{r.total_itens || 1} item(ns)</span>
                        {r.status !== 'pendente' && ((r.itens_aprovados ?? 0) > 0 || (r.itens_negados ?? 0) > 0) && (
                          <div className="flex items-center gap-1 text-[10px]">
                            {(r.itens_aprovados ?? 0) > 0 && (
                              <span className="text-emerald-700 font-semibold">{r.itens_aprovados} aprov.</span>
                            )}
                            {(r.itens_aprovados ?? 0) > 0 && (r.itens_negados ?? 0) > 0 && (
                              <span className="text-slate-300">·</span>
                            )}
                            {(r.itens_negados ?? 0) > 0 && (
                              <span className="text-rose-700 font-semibold">{r.itens_negados} neg.</span>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleAbrirAnalise(r, 'conferencia')}
                          className="px-2.5 py-1 rounded bg-teal-50 hover:bg-teal-100 text-teal-800 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>{isAlmoxarifeOrAdmin && r.status === 'pendente' ? 'ANALISAR' : 'VER'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleAbrirAnalise(r, 'historico')}
                          title="Visualizar log detalhado de histórico de alterações e auditoria de aprovação/negação por item"
                          className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <History className="w-3.5 h-3.5 text-[#00237D]" />
                          <span>HISTÓRICO</span>
                          {(r.total_eventos_historico ?? 0) > 0 && (
                            <span className="bg-white text-slate-600 border border-slate-300 px-1 rounded text-[10px] font-mono">
                              {r.total_eventos_historico}
                            </span>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleEmitirPdfRequisicao(r, 'print', null, false)}
                          title="Imprimir Requisição (Padrão Limpo)"
                          className="p-1.5 rounded bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-[#00237D] border border-slate-200 transition-colors cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>

                        {isAlmoxarifeOrAdmin && (
                          <button
                            type="button"
                            onClick={() => handleEmitirPdfRequisicao(r, 'print', null, true)}
                            title="Imprimir com Histórico e Trilha de Auditoria (Admin / Almoxarife)"
                            className="p-1.5 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 hover:text-indigo-900 border border-indigo-200 transition-colors cursor-pointer"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleEmitirPdfRequisicao(r, 'download', null, false)}
                          title="Baixar Guia da Requisição em PDF"
                          className="p-1.5 rounded bg-slate-100 hover:bg-teal-50 text-slate-600 hover:text-teal-700 border border-slate-200 transition-colors cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>

                        {(currentUser?.perfil === 'admin' ||
                          (currentUser?.perfil === 'almoxarife' && r.status !== 'aprovada_atendida') ||
                          (currentUser?.id === r.solicitante_id && r.status === 'pendente')) && (
                          <button
                            type="button"
                            onClick={() => setDeletingRequisicao(r)}
                            title="Excluir requisição"
                            className="p-1.5 rounded bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    Nenhuma requisição encontrada para os critérios selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Rodapé da Consulta */}
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
          <div>
            <strong>{filteredRequisicoes.length}</strong> registro(s) encontrado(s)
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
              Página {currentPage} de {totalPages}
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

      {/* =========================================================================
          MODAL DE ANÁLISE / ATENDIMENTO DO ALMOXARIFE E LOG DE AUDITORIA POR ITEM
         ========================================================================= */}
      {selectedReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-teal-100 text-teal-800 px-2 py-0.5 rounded">
                  Conferência de Dispensação e Trilha de Auditoria Hospitalar
                </span>
                <h2 className="text-base font-bold text-slate-800 mt-1">
                  Requisição: {selectedReq.numero_requisicao}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setSelectedReq(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Abas do Modal: 1. Conferência e Decisão por Item | 2. Log de Auditoria e Histórico */}
            <div className="flex border-b border-slate-200 px-6 bg-slate-50">
              <button
                type="button"
                onClick={() => setActiveDetailTab('conferencia')}
                className={`px-4 py-3 text-xs font-bold uppercase tracking-wider border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
                  activeDetailTab === 'conferencia'
                    ? 'border-[#00237D] text-[#00237D] bg-white'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <CheckSquare className="w-4 h-4" />
                <span>1. Conferência e Decisão por Item</span>
                <span className="bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded text-[10px]">
                  {reqDetails?.itens?.length ?? selectedReq.total_itens ?? 0}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveDetailTab('historico')}
                className={`px-4 py-3 text-xs font-bold uppercase tracking-wider border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
                  activeDetailTab === 'historico'
                    ? 'border-[#00237D] text-[#00237D] bg-white'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <History className="w-4 h-4" />
                <span>2. Log de Histórico e Auditoria de Alterações</span>
                <span className="bg-[#00237D]/10 text-[#00237D] px-1.5 py-0.5 rounded text-[10px] font-mono">
                  {reqDetails?.historico?.length ?? selectedReq.total_eventos_historico ?? 0}
                </span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {actionError && (
                <div className="p-3.5 rounded bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{actionError}</span>
                </div>
              )}

              {/* Informações Gerais da Requisição */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-500 font-semibold uppercase text-[10px] block">Centro de Custo</span>
                  <span className="font-bold text-slate-800">{selectedReq.centro_custo_nome}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold uppercase text-[10px] block">Solicitante</span>
                  <span className="font-bold text-slate-800">{selectedReq.solicitante_nome}</span>
                  <span className="text-[10px] text-slate-500 block">
                    {new Date(selectedReq.data_solicitacao).toLocaleString('pt-BR')}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold uppercase text-[10px] block">Prioridade</span>
                  <span className={`font-bold ${selectedReq.prioridade === 'urgente' ? 'text-rose-700' : 'text-slate-700'}`}>
                    {selectedReq.prioridade === 'urgente' ? 'URGENTE' : 'Normal'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold uppercase text-[10px] block">Status Atual</span>
                  <div className="mt-0.5">{getStatusBadge(selectedReq.status)}</div>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold uppercase text-[10px] block">Responsável Análise</span>
                  <span className="font-bold text-slate-800">
                    {reqDetails?.requisicao?.almoxarife_nome || selectedReq.almoxarife_nome || 'Aguardando Análise'}
                  </span>
                  {(reqDetails?.requisicao?.data_atendimento || selectedReq.data_atendimento) && (
                    <span className="text-[10px] text-slate-500 block">
                      {new Date(
                        (reqDetails?.requisicao?.data_atendimento || selectedReq.data_atendimento) as string
                      ).toLocaleString('pt-BR')}
                    </span>
                  )}
                </div>
              </div>

              {selectedReq.observacao && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded text-xs text-slate-700">
                  <strong>Observação / Justificativa Clínica da Solicitação:</strong> {selectedReq.observacao}
                </div>
              )}

              {(reqDetails?.requisicao?.motivo_rejeicao || selectedReq.motivo_rejeicao) && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded text-xs text-rose-800">
                  <strong>Parecer / Registro de Recusa ou Atendimento Parcial:</strong>{' '}
                  {reqDetails?.requisicao?.motivo_rejeicao || selectedReq.motivo_rejeicao}
                </div>
              )}

              {isLoadingDetails ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  Carregando itens e trilha de auditoria da requisição...
                </div>
              ) : activeDetailTab === 'conferencia' ? (
                /* =================================================================
                   ABA 1: CONFERÊNCIA DE SALDOS E APROVAÇÃO / NEGAÇÃO POR ITEM
                   ================================================================= */
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                        Itens da Requisição — Conferência de Saldo e Decisão Individual por Item
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        {isAlmoxarifeOrAdmin && selectedReq.status === 'pendente'
                          ? 'Aprove ou negue cada item individualmente. Toda decisão fica registrada com seu usuário e data/hora no log de auditoria.'
                          : 'Demonstrativo auditado de cada item solicitado, decisão tomada e responsável pela análise.'}
                      </p>
                    </div>

                    {isAlmoxarifeOrAdmin && selectedReq.status === 'pendente' && reqDetails?.itens && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            const next: typeof itemDecisoes = {};
                            for (const it of reqDetails.itens) {
                              const lotes = it.lotes_disponiveis || [];
                              const dist: Record<number, number> = {};
                              let restante = it.quantidade_solicitada;
                              for (const l of lotes) {
                                if (restante <= 0) {
                                  dist[l.id] = 0;
                                } else {
                                  const abater = Math.min(Number(l.quantidade_atual), restante);
                                  dist[l.id] = abater;
                                  restante -= abater;
                                }
                              }
                              const soma = Object.values(dist).reduce((a, b) => a + b, 0);
                              next[it.id] = {
                                decisao: 'aprovado',
                                quantidade_atendida: lotes.length > 0 ? soma : it.quantidade_solicitada,
                                motivo_decisao: 'Item conferido, aprovado e dispensado pelo almoxarifado.',
                                lotes_distribuicao: dist,
                              };
                            }
                            setItemDecisoes(next);
                          }}
                          className="px-2.5 py-1 rounded border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[11px] font-semibold cursor-pointer"
                        >
                          Marcar Todos Aprovados (Sugerir FEFO)
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3">Código / Produto</th>
                          <th className="py-2.5 px-3 text-center">UN</th>
                          {!isRequisitante && <th className="py-2.5 px-3 text-right">Saldo Físico</th>}
                          <th className="py-2.5 px-3 text-right">Solicitado</th>
                          <th className="py-2.5 px-3 text-right">Atendido</th>
                          <th className="py-2.5 px-3 text-center">Decisão do Item</th>
                          <th className="py-2.5 px-3">{isRequisitante ? 'Parecer Técnico' : 'Auditoria / Justificativa do Item'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {reqDetails?.itens.map((it) => {
                          const saldo = it.saldo_atual_estoque ?? 0;
                          const lotes = it.lotes_disponiveis || [];
                          const dec = itemDecisoes[it.id] || {
                            decisao: 'aprovado' as const,
                            quantidade_atendida: it.quantidade_solicitada,
                            motivo_decisao: '',
                            lotes_distribuicao: {},
                          };
                          const suficiente = saldo >= (selectedReq.status === 'pendente' ? dec.quantidade_atendida : it.quantidade_solicitada);
                          const statusAuditado = it.status_item || (
                            selectedReq.status === 'aprovada_atendida'
                              ? 'aprovado'
                              : selectedReq.status === 'rejeitada'
                              ? 'negado'
                              : 'pendente'
                          );

                          const hasMultipleLots = lotes.length > 1;
                          const hasSingleLot = lotes.length === 1;
                          const singleLot = hasSingleLot ? lotes[0] : null;
                          const isFracionavel = isUnidadeFracionavel(it.unidade_medida);

                          // Parse seguro dos lotes atendidos quando já finalizada
                          let lotesAtendidosList: any[] = [];
                          if (Array.isArray(it.lotes_atendidos)) {
                            lotesAtendidosList = it.lotes_atendidos;
                          } else if (typeof it.lotes_atendidos === 'string') {
                            try {
                              lotesAtendidosList = JSON.parse(it.lotes_atendidos);
                            } catch {
                              lotesAtendidosList = [];
                            }
                          }

                          return (
                            <React.Fragment key={it.id}>
                              <tr
                                className={
                                  selectedReq.status === 'pendente' && isAlmoxarifeOrAdmin
                                    ? dec.decisao === 'negado'
                                      ? 'bg-rose-50/40'
                                      : 'bg-emerald-50/15'
                                    : 'hover:bg-slate-50'
                                }
                              >
                                <td className="py-2.5 px-3">
                                  <div className="font-mono font-bold text-slate-800">{it.produto_codigo}</div>
                                  <div className="text-slate-700 font-medium">{it.produto_nome}</div>

                                  {/* Visibilidade restrita: Requisitantes NÃO visualizam lotes, validades ou saldos de lotes */}
                                  {!isRequisitante && (
                                    <>
                                      {/* Caso 1: Produto com lote único em análise */}
                                      {selectedReq.status === 'pendente' && hasSingleLot && singleLot && (
                                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                          <Tag className="w-3 h-3 text-emerald-600 shrink-0" />
                                          <span>Lote único selecionado: <strong>{singleLot.numero_lote}</strong></span>
                                          <span>•</span>
                                          <span>Val: {formatDataValidade(singleLot.data_validade)}</span>
                                          <span>•</span>
                                          <span>Saldo do Lote: <strong>{singleLot.quantidade_atual} {it.unidade_medida}</strong></span>
                                        </div>
                                      )}

                                      {/* Caso 2: Produto com múltiplos lotes em análise */}
                                      {selectedReq.status === 'pendente' && hasMultipleLots && (
                                        <div className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                                          <Layers className="w-3 h-3 text-teal-600 shrink-0" />
                                          <span>{lotes.length} lotes disponíveis com saldo (Sugestão FEFO ativa abaixo)</span>
                                        </div>
                                      )}

                                      {/* Caso 3: Produto atendido com registro de lotes dispensados */}
                                      {selectedReq.status === 'aprovada_atendida' && lotesAtendidosList.length > 0 && (
                                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                          {lotesAtendidosList.map((la: any, laIdx: number) => (
                                            <div
                                              key={laIdx}
                                              className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200"
                                            >
                                              <Tag className="w-3 h-3 text-teal-600 shrink-0" />
                                              <span>Lote: <strong>{la.numero_lote || 'N/A'}</strong></span>
                                              <span>(Val: {formatDataValidade(la.data_validade)})</span>
                                              <span>•</span>
                                              <span>Dispensado: <strong>{la.quantidade} {it.unidade_medida}</strong></span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </>
                                  )}
                                </td>

                                <td className="py-2.5 px-3 text-center font-bold text-slate-600">{it.unidade_medida}</td>

                                {!isRequisitante && (
                                  <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-700">
                                    <div>{saldo}</div>
                                    {selectedReq.status === 'pendente' && (
                                      <span
                                        className={`text-[10px] font-semibold ${
                                          suficiente ? 'text-emerald-700' : 'text-rose-700'
                                        }`}
                                      >
                                        {suficiente ? 'Disponível' : 'Insuficiente'}
                                      </span>
                                    )}
                                  </td>
                                )}

                                <td className="py-2.5 px-3 text-right font-mono font-bold text-teal-800">
                                  {it.quantidade_solicitada}
                                </td>

                                {/* Coluna Qtd Atendida com Stepper e Ponderação */}
                                <td className="py-2.5 px-3 text-right font-mono font-bold">
                                  {isAlmoxarifeOrAdmin && selectedReq.status === 'pendente' ? (
                                    dec.decisao === 'aprovado' ? (
                                      hasMultipleLots ? (
                                        /* Para múltiplos lotes: mostra a soma total dos lotes escolhidos */
                                        <div className="flex flex-col items-end gap-1">
                                          <div className="font-mono text-sm font-bold text-teal-800">
                                            {dec.quantidade_atendida} {it.unidade_medida}
                                          </div>
                                          {dec.quantidade_atendida === it.quantidade_solicitada ? (
                                            <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                                              Integral ({dec.quantidade_atendida})
                                            </span>
                                          ) : dec.quantidade_atendida > it.quantidade_solicitada ? (
                                            <span className="text-[10px] text-blue-700 font-semibold bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200">
                                              Ponderada (+{Number((dec.quantidade_atendida - it.quantidade_solicitada).toFixed(2))})
                                            </span>
                                          ) : dec.quantidade_atendida > 0 ? (
                                            <span className="text-[10px] text-amber-700 font-semibold bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                                              Parcial ({dec.quantidade_atendida}/{it.quantidade_solicitada})
                                            </span>
                                          ) : (
                                            <span className="text-[10px] text-rose-700 font-semibold bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200">
                                              0 selecionado
                                            </span>
                                          )}
                                        </div>
                                      ) : hasSingleLot && singleLot ? (
                                        /* Para lote único: stepper direto limitado ao saldo do lote */
                                        <div className="flex flex-col items-end gap-1">
                                          <QuantityStepper
                                            value={dec.lotes_distribuicao?.[singleLot.id] ?? dec.quantidade_atendida}
                                            min={0}
                                            max={Number(singleLot.quantidade_atual)}
                                            step={isFracionavel ? 0.01 : 1}
                                            isFractionable={isFracionavel}
                                            onChange={(val) => handleLotQuantityChange(it.id, singleLot.id, val)}
                                          />
                                          {dec.quantidade_atendida > it.quantidade_solicitada && (
                                            <span className="text-[10px] text-blue-700 font-semibold bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200">
                                              Ponderada (+{Number((dec.quantidade_atendida - it.quantidade_solicitada).toFixed(2))})
                                            </span>
                                          )}
                                          {dec.quantidade_atendida < it.quantidade_solicitada && dec.quantidade_atendida > 0 && (
                                            <span className="text-[10px] text-amber-700 font-semibold bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                                              Parcial ({dec.quantidade_atendida}/{it.quantidade_solicitada})
                                            </span>
                                          )}
                                        </div>
                                      ) : (
                                        /* Para item sem lotes específicos: stepper direto limitado ao saldo geral */
                                        <div className="flex flex-col items-end gap-1">
                                          <QuantityStepper
                                            value={dec.quantidade_atendida}
                                            min={0}
                                            max={it.saldo_atual_estoque ?? 999999}
                                            step={isFracionavel ? 0.01 : 1}
                                            isFractionable={isFracionavel}
                                            onChange={(val) => handleItemQuantityChange(it.id, val)}
                                          />
                                          {dec.quantidade_atendida > it.quantidade_solicitada && (
                                            <span className="text-[10px] text-blue-700 font-semibold bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200">
                                              Ponderada (+{Number((dec.quantidade_atendida - it.quantidade_solicitada).toFixed(2))})
                                            </span>
                                          )}
                                          {dec.quantidade_atendida < it.quantidade_solicitada && dec.quantidade_atendida > 0 && (
                                            <span className="text-[10px] text-amber-700 font-semibold bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                                              Parcial ({dec.quantidade_atendida}/{it.quantidade_solicitada})
                                            </span>
                                          )}
                                        </div>
                                      )
                                    ) : (
                                      <span className="text-rose-600">0 (Negado)</span>
                                    )
                                  ) : (
                                    <span className={statusAuditado === 'negado' ? 'text-rose-600' : 'text-emerald-700'}>
                                      {it.quantidade_atendida ?? 0}
                                    </span>
                                  )}
                                </td>

                                {/* Coluna Decisão do Item */}
                                <td className="py-2.5 px-3 text-center">
                                  {isAlmoxarifeOrAdmin && selectedReq.status === 'pendente' ? (
                                    <div className="inline-flex rounded border border-slate-300 overflow-hidden shadow-xs">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          // Restaura aprovação e distribuição sugerida FEFO
                                          const dist: Record<number, number> = {};
                                          let restante = it.quantidade_solicitada;
                                          for (const l of lotes) {
                                            if (restante <= 0) {
                                              dist[l.id] = 0;
                                            } else {
                                              const abater = Math.min(Number(l.quantidade_atual), restante);
                                              dist[l.id] = abater;
                                              restante -= abater;
                                            }
                                          }
                                          const soma = Object.values(dist).reduce((a, b) => a + b, 0);
                                          setItemDecisoes((prev) => ({
                                            ...prev,
                                            [it.id]: {
                                              decisao: 'aprovado',
                                              quantidade_atendida: lotes.length > 0 ? soma : it.quantidade_solicitada,
                                              motivo_decisao: prev[it.id]?.motivo_decisao || 'Item conferido, aprovado e dispensado pelo almoxarifado.',
                                              lotes_distribuicao: dist,
                                            },
                                          }));
                                        }}
                                        className={`px-2.5 py-1 text-[10px] font-bold uppercase flex items-center gap-1 cursor-pointer transition-colors ${
                                          dec.decisao === 'aprovado'
                                            ? 'bg-emerald-600 text-white'
                                            : 'bg-white text-slate-600 hover:bg-slate-100'
                                        }`}
                                      >
                                        <Check className="w-3 h-3" />
                                        <span>Aprovar</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setItemDecisoes((prev) => ({
                                            ...prev,
                                            [it.id]: {
                                              decisao: 'negado',
                                              quantidade_atendida: 0,
                                              motivo_decisao:
                                                dec.decisao === 'negado' && dec.motivo_decisao
                                                  ? dec.motivo_decisao
                                                  : '',
                                              lotes_distribuicao: Object.keys(prev[it.id]?.lotes_distribuicao || {}).reduce(
                                                (acc, k) => ({ ...acc, [k]: 0 }),
                                                {}
                                              ),
                                            },
                                          }))
                                        }
                                        className={`px-2.5 py-1 text-[10px] font-bold uppercase flex items-center gap-1 cursor-pointer transition-colors ${
                                          dec.decisao === 'negado'
                                            ? 'bg-rose-600 text-white'
                                            : 'bg-white text-slate-600 hover:bg-slate-100'
                                        }`}
                                      >
                                        <X className="w-3 h-3" />
                                        <span>Negar</span>
                                      </button>
                                    </div>
                                  ) : statusAuditado === 'aprovado' ? (
                                    <span className="inline-flex items-center gap-1 text-emerald-800 font-bold bg-emerald-50 px-2 py-0.5 rounded text-[10px] border border-emerald-300">
                                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                      <span>APROVADO</span>
                                    </span>
                                  ) : statusAuditado === 'negado' ? (
                                    <span className="inline-flex items-center gap-1 text-rose-800 font-bold bg-rose-50 px-2 py-0.5 rounded text-[10px] border border-rose-300">
                                      <XCircle className="w-3 h-3 text-rose-600" />
                                      <span>NEGADO</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-amber-800 font-bold bg-amber-50 px-2 py-0.5 rounded text-[10px] border border-amber-300">
                                      <Clock className="w-3 h-3 text-amber-600" />
                                      <span>PENDENTE</span>
                                    </span>
                                  )}
                                </td>

                                {/* Coluna Auditoria / Justificativa do Item */}
                                <td className="py-2.5 px-3">
                                  {isAlmoxarifeOrAdmin && selectedReq.status === 'pendente' ? (
                                    dec.decisao === 'negado' ? (
                                      <div className="space-y-1.5 min-w-[220px]">
                                        <select
                                          value={
                                            MOTIVOS_NEGACAO_CURTA.find((m) => dec.motivo_decisao.startsWith(m)) ||
                                            (dec.motivo_decisao ? 'Outro' : 'Sem estoque')
                                          }
                                          onChange={(e) => {
                                            const selectedM = e.target.value;
                                            const currentObs = dec.motivo_decisao.includes(':')
                                              ? dec.motivo_decisao.split(':').slice(1).join(':').trim()
                                              : '';
                                            const updatedMotivo = currentObs ? `${selectedM}: ${currentObs}` : selectedM;
                                            setItemDecisoes((prev) => ({
                                              ...prev,
                                              [it.id]: {
                                                ...dec,
                                                motivo_decisao: updatedMotivo,
                                              },
                                            }));
                                          }}
                                          className="w-full px-2 py-1 bg-white border border-rose-300 text-rose-900 rounded text-xs focus:border-rose-500 font-semibold"
                                        >
                                          {MOTIVOS_NEGACAO_CURTA.map((m) => (
                                            <option key={m} value={m}>
                                              {m}
                                            </option>
                                          ))}
                                        </select>
                                        <input
                                          type="text"
                                          value={
                                            dec.motivo_decisao.includes(':')
                                              ? dec.motivo_decisao.split(':').slice(1).join(':').trim()
                                              : (MOTIVOS_NEGACAO_CURTA.includes(dec.motivo_decisao) ? '' : dec.motivo_decisao)
                                          }
                                          onChange={(e) => {
                                            const obs = e.target.value;
                                            const baseM =
                                              MOTIVOS_NEGACAO_CURTA.find((m) => dec.motivo_decisao.startsWith(m)) || 'Sem estoque';
                                            const updatedMotivo = obs.trim() ? `${baseM}: ${obs.trim()}` : baseM;
                                            setItemDecisoes((prev) => ({
                                              ...prev,
                                              [it.id]: {
                                                ...dec,
                                                motivo_decisao: updatedMotivo,
                                              },
                                            }));
                                          }}
                                          placeholder="Observação opcional..."
                                          className="w-full px-2 py-1 bg-white border border-slate-200 text-slate-700 rounded text-[11px] focus:border-rose-400 placeholder:text-slate-400"
                                        />
                                      </div>
                                    ) : (
                                      <input
                                        type="text"
                                        value={dec.motivo_decisao}
                                        onChange={(e) =>
                                          setItemDecisoes((prev) => ({
                                            ...prev,
                                            [it.id]: {
                                              ...dec,
                                              motivo_decisao: e.target.value,
                                            },
                                          }))
                                        }
                                        placeholder="Parecer de aprovação (opcional)..."
                                        className="w-full px-2.5 py-1 rounded text-xs border bg-white border-slate-300 text-slate-700 focus:border-teal-500"
                                      />
                                    )
                                  ) : (
                                    <div className="space-y-0.5">
                                      {!isRequisitante && it.analisado_por_nome && (
                                        <div className="flex items-center gap-1 text-[11px] font-bold text-slate-800">
                                          <UserCheck className="w-3.5 h-3.5 text-[#00237D] shrink-0" />
                                          <span>{it.analisado_por_nome}</span>
                                          {it.analisado_por_perfil && (
                                            <span className="text-[9px] uppercase px-1 py-0.2 rounded bg-slate-200 text-slate-700">
                                              {it.analisado_por_perfil}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                      {!isRequisitante && it.data_analise && (
                                        <div className="text-[10px] text-slate-500">
                                          Em {new Date(it.data_analise).toLocaleString('pt-BR')}
                                        </div>
                                      )}
                                      {it.motivo_decisao && (
                                        <div className="text-[11px] text-slate-700 italic">
                                          “{isRequisitante ? formatMotivoParaRequisitante(it.motivo_decisao) : it.motivo_decisao}”
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </td>
                              </tr>

                              {/* Linha de Sub-Tabela: Escolha de Lotes quando o produto tiver mais de 1 lote disponível */}
                              {selectedReq.status === 'pendente' && isAlmoxarifeOrAdmin && dec.decisao === 'aprovado' && hasMultipleLots && (
                                <tr className="bg-slate-50/80 border-b border-slate-200">
                                  <td colSpan={7} className="px-4 py-3">
                                    <div className="bg-white border border-teal-200 rounded-lg p-3 shadow-xs">
                                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                                        <div className="flex items-center gap-2">
                                          <Layers className="w-4 h-4 text-teal-700 shrink-0" />
                                          <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                                            Escolha de Lotes para Dispensação (Ordenado por Validade / FEFO)
                                          </span>
                                        </div>
                                        <span className="text-[11px] text-slate-500 italic">
                                          Sugestão automática pré-selecionada. O almoxarife pode alterar ou dividir entre os lotes.
                                        </span>
                                      </div>

                                      <div className="border border-slate-200 rounded-md overflow-hidden">
                                        <table className="w-full text-left text-xs">
                                          <thead className="bg-slate-100 text-slate-700 font-bold text-[11px] border-b border-slate-200">
                                            <tr>
                                              <th className="py-2 px-3">Lote</th>
                                              <th className="py-2 px-3 text-center">Validade</th>
                                              <th className="py-2 px-3 text-right">Saldo Disponível</th>
                                              <th className="py-2 px-3 text-right">Quantidade a Dispensar deste Lote</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-slate-200">
                                            {lotes.map((l, lIdx) => {
                                              const loteQty = dec.lotes_distribuicao?.[l.id] ?? 0;
                                              const isSugerido = lIdx === 0;
                                              return (
                                                <tr
                                                  key={l.id}
                                                  className={loteQty > 0 ? 'bg-teal-50/40 font-medium' : 'hover:bg-slate-50'}
                                                >
                                                  <td className="py-2 px-3 font-mono font-bold text-slate-800">
                                                    <div className="flex items-center gap-2">
                                                      <span>{l.numero_lote}</span>
                                                      {isSugerido && (
                                                        <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded font-sans font-semibold border border-emerald-300">
                                                          Sugestão FEFO (Vence 1º)
                                                        </span>
                                                      )}
                                                    </div>
                                                  </td>
                                                  <td className="py-2 px-3 text-center font-mono">
                                                    <span className="font-semibold text-slate-700">
                                                      {formatDataValidade(l.data_validade)}
                                                    </span>
                                                    {l.dias_para_vencer !== undefined && l.dias_para_vencer !== null && (
                                                      <div className="text-[10px] text-slate-500 font-sans">
                                                        {l.dias_para_vencer > 0 ? `${l.dias_para_vencer} dias restantes` : 'Vence hoje'}
                                                      </div>
                                                    )}
                                                  </td>
                                                  <td className="py-2 px-3 text-right font-mono font-bold text-slate-700">
                                                    {l.quantidade_atual} {it.unidade_medida}
                                                  </td>
                                                  <td className="py-2 px-3 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                      <QuantityStepper
                                                        value={loteQty}
                                                        min={0}
                                                        max={Number(l.quantidade_atual)}
                                                        step={isFracionavel ? 0.01 : 1}
                                                        isFractionable={isFracionavel}
                                                        onChange={(newQ) => handleLotQuantityChange(it.id, l.id, newQ)}
                                                        size="sm"
                                                      />
                                                      <button
                                                        type="button"
                                                        onClick={() =>
                                                          handleLotQuantityChange(it.id, l.id, Number(l.quantidade_atual))
                                                        }
                                                        title="Dispensar saldo total disponível deste lote"
                                                        className="px-2 py-1 text-[10px] font-semibold text-slate-600 hover:text-teal-700 bg-slate-100 hover:bg-teal-50 border border-slate-200 rounded cursor-pointer transition-colors"
                                                      >
                                                        Máx
                                                      </button>
                                                      {loteQty > 0 && (
                                                        <button
                                                          type="button"
                                                          onClick={() => handleLotQuantityChange(it.id, l.id, 0)}
                                                          title="Zerar quantidade deste lote"
                                                          className="px-2 py-1 text-[10px] font-semibold text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded cursor-pointer transition-colors"
                                                        >
                                                          Zerar
                                                        </button>
                                                      )}
                                                    </div>
                                                  </td>
                                                </tr>
                                              );
                                            })}
                                          </tbody>
                                        </table>
                                      </div>

                                      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 px-1">
                                        <div className="text-[11px]">
                                          Soma dispensada dos lotes: <strong className="text-teal-800 font-mono">{dec.quantidade_atendida} {it.unidade_medida}</strong> (Solicitado: <span className="font-mono">{it.quantidade_solicitada} {it.unidade_medida}</span>)
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            // Restaura a sugestão padrão FEFO
                                            const dist: Record<number, number> = {};
                                            let restante = it.quantidade_solicitada;
                                            for (const l of lotes) {
                                              if (restante <= 0) {
                                                dist[l.id] = 0;
                                              } else {
                                                const abater = Math.min(Number(l.quantidade_atual), restante);
                                                dist[l.id] = abater;
                                                restante -= abater;
                                              }
                                            }
                                            const soma = Object.values(dist).reduce((a, b) => a + b, 0);
                                            setItemDecisoes((prev) => ({
                                              ...prev,
                                              [it.id]: {
                                                ...dec,
                                                quantidade_atendida: soma,
                                                lotes_distribuicao: dist,
                                                decisao: soma > 0 ? 'aprovado' : dec.decisao,
                                              },
                                            }));
                                          }}
                                          className="text-[11px] text-teal-700 hover:text-teal-900 font-semibold underline cursor-pointer"
                                        >
                                          Restaurar Sugestão FEFO Padrão
                                        </button>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                /* =================================================================
                   ABA 2: LOG DETALHADO DE HISTÓRICO DE ALTERAÇÕES E AUDITORIA
                   ================================================================= */
                <div className="space-y-6">
                  {/* Quadro Resumo de Responsabilidade por Item (Quem Aprovou ou Negou cada item) */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-[#00237D]" />
                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                          Auditoria Direta por Item — Quem Aprovou ou Negou Cada Material
                        </h4>
                      </div>
                      <span className="text-[11px] text-slate-500 font-medium">
                        Rastreabilidade Nominal Obrigatória
                      </span>
                    </div>

                    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider border-b border-slate-200">
                          <tr>
                            <th className="py-2 px-3">Item / Material</th>
                            <th className="py-2 px-3 text-right">Solicitado</th>
                            <th className="py-2 px-3 text-right">Atendido</th>
                            <th className="py-2 px-3 text-center">Decisão</th>
                            <th className="py-2 px-3">Quem Aprovou / Negou</th>
                            <th className="py-2 px-3">Data / Hora da Decisão</th>
                            <th className="py-2 px-3">Parecer / Justificativa Auditada</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {reqDetails?.itens.map((it) => {
                            const statusItem =
                              it.status_item ||
                              (selectedReq.status === 'aprovada_atendida'
                                ? 'aprovado'
                                : selectedReq.status === 'rejeitada'
                                ? 'negado'
                                : 'pendente');

                            return (
                              <tr key={it.id} className="hover:bg-slate-50">
                                <td className="py-2 px-3">
                                  <span className="font-mono font-bold text-slate-800">{it.produto_codigo}</span>{' '}
                                  <span className="text-slate-700">— {it.produto_nome}</span>
                                </td>
                                <td className="py-2 px-3 text-right font-mono font-semibold text-slate-700">
                                  {it.quantidade_solicitada} {it.unidade_medida}
                                </td>
                                <td className="py-2 px-3 text-right font-mono font-bold text-slate-800">
                                  {it.quantidade_atendida} {it.unidade_medida}
                                </td>
                                <td className="py-2 px-3 text-center">
                                  {statusItem === 'aprovado' ? (
                                    <span className="inline-flex items-center gap-1 text-emerald-800 font-bold bg-emerald-50 px-2 py-0.5 rounded text-[10px] border border-emerald-300">
                                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                      <span>APROVADO</span>
                                    </span>
                                  ) : statusItem === 'negado' ? (
                                    <span className="inline-flex items-center gap-1 text-rose-800 font-bold bg-rose-50 px-2 py-0.5 rounded text-[10px] border border-rose-300">
                                      <XCircle className="w-3 h-3 text-rose-600" />
                                      <span>NEGADO</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-amber-800 font-bold bg-amber-50 px-2 py-0.5 rounded text-[10px] border border-amber-300">
                                      <Clock className="w-3 h-3 text-amber-600" />
                                      <span>PENDENTE</span>
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 px-3">
                                  {it.analisado_por_nome ? (
                                    <div>
                                      <div className="font-bold text-slate-800">{it.analisado_por_nome}</div>
                                      <div className="text-[10px] text-slate-500">
                                        @{it.analisado_por_login || 'operador'} ·{' '}
                                        <span className="uppercase font-semibold">{it.analisado_por_perfil || 'almoxarife'}</span>
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="text-slate-400">Não analisado</span>
                                  )}
                                </td>
                                <td className="py-2 px-3 font-mono text-[11px] text-slate-600">
                                  {it.data_analise ? new Date(it.data_analise).toLocaleString('pt-BR') : '-'}
                                </td>
                                <td className="py-2 px-3 text-slate-600">
                                  {it.motivo_decisao || '-'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Linha do Tempo Completa de Eventos da Requisição */}
                  <div className="space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <History className="w-4 h-4 text-teal-700" />
                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                          Linha do Tempo Cronológica de Alterações (Log Imutável)
                        </h4>
                      </div>

                      {/* Filtro de eventos do histórico */}
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setHistoricoFiltro('todos')}
                          className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                            historicoFiltro === 'todos'
                              ? 'bg-[#00237D] text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          Todos ({reqDetails?.historico?.length ?? 0})
                        </button>
                        <button
                          type="button"
                          onClick={() => setHistoricoFiltro('itens')}
                          className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                            historicoFiltro === 'itens'
                              ? 'bg-[#00237D] text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          Aprovações / Negações de Itens
                        </button>
                        <button
                          type="button"
                          onClick={() => setHistoricoFiltro('fluxo')}
                          className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                            historicoFiltro === 'fluxo'
                              ? 'bg-[#00237D] text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          Eventos da Requisição
                        </button>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {(reqDetails?.historico || [])
                        .filter((ev) => {
                          if (historicoFiltro === 'itens') {
                            return ev.acao === 'aprovacao_item' || ev.acao === 'negacao_item' || ev.acao === 'inclusao_item';
                          }
                          if (historicoFiltro === 'fluxo') {
                            return (
                              ev.acao === 'criacao_requisicao' ||
                              ev.acao === 'aprovacao_total' ||
                              ev.acao === 'aprovacao_parcial' ||
                              ev.acao === 'rejeicao_total' ||
                              ev.acao === 'cancelamento'
                            );
                          }
                          return true;
                        })
                        .map((ev) => {
                          const isApprove = ev.acao === 'aprovacao_item' || ev.acao === 'aprovacao_total';
                          const isDeny = ev.acao === 'negacao_item' || ev.acao === 'rejeicao_total' || ev.acao === 'cancelamento';
                          const isPartial = ev.acao === 'aprovacao_parcial';

                          const badgeLabel: Record<string, string> = {
                            criacao_requisicao: 'ABERTURA DE REQUISIÇÃO',
                            inclusao_item: 'ITEM SOLICITADO',
                            aprovacao_item: 'ITEM APROVADO',
                            negacao_item: 'ITEM NEGADO',
                            aprovacao_total: 'APROVAÇÃO INTEGRAL E BAIXA',
                            aprovacao_parcial: 'ATENDIMENTO PARCIAL',
                            rejeicao_total: 'REJEIÇÃO DA REQUISIÇÃO',
                            cancelamento: 'CANCELAMENTO',
                          };

                          return (
                            <div
                              key={ev.id}
                              className={`p-3.5 rounded-lg border flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                                isApprove
                                  ? 'bg-emerald-50/40 border-emerald-200'
                                  : isDeny
                                  ? 'bg-rose-50/40 border-rose-200'
                                  : isPartial
                                  ? 'bg-amber-50/40 border-amber-200'
                                  : 'bg-white border-slate-200'
                              }`}
                            >
                              <div className="space-y-1.5">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                                      isApprove
                                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                        : isDeny
                                        ? 'bg-rose-100 text-rose-800 border-rose-300'
                                        : isPartial
                                        ? 'bg-amber-100 text-amber-800 border-amber-300'
                                        : 'bg-slate-100 text-slate-700 border-slate-300'
                                    }`}
                                  >
                                    {badgeLabel[ev.acao] || ev.acao}
                                  </span>

                                  {ev.produto_codigo && (
                                    <span className="px-2 py-0.5 rounded bg-white border border-slate-200 text-[11px] font-mono font-bold text-slate-800">
                                      {ev.produto_codigo} — {ev.produto_nome}
                                    </span>
                                  )}

                                  {ev.status_anterior && ev.status_novo && (
                                    <span className="text-[10px] font-mono text-slate-500">
                                      [{ev.status_anterior.toUpperCase()} → {ev.status_novo.toUpperCase()}]
                                    </span>
                                  )}
                                </div>

                                <p className="text-xs text-slate-800 font-medium">{ev.detalhes}</p>

                                {ev.justificativa && (
                                  <div className="text-[11px] text-slate-600 bg-white/80 px-2.5 py-1.5 rounded border border-slate-200/80">
                                    <strong>Parecer / Justificativa:</strong> {ev.justificativa}
                                  </div>
                                )}
                              </div>

                              <div className="md:text-right shrink-0 border-t md:border-t-0 pt-2 md:pt-0 border-slate-200/60">
                                <div className="text-xs font-bold text-slate-800">
                                  {ev.usuario_nome}
                                </div>
                                <div className="text-[10px] text-slate-500">
                                  @{ev.usuario_login} ·{' '}
                                  <span className="uppercase font-semibold text-[#00237D]">
                                    {ev.usuario_perfil}
                                  </span>
                                </div>
                                <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                                  {new Date(ev.data_registro).toLocaleString('pt-BR')}
                                </div>
                              </div>
                            </div>
                          );
                        })}

                      {(!reqDetails?.historico || reqDetails.historico.length === 0) && (
                        <div className="py-8 text-center text-xs text-slate-400 bg-slate-50 rounded-lg border border-slate-200">
                          Nenhum evento de histórico registrado para esta requisição.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Ações do Almoxarife no Rodapé */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {/* 4.1: Impressão padrão limpa (visível a todos os usuários) */}
                <button
                  type="button"
                  onClick={() => handleEmitirPdfRequisicao(selectedReq, 'print', reqDetails, false)}
                  className="px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 font-semibold rounded text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer uppercase tracking-wide"
                  title="Imprimir Requisição (Padrão Limpo sem Histórico)"
                >
                  <Printer className="w-4 h-4 text-slate-600" />
                  <span>IMPRIMIR</span>
                </button>

                {/* 4.2: Impressão com histórico (visível APENAS para admin e almoxarife) */}
                {isAlmoxarifeOrAdmin && (
                  <button
                    type="button"
                    onClick={() => handleEmitirPdfRequisicao(selectedReq, 'print', reqDetails, true)}
                    className="px-3.5 py-2 bg-[#00237D] hover:bg-[#001a5e] text-white font-semibold rounded text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer uppercase tracking-wide"
                    title="Imprimir com Trilha de Auditoria e Log Cronológico Completo"
                  >
                    <FileText className="w-4 h-4 text-blue-200" />
                    <span>IMPRIMIR COM HISTÓRICO</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleEmitirPdfRequisicao(selectedReq, 'download', reqDetails, false)}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-teal-50 text-teal-800 border border-slate-200 font-semibold rounded text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer uppercase tracking-wide"
                  title="Baixar Arquivo PDF da Requisição"
                >
                  <Download className="w-4 h-4 text-teal-700" />
                  <span>BAIXAR PDF</span>
                </button>
              </div>

              <div className="flex items-center gap-3">
                {isAlmoxarifeOrAdmin && selectedReq.status === 'pendente' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsRejectModalOpen(true)}
                      disabled={isProcessing}
                      className="bg-rose-600 hover:bg-rose-700 text-white font-medium px-4 py-2 rounded text-xs flex items-center gap-1.5 transition-all shadow uppercase tracking-wide cursor-pointer disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>REJEITAR TUDO</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleAprovar}
                      disabled={isProcessing}
                      className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-medium px-5 py-2 rounded text-xs flex items-center gap-1.5 transition-all shadow uppercase tracking-wide cursor-pointer disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>
                        {isProcessing
                          ? 'REGISTRANDO AUDITORIA...'
                          : (() => {
                              const vals = Object.values(itemDecisoes);
                              const aprov = vals.filter((v) => v.decisao === 'aprovado').length;
                              const neg = vals.filter((v) => v.decisao === 'negado').length;
                              if (vals.length > 0 && neg > 0 && aprov > 0) {
                                return `CONCLUIR (${aprov} APROV. / ${neg} NEG.)`;
                              }
                              if (vals.length > 0 && aprov === 0 && neg > 0) {
                                return `CONFIRMAR NEGAÇÃO DOS ITENS (${neg})`;
                              }
                              return 'APROVAR E ATENDER (BAIXA)';
                            })()}
                      </span>
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => setSelectedReq(null)}
                  className="bg-teal-600 hover:bg-teal-700 text-white font-medium px-4 py-2 rounded text-xs flex items-center gap-1.5 transition-all shadow uppercase tracking-wide cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>FECHAR</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Rejeição de Requisição com parecer obrigatório */}
      {isRejectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-lg overflow-hidden p-6 space-y-4">
            <div className="flex items-center gap-2 text-rose-700 font-bold text-base">
              <AlertTriangle className="w-5 h-5" />
              <span>Justificativa Obrigatória de Rejeição</span>
            </div>

            <p className="text-xs text-slate-600">
              Conforme as diretrizes hospitalares de auditoria, selecione o motivo padrão e adicione observações complementares se necessário.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Motivo da Negação / Rejeição *
                </label>
                <select
                  value={motivoRejeicaoCurto}
                  onChange={(e) => setMotivoRejeicaoCurto(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-rose-300 text-rose-950 font-semibold rounded text-xs focus:border-rose-500 shadow-xs"
                >
                  {MOTIVOS_NEGACAO_CURTA.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Observação Complementar (Opcional)
                </label>
                <textarea
                  rows={3}
                  value={motivoRejeicao}
                  onChange={(e) => setMotivoRejeicao(e.target.value)}
                  placeholder="Observação ou esclarecimento técnico adicional para o setor..."
                  className="w-full px-3 py-2 bg-[#f1f3f5] border border-slate-300 rounded text-xs text-slate-800 focus:bg-white focus:border-rose-500 shadow-inner"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsRejectModalOpen(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded text-xs font-semibold cursor-pointer"
              >
                CANCELAR
              </button>

              <button
                type="button"
                onClick={handleRejeitar}
                disabled={isProcessing}
                className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded text-xs font-bold uppercase tracking-wider disabled:opacity-50 cursor-pointer"
              >
                {isProcessing ? 'CONFIRMANDO...' : 'CONFIRMAR REJEIÇÃO'}
              </button>
            </div>
          </div>
        </div>
      )}

      <PdfPrintModal
        pdfDoc={pdfPreviewDoc}
        onClose={() => setPdfPreviewDoc(null)}
      />

      <ConfirmDeleteModal
        isOpen={!!deletingRequisicao}
        title="Excluir Requisição de Materiais"
        entityCode={deletingRequisicao?.numero_requisicao}
        entityName={deletingRequisicao ? `${deletingRequisicao.centro_custo_nome || ''} (${deletingRequisicao.solicitante_nome || ''})` : ''}
        description="Esta ação removerá a requisição e seus respectivos itens do sistema."
        isProcessing={isProcessing}
        onConfirm={handleConfirmDeleteRequisicao}
        onClose={() => setDeletingRequisicao(null)}
      />
    </div>
  );
};
