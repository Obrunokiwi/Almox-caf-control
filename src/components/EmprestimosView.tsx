import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Building2,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  ArrowDownLeft,
  ArrowUpRight,
  RotateCcw,
  Printer,
  FileText,
  Trash2,
  Save,
  X,
  Package,
  Handshake,
} from 'lucide-react';
import type {
  Emprestimo,
  EmprestimoInstitucional,
  Produto,
  Fornecedor,
  CentroCusto,
  Usuario,
  EmpresaUnidade,
} from '../types/index.ts';
import { useToast } from '../context/ToastContext.tsx';
import { HelpFloatingModal } from './HelpFloatingModal.tsx';
import { SearchableSelect, type SearchableOption } from './SearchableSelect.tsx';
import { getAuthHeaders } from '../utils/apiUtils.ts';

interface EmprestimosViewProps {
  emprestimos?: Emprestimo[];
  emprestimosInstitucionais?: EmprestimoInstitucional[];
  produtos: Produto[];
  fornecedores?: Fornecedor[];
  centrosCusto?: CentroCusto[];
  usuarios?: Usuario[];
  currentUser: Usuario | null;
  activeUnidade?: EmpresaUnidade | null;
  onRefresh: () => void;
  isCreateModalOpen?: boolean;
  setIsCreateModalOpen?: (open: boolean) => void;
  onVoltar?: () => void;
  onNavigate?: (tab: string) => void;
}

interface DraftItemEmprestimo {
  tempId: string;
  produto_id: number;
  lote_id: number;
  numero_lote: string;
  data_validade: string;
  quantidade: number;
}

export const EmprestimosView: React.FC<EmprestimosViewProps> = ({
  emprestimosInstitucionais: propLoans,
  produtos,
  fornecedores: propFornecedores = [],
  currentUser,
  activeUnidade,
  onRefresh,
  isCreateModalOpen = false,
  onVoltar,
  onNavigate,
}) => {
  const [loans, setLoans] = useState<EmprestimoInstitucional[]>(propLoans || []);
  const [listaEntidades, setListaEntidades] = useState<Fornecedor[]>(propFornecedores);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Filtros
  const [abaFiltro, setAbaFiltro] = useState<'todos' | 'pendentes' | 'recebidos' | 'concedidos' | 'quitados'>('todos');
  const [busca, setBusca] = useState<string>('');
  const [isFilterOpen, setIsFilterOpen] = useState<boolean>(false);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (abaFiltro !== 'todos') count++;
    if (busca.trim() !== '') count++;
    return count;
  }, [abaFiltro, busca]);

  // Formulário de Novo Empréstimo Institucional (Cenário A ou Cenário B)
  const [isFormOpen, setIsFormOpen] = useState<boolean>(isCreateModalOpen);
  const [formTipo, setFormTipo] = useState<'recebido' | 'concedido'>('recebido');
  const [formEntidadeId, setFormEntidadeId] = useState<number>(0);
  const [formResponsavelParceiro, setFormResponsavelParceiro] = useState<string>('');
  const [formObservacao, setFormObservacao] = useState<string>('Empréstimo emergencial autorizado pela diretoria');
  const [draftItens, setDraftItens] = useState<DraftItemEmprestimo[]>([]);

  // Campos de adição rápida de item na tabela do empréstimo
  const [itemProdId, setItemProdId] = useState<number>(produtos[0]?.id || 0);
  const [itemLoteId, setItemLoteId] = useState<number>(0);
  const [itemNumeroLote, setItemNumeroLote] = useState<string>('LT-2026');
  const [itemDataValidade, setItemDataValidade] = useState<string>('2027-12-31');
  const [itemQuantidade, setItemQuantidade] = useState<number>(10);

  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Modal de Devolução / Quitação
  const [devolucaoLoan, setDevolucaoLoan] = useState<EmprestimoInstitucional | null>(null);
  const [devolucaoRespParceiro, setDevolucaoRespParceiro] = useState<string>('');
  const [devolucaoObs, setDevolucaoObs] = useState<string>('');
  const [devolucaoQuantidades, setDevolucaoQuantidades] = useState<Record<number, number>>({});
  const [devolucaoError, setDevolucaoError] = useState<string | null>(null);

  // Modal de Ficha de Empréstimo / Devolução para Impressão
  const [fichaImpressao, setFichaImpressao] = useState<{
    loan: EmprestimoInstitucional;
    modoFicha: 'emprestimo' | 'devolucao';
  } | null>(null);

  const { toast } = useToast();
  const canManage = currentUser && (currentUser.perfil === 'admin' || currentUser.perfil === 'almoxarife');

  const fetchInstitucionalData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [resLoans, resForn] = await Promise.all([
        fetch('/api/emprestimos-institucionais', { headers: getAuthHeaders() }),
        fetch('/api/fornecedores', { headers: getAuthHeaders() }),
      ]);
      if (resLoans.ok) {
        const dataLoans = await resLoans.json();
        setLoans(dataLoans);
      }
      if (resForn.ok) {
        const dataForn = await resForn.json();
        setListaEntidades(dataForn);
      }
    } catch (err) {
      console.error('Erro ao carregar empréstimos institucionais:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInstitucionalData();
  }, [fetchInstitucionalData]);

  useEffect(() => {
    if (propFornecedores && propFornecedores.length > 0) {
      setListaEntidades(propFornecedores);
    }
  }, [propFornecedores]);

  const entidadesAtivas = useMemo(
    () => listaEntidades.filter((f) => f.ativo === 1),
    [listaEntidades]
  );

  const prodSelecionadoItem = useMemo(
    () => produtos.find((p) => p.id === Number(itemProdId)) || null,
    [produtos, itemProdId]
  );

  // Apenas lotes válidos (não vencidos) para empréstimo concedido
  const lotesValidosItem = useMemo(() => {
    if (!prodSelecionadoItem?.lotes) return [];
    return prodSelecionadoItem.lotes.filter((l) => l.quantidade_atual > 0);
  }, [prodSelecionadoItem]);

  const entidadeOptions: SearchableOption[] = useMemo(() => {
    return [
      { value: 0, label: 'Selecione a Entidade Parceira / Hospital...' },
      ...entidadesAtivas.map((f) => ({
        value: f.id,
        label: `${f.codigo} - ${f.nome_fantasia || f.razao_social} ${f.tipo_entidade === 'entidade_parceira' ? '(Hospital/Entidade Parceira)' : '(Fornecedor)'}`,
        secondaryLabel: f.cnpj || undefined,
      })),
    ];
  }, [entidadesAtivas]);

  const produtoOptions: SearchableOption[] = useMemo(() => {
    return produtos.map((p) => ({
      value: p.id,
      label: `[${p.codigo}] ${p.nome} (${p.unidade_medida}) | Saldo: ${p.quantidade_atual}`,
      secondaryLabel: `Código: ${p.codigo} | Grupo: ${p.grupo_nome || ''}`,
    }));
  }, [produtos]);

  const loteOptions: SearchableOption[] = useMemo(() => {
    return [
      { value: 0, label: 'Automático FEFO (Lote válido mais próximo)' },
      ...lotesValidosItem.map((lt) => ({
        value: lt.id,
        label: `Lote: ${lt.numero_lote} | Val: ${lt.data_validade ? lt.data_validade.split('-').reverse().join('/') : 'S/V'} | Saldo: ${lt.quantidade_atual}${lt.status_validade === 'vencido' ? ' (BLOQUEADO - VENCIDO)' : ''}`,
        disabled: lt.status_validade === 'vencido',
      })),
    ];
  }, [lotesValidosItem]);

  const handleAbrirNovoEmprestimo = (tipo: 'recebido' | 'concedido') => {
    setFormTipo(tipo);
    // Prioriza selecionar uma entidade parceira se houver
    const parceira = entidadesAtivas.find((e) => e.tipo_entidade === 'entidade_parceira') || entidadesAtivas[0];
    setFormEntidadeId(parceira?.id || 0);
    setFormResponsavelParceiro(parceira?.contato_responsavel || '');
    setFormObservacao(
      tipo === 'recebido'
        ? 'Empréstimo emergencial recebido de unidade parceira autorizado pela diretoria'
        : 'Empréstimo institucional concedido a unidade parceira autorizado pela diretoria'
    );
    setDraftItens([]);

    const defaultProd = produtos[0];
    setItemProdId(defaultProd?.id || 0);
    const loteValido = (defaultProd?.lotes || []).find((l) => l.quantidade_atual > 0 && l.status_validade !== 'vencido');
    setItemLoteId(loteValido?.id || 0);
    setItemNumeroLote(tipo === 'recebido' ? `LT-${Math.floor(1000 + Math.random() * 9000)}` : loteValido?.numero_lote || '');
    setItemDataValidade(tipo === 'recebido' ? '2027-12-31' : loteValido?.data_validade || '2027-12-31');
    setItemQuantidade(10);
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleAdicionarItemDraft = () => {
    if (!itemProdId || itemQuantidade <= 0) {
      toast.error('Item Inválido', 'Selecione um produto e informe quantidade maior que zero.');
      return;
    }

    const prod = produtos.find((p) => p.id === Number(itemProdId));
    if (!prod) return;

    if (formTipo === 'concedido') {
      if (prod.quantidade_atual < itemQuantidade) {
        toast.error(
          'Estoque Insuficiente',
          `O produto "${prod.codigo} - ${prod.nome}" possui saldo de ${prod.quantidade_atual} ${prod.unidade_medida}.`
        );
        return;
      }

      if (itemLoteId) {
        const loteObj = lotesValidosItem.find((l) => l.id === Number(itemLoteId));
        if (loteObj?.status_validade === 'vencido') {
          toast.error(
            'Bloqueio de Lote Vencido',
            `O lote "${loteObj.numero_lote}" está VENCIDO e bloqueado para empréstimos ou consumo.`
          );
          return;
        }
        if (loteObj && loteObj.quantidade_atual < itemQuantidade) {
          toast.error(
            'Saldo do Lote Insuficiente',
            `O lote "${loteObj.numero_lote}" possui apenas ${loteObj.quantidade_atual} ${prod.unidade_medida}.`
          );
          return;
        }
      }
    } else {
      if (!itemNumeroLote.trim() || !itemDataValidade.trim()) {
        toast.error('Lote e Validade Obrigatórios', 'Informe o Lote e a Data de Validade do material recebido por empréstimo.');
        return;
      }
    }

    const loteObj = lotesValidosItem.find((l) => l.id === Number(itemLoteId));

    setDraftItens((prev) => [
      ...prev,
      {
        tempId: `${Date.now()}-${Math.random()}`,
        produto_id: prod.id,
        lote_id: formTipo === 'concedido' ? Number(itemLoteId) || 0 : 0,
        numero_lote:
          formTipo === 'concedido'
            ? loteObj?.numero_lote || itemNumeroLote.trim().toUpperCase() || 'FEFO'
            : itemNumeroLote.trim().toUpperCase(),
        data_validade:
          formTipo === 'concedido'
            ? loteObj?.data_validade || itemDataValidade
            : itemDataValidade,
        quantidade: Number(itemQuantidade),
      },
    ]);
  };

  const handleRemoverItemDraft = (tempId: string) => {
    setDraftItens((prev) => prev.filter((i) => i.tempId !== tempId));
  };

  const handleSalvarEmprestimo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formEntidadeId) {
      const msg = 'Selecione o Hospital / Entidade Parceira (ou Fornecedor) para registrar a operação.';
      setFormError(msg);
      toast.error('Entidade Obrigatória', msg);
      return;
    }

    // Se o usuário não clicou em "+ Incluir Item na Ficha", mas preencheu o produto atual, inclui automaticamente
    let itensFinais = [...draftItens];
    if (itensFinais.length === 0 && itemProdId && itemQuantidade > 0) {
      const loteObj = lotesValidosItem.find((l) => l.id === Number(itemLoteId));
      itensFinais = [
        {
          tempId: 'auto-1',
          produto_id: Number(itemProdId),
          lote_id: formTipo === 'concedido' ? Number(itemLoteId) || 0 : 0,
          numero_lote:
            formTipo === 'concedido'
              ? loteObj?.numero_lote || itemNumeroLote.trim().toUpperCase()
              : itemNumeroLote.trim().toUpperCase(),
          data_validade:
            formTipo === 'concedido'
              ? loteObj?.data_validade || itemDataValidade
              : itemDataValidade,
          quantidade: Number(itemQuantidade),
        },
      ];
    }

    if (itensFinais.length === 0) {
      const msg = 'Adicione pelo menos 1 produto à ficha de empréstimo institucional.';
      setFormError(msg);
      toast.error('Itens Obrigatórios', msg);
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const res = await fetch('/api/emprestimos-institucionais', {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          tipo: formTipo,
          entidade_id: formEntidadeId,
          responsavel_entidade_parceira: formResponsavelParceiro.trim() || null,
          observacao: formObservacao.trim() || null,
          itens: itensFinais,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao registrar empréstimo institucional.');
      }

      toast.success(
        formTipo === 'recebido'
          ? 'Entrada por Empréstimo Recebido Registrada'
          : 'Saída por Empréstimo Concedido Registrada',
        data.message
      );

      setIsFormOpen(false);
      await fetchInstitucionalData();
      onRefresh();

      if (data.data) {
        setFichaImpressao({
          loan: data.data,
          modoFicha: 'emprestimo',
        });
      }
    } catch (err: any) {
      const msg = err.message || 'Falha ao salvar empréstimo institucional.';
      setFormError(msg);
      toast.error('Erro na Operação', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAbrirModalDevolucao = (loan: EmprestimoInstitucional) => {
    setDevolucaoLoan(loan);
    setDevolucaoRespParceiro(loan.responsavel_entidade_nome || '');
    setDevolucaoObs(
      loan.tipo === 'recebido'
        ? 'Devolução de Empréstimo a Terceiros (Quitação de saldo emprestado)'
        : 'Recebimento de Devolução de Empréstimo concedido à entidade parceira'
    );
    const mapQtd: Record<number, number> = {};
    for (const it of loan.itens || []) {
      const pendente = Math.max(0, Number(it.quantidade) - Number(it.quantidade_devolvida || 0));
      mapQtd[it.id] = pendente;
    }
    setDevolucaoQuantidades(mapQtd);
    setDevolucaoError(null);
  };

  const handleConfirmarDevolucao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!devolucaoLoan) return;

    setIsSubmitting(true);
    setDevolucaoError(null);

    try {
      const itens_devolucao = (devolucaoLoan.itens || [])
        .map((it) => ({
          item_id: it.id,
          quantidade: Number(devolucaoQuantidades[it.id] || 0),
          numero_lote: it.numero_lote,
          data_validade: it.data_validade,
          lote_id: it.lote_id,
        }))
        .filter((d) => d.quantidade > 0);

      const res = await fetch(`/api/emprestimos-institucionais/${devolucaoLoan.id}/devolver`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          responsavel_entidade_parceira: devolucaoRespParceiro.trim() || null,
          observacao: devolucaoObs.trim() || null,
          itens_devolucao,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao registrar devolução de empréstimo.');
      }

      toast.success(
        devolucaoLoan.tipo === 'recebido'
          ? 'Saída Diversa: Devolução de Empréstimo a Terceiros'
          : 'Entrada Diversa: Recebimento de Devolução de Empréstimo',
        data.message
      );

      setDevolucaoLoan(null);
      await fetchInstitucionalData();
      onRefresh();

      if (data.data) {
        setFichaImpressao({
          loan: data.data,
          modoFicha: 'devolucao',
        });
      }
    } catch (err: any) {
      const msg = err.message || 'Erro ao processar devolução.';
      setDevolucaoError(msg);
      toast.error('Erro na Devolução', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtragem
  const filteredLoans = useMemo(() => {
    return loans.filter((l) => {
      if (abaFiltro === 'pendentes' && l.status !== 'pendente_devolucao') return false;
      if (abaFiltro === 'recebidos' && l.tipo !== 'recebido') return false;
      if (abaFiltro === 'concedidos' && l.tipo !== 'concedido') return false;
      if (abaFiltro === 'quitados' && l.status !== 'quitado') return false;

      if (busca.trim()) {
        const q = busca.trim().toLowerCase();
        const matchDoc = l.numero_documento.toLowerCase().includes(q);
        const matchEnt =
          (l.entidade_nome || '').toLowerCase().includes(q) ||
          (l.entidade_nome_fantasia || '').toLowerCase().includes(q);
        const matchItem = (l.itens || []).some(
          (i) =>
            (i.produto_codigo || '').toLowerCase().includes(q) ||
            (i.produto_nome || '').toLowerCase().includes(q) ||
            (i.numero_lote || '').toLowerCase().includes(q)
        );
        if (!matchDoc && !matchEnt && !matchItem) return false;
      }
      return true;
    });
  }, [loans, abaFiltro, busca]);

  // Indicadores de Empréstimo Institucional
  const kpis = useMemo(() => {
    const dividasRecebidos = loans.filter((l) => l.tipo === 'recebido' && l.status === 'pendente_devolucao').length;
    const creditosConcedidos = loans.filter((l) => l.tipo === 'concedido' && l.status === 'pendente_devolucao').length;
    const totalQuitados = loans.filter((l) => l.status === 'quitado').length;
    return { dividasRecebidos, creditosConcedidos, totalQuitados };
  }, [loans]);

  const nomeNossaUnidade =
    activeUnidade?.nome || 'Multihospital / Almoxarifado Central';

  return (
    <div className="space-y-6">
      {/* Cabeçalho Compacto */}
      <div className="bg-white px-4 py-3 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 text-indigo-800 rounded-lg">
            <Handshake className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800 tracking-tight">
              Empréstimos Institucionais entre Entidades / Hospitais
            </h1>
            <p className="text-xs text-slate-500">
              Controle de Empréstimos Recebidos e Concedidos com Ficha Oficial Assinada
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <HelpFloatingModal
            title="Ajuda & Fluxo — Empréstimos Institucionais entre Entidades"
            subtitle="Operações de Socorro / Troca entre Unidades e Hospitais Parceiros"
            onNavigate={onNavigate}
            sections={[
              {
                title: 'Cenário A — Pegamos Emprestado de Outra Entidade',
                badge: 'Empréstimo Recebido',
                tone: 'amber',
                description:
                  '1) Selecione o Hospital/Entidade Parceira; 2) Registre uma Entrada por Empréstimo Recebido; 3) O produto entra imediatamente no nosso saldo disponível e gera uma dívida em quantidade com aquela entidade; 4) Ao devolver, clique em "Devolver / Quitar" para gerar a Saída Diversa: "Devolução de Empréstimo a Terceiros".',
              },
              {
                title: 'Cenário B — Emprestamos para Outra Entidade',
                badge: 'Empréstimo Concedido',
                tone: 'indigo',
                description:
                  '1) Registre um Empréstimo Concedido a Terceiros para a entidade parceira (abatendo nosso estoque); 2) Quando a entidade parceira devolver o material, clique em "Receber Retorno" para gerar a Entrada Diversa: "Recebimento de Devolução de Empréstimo".',
              },
              {
                title: 'Ficha Oficial para Impressão com Assinaturas',
                badge: 'Documento Auditável',
                tone: 'teal',
                description:
                  'Cada operação gera uma Ficha de Empréstimo / Devolução pronta para impressão com código, descrição, lote, quantidade, observações e campos para assinatura física do Responsável pelo Almoxarifado e do Responsável da Entidade Parceira.',
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

      {/* Cards de Cenário A e Cenário B */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
              Cenário A • Pegamos Emprestado
            </span>
            <h3 className="text-sm font-bold text-slate-800 mt-1.5">
              Dívidas de Estoque com Outras Entidades
            </h3>
            <p className="text-[11px] text-slate-500">
              Entrada por Empréstimo Recebido pendente de devolução
            </p>
          </div>
          <div className="text-3xl font-black text-amber-700 font-mono">{kpis.dividasRecebidos}</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-indigo-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
              Cenário B • Emprestamos a Terceiros
            </span>
            <h3 className="text-sm font-bold text-slate-800 mt-1.5">
              Saldos a Receber de Entidades Parceiras
            </h3>
            <p className="text-[11px] text-slate-500">
              Empréstimo Concedido aguardando retorno da parceira
            </p>
          </div>
          <div className="text-3xl font-black text-indigo-700 font-mono">{kpis.creditosConcedidos}</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              Ciclo Concluído
            </span>
            <h3 className="text-sm font-bold text-slate-800 mt-1.5">
              Empréstimos Quitados / Devolvidos
            </h3>
            <p className="text-[11px] text-slate-500">
              Operações com devolução integral auditada
            </p>
          </div>
          <div className="text-3xl font-black text-emerald-700 font-mono">{kpis.totalQuitados}</div>
        </div>
      </div>

      {/* Formulário de Registro de Empréstimo Institucional */}
      {isFormOpen && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-md overflow-hidden animate-fadeIn">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div>
              <span
                className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                  formTipo === 'recebido'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                }`}
              >
                {formTipo === 'recebido'
                  ? 'Cenário A • Entrada Diversa: "Entrada por Empréstimo Recebido"'
                  : 'Cenário B • Saída Diversa: "Empréstimo Concedido a Terceiros"'}
              </span>
              <h2 className="text-base font-bold text-slate-800 mt-1">
                {formTipo === 'recebido'
                  ? 'Pegamos Emprestado de Outra Entidade (Soma ao nosso estoque e gera conta a pagar em quantidade)'
                  : 'Emprestamos para Outra Entidade Parceira (Abate do nosso estoque e gera crédito a receber)'}
              </h2>
            </div>

            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer"
            >
              <X className="w-4 h-4" />
              <span>Fechar</span>
            </button>
          </div>

          {formError && (
            <div className="mx-6 mt-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>{formError}</div>
            </div>
          )}

          <form onSubmit={handleSalvarEmprestimo} className="p-6 space-y-6">
            {/* Seleção de Cenário e Entidade Parceira */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Modalidade da Operação *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFormTipo('recebido');
                      setDraftItens([]);
                      setFormError(null);
                    }}
                    className={`py-2 px-2.5 rounded text-xs font-bold uppercase tracking-wide border transition-all cursor-pointer ${
                      formTipo === 'recebido'
                        ? 'bg-emerald-600 text-white border-emerald-700 shadow'
                        : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
                    }`}
                  >
                    Pegamos Emprestado (+)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFormTipo('concedido');
                      setDraftItens([]);
                      setFormError(null);
                    }}
                    className={`py-2 px-2.5 rounded text-xs font-bold uppercase tracking-wide border transition-all cursor-pointer ${
                      formTipo === 'concedido'
                        ? 'bg-indigo-600 text-white border-indigo-700 shadow'
                        : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
                    }`}
                  >
                    Emprestamos (-)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Hospital / Entidade Parceira (ou Fornecedor) *
                </label>
                <SearchableSelect
                  options={entidadeOptions}
                  value={formEntidadeId}
                  onChange={(val) => {
                    const id = Number(val);
                    setFormEntidadeId(id);
                    const ent = entidadesAtivas.find((f) => f.id === id);
                    if (ent?.contato_responsavel) {
                      setFormResponsavelParceiro(ent.contato_responsavel);
                    }
                  }}
                  placeholder="Selecione a Entidade..."
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Responsável da Entidade Parceira (Portador / Recebedor)
                </label>
                <input
                  type="text"
                  value={formResponsavelParceiro}
                  onChange={(e) => setFormResponsavelParceiro(e.target.value)}
                  placeholder="Nome de quem entregou ou retirou pela entidade parceira..."
                  className="w-full px-3 py-2 bg-[#f1f3f5] border border-slate-300 rounded text-xs text-slate-800 focus:bg-white focus:border-teal-500 shadow-inner"
                />
              </div>
            </div>

            {/* Inclusão de Produtos no Termo */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-teal-700" />
                  <span>Itens do Termo de Empréstimo Institucional (Código Único de Estoque)</span>
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                <div className="md:col-span-4">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Produto (Código Único) *
                  </label>
                  <SearchableSelect
                    options={produtoOptions}
                    value={itemProdId}
                    onChange={(val) => {
                      const nextId = Number(val);
                      setItemProdId(nextId);
                      const pObj = produtos.find((p) => p.id === nextId);
                      const validos = (pObj?.lotes || []).filter(
                        (l) => l.quantidade_atual > 0 && l.status_validade !== 'vencido'
                      );
                      setItemLoteId(validos[0]?.id || 0);
                      if (formTipo === 'concedido' && validos[0]) {
                        setItemNumeroLote(validos[0].numero_lote);
                        setItemDataValidade(validos[0].data_validade || '');
                      }
                    }}
                    placeholder="Selecione o Produto..."
                  />
                </div>

                {formTipo === 'concedido' ? (
                  <div className="md:col-span-4">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Lote em Estoque (Bloqueio Automático de Vencidos) *
                    </label>
                    <SearchableSelect
                      options={loteOptions}
                      value={itemLoteId}
                      onChange={(val) => setItemLoteId(Number(val))}
                      placeholder="Selecione o Lote..."
                    />
                  </div>
                ) : (
                  <>
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Nº Lote Recebido *
                      </label>
                      <input
                        type="text"
                        value={itemNumeroLote}
                        onChange={(e) => setItemNumeroLote(e.target.value)}
                        placeholder="ex: LT-8821"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded text-xs text-slate-800 font-mono"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        Validade *
                      </label>
                      <input
                        type="date"
                        value={itemDataValidade}
                        onChange={(e) => setItemDataValidade(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded text-xs text-slate-800"
                      />
                    </div>
                  </>
                )}

                <div className="md:col-span-2">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Quantidade ({prodSelecionadoItem?.unidade_medida || 'UN'}) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={itemQuantidade}
                    onChange={(e) => setItemQuantidade(Math.max(1, Number(e.target.value)))}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded text-xs text-slate-800 font-mono"
                  />
                </div>

                <div className="md:col-span-2">
                  <button
                    type="button"
                    onClick={handleAdicionarItemDraft}
                    className="w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 px-3 rounded text-xs flex items-center justify-center gap-1 uppercase tracking-wider shadow cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Incluir Item</span>
                  </button>
                </div>
              </div>

              {draftItens.length > 0 && (
                <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-bold uppercase">
                      <tr>
                        <th className="py-2 px-3">Código</th>
                        <th className="py-2 px-3">Descrição do Produto</th>
                        <th className="py-2 px-3 text-center">Lote</th>
                        <th className="py-2 px-3 text-center">Validade</th>
                        <th className="py-2 px-3 text-right">Quantidade</th>
                        <th className="py-2 px-3 text-center">UN</th>
                        <th className="py-2 px-3 text-right">Remover</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {draftItens.map((di) => {
                        const p = produtos.find((pr) => pr.id === di.produto_id);
                        return (
                          <tr key={di.tempId}>
                            <td className="py-2 px-3 font-mono font-bold text-teal-800">{p?.codigo}</td>
                            <td className="py-2 px-3 font-medium text-slate-800">{p?.nome}</td>
                            <td className="py-2 px-3 text-center font-mono">{di.numero_lote || 'FEFO'}</td>
                            <td className="py-2 px-3 text-center font-mono">
                              {di.data_validade ? di.data_validade.split('-').reverse().join('/') : '—'}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold">{di.quantidade}</td>
                            <td className="py-2 px-3 text-center font-bold text-slate-600">{p?.unidade_medida}</td>
                            <td className="py-2 px-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleRemoverItemDraft(di.tempId)}
                                className="p-1 text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                Observações do Termo de Empréstimo Institucional
              </label>
              <textarea
                rows={2}
                value={formObservacao}
                onChange={(e) => setFormObservacao(e.target.value)}
                placeholder="Ex: Empréstimo emergencial autorizado pela diretoria..."
                className="w-full px-3 py-2 bg-[#f1f3f5] border border-slate-300 rounded text-xs text-slate-800 focus:bg-white focus:border-teal-500 shadow-inner"
              />
            </div>

            <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="px-4 py-2 rounded text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className={`px-5 py-2 rounded text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5 shadow cursor-pointer disabled:opacity-50 ${
                  formTipo === 'recebido'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                <Save className="w-4 h-4" />
                <span>
                  {isSubmitting
                    ? 'Registrando...'
                    : formTipo === 'recebido'
                    ? 'Confirmar Entrada por Empréstimo Recebido e Gerar Ficha'
                    : 'Confirmar Empréstimo Concedido e Gerar Ficha p/ Assinatura'}
                </span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Barra de Ações Superior */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
          <Handshake className="w-4 h-4 text-indigo-700" />
          <span>Operações e Fichas de Empréstimo</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className={`px-3.5 py-2 text-xs font-bold uppercase tracking-wider rounded-lg flex items-center gap-1.5 shadow-xs transition-all cursor-pointer ${
              isFilterOpen || activeFiltersCount > 0
                ? 'bg-indigo-700 text-white'
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

          {canManage && (
            <>
              <button
                type="button"
                onClick={() => handleAbrirNovoEmprestimo('recebido')}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3.5 py-2 rounded-lg text-xs flex items-center gap-1.5 shadow cursor-pointer uppercase tracking-wider"
              >
                <ArrowDownLeft className="w-4 h-4" />
                <span>+ Pegamos Emprestado (Recebido)</span>
              </button>
              <button
                type="button"
                onClick={() => handleAbrirNovoEmprestimo('concedido')}
                className="bg-[#00237D] hover:bg-blue-900 text-white font-bold px-3.5 py-2 rounded-lg text-xs flex items-center gap-1.5 shadow cursor-pointer uppercase tracking-wider"
              >
                <ArrowUpRight className="w-4 h-4" />
                <span>+ Emprestamos p/ Entidade (Concedido)</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Painel de Filtros Retrátil */}
      {isFilterOpen && (
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <span className="text-xs font-bold uppercase text-slate-700 tracking-wider flex items-center gap-1.5">
              <Filter className="w-4 h-4 text-indigo-700" />
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

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {[
                { id: 'todos', label: 'Todas as Operações' },
                { id: 'pendentes', label: 'Pendentes de Devolução' },
                { id: 'recebidos', label: 'Cenário A: Pegamos Emprestado' },
                { id: 'concedidos', label: 'Cenário B: Emprestamos a Terceiros' },
                { id: 'quitados', label: 'Quitados / Devolvidos' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setAbaFiltro(t.id as any)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                    abaFiltro === t.id
                      ? 'bg-white text-slate-900 font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Pesquisar por número do documento, hospital/entidade parceira, código de produto ou lote..."
                className="w-full pl-9 pr-4 py-2 bg-[#f1f3f5] border border-slate-300 rounded-lg text-xs text-slate-800 focus:bg-white focus:border-teal-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                setAbaFiltro('todos');
                setBusca('');
              }}
              className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition-colors cursor-pointer"
            >
              LIMPAR FILTROS
            </button>
            <button
              type="button"
              onClick={() => setIsFilterOpen(false)}
              className="px-4 py-1.5 bg-indigo-700 hover:bg-indigo-800 text-white font-bold text-xs rounded-lg shadow-xs transition-colors cursor-pointer uppercase tracking-wider"
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

      {/* Tabela de Empréstimos Institucionais */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Documento</th>
                <th className="py-3 px-4">Data / Hora</th>
                <th className="py-3 px-4">Natureza / Cenário</th>
                <th className="py-3 px-4">Hospital / Entidade Parceira</th>
                <th className="py-3 px-4">Itens (Código Único, Lote e Quantidade)</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Ficha Impressa & Devolução</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    Carregando empréstimos institucionais...
                  </td>
                </tr>
              ) : filteredLoans.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">
                    Nenhuma operação de empréstimo institucional encontrada. Utilize os botões acima para registrar um Empréstimo Recebido ou Concedido.
                  </td>
                </tr>
              ) : (
                filteredLoans.map((loan) => {
                  const isRecebido = loan.tipo === 'recebido';
                  const isPendente = loan.status === 'pendente_devolucao';

                  return (
                    <tr key={loan.id} className="odd:bg-white even:bg-slate-50/70 hover:bg-teal-50/30 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {loan.numero_documento}
                      </td>
                      <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                        {new Date(loan.data_operacao).toLocaleString('pt-BR', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </td>
                      <td className="py-3 px-4">
                        {isRecebido ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200 font-bold text-[10px] uppercase">
                            <ArrowDownLeft className="w-3 h-3 text-amber-700" />
                            <span>Recebido (Pegamos Emprestado)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 text-indigo-900 border border-indigo-200 font-bold text-[10px] uppercase">
                            <ArrowUpRight className="w-3 h-3 text-indigo-700" />
                            <span>Concedido (Emprestamos)</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-800">{loan.entidade_nome}</div>
                        <div className="text-[11px] text-slate-500">
                          Cód: {loan.entidade_codigo}
                          {loan.responsavel_entidade_nome ? ` • Resp: ${loan.responsavel_entidade_nome}` : ''}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="space-y-1">
                          {(loan.itens || []).map((it) => (
                            <div key={it.id} className="text-xs text-slate-800 flex items-center gap-1.5">
                              <span className="font-mono font-bold text-teal-800">[{it.produto_codigo}]</span>
                              <span className="font-medium">{it.produto_nome}</span>
                              <span className="text-slate-500 font-mono text-[11px]">
                                (Lote: {it.numero_lote || 'S/L'} | Qtd: <strong>{it.quantidade}</strong> {it.unidade_medida}
                                {Number(it.quantidade_devolvida) > 0
                                  ? ` | Devolvido: ${it.quantidade_devolvida}`
                                  : ''})
                              </span>
                            </div>
                          ))}
                        </div>
                        {loan.observacao && (
                          <div className="text-[11px] text-slate-500 italic mt-1">{loan.observacao}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {isPendente ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold text-[10px] uppercase">
                            <AlertTriangle className="w-3 h-3 text-amber-700" />
                            <span>Pendente Devolução</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 font-bold text-[10px] uppercase">
                            <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                            <span>Quitado / Devolvido</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setFichaImpressao({
                                loan,
                                modoFicha: loan.status === 'quitado' ? 'devolucao' : 'emprestimo',
                              })
                            }
                            className="px-2.5 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                            title="Visualizar e Imprimir Ficha com Assinaturas"
                          >
                            <Printer className="w-3.5 h-3.5 text-[#00237D]" />
                            <span>Ficha c/ Assinaturas</span>
                          </button>

                          {canManage && isPendente && (
                            <button
                              type="button"
                              onClick={() => handleAbrirModalDevolucao(loan)}
                              className={`px-2.5 py-1.5 rounded font-bold text-[11px] text-white inline-flex items-center gap-1 shadow-xs cursor-pointer ${
                                isRecebido
                                  ? 'bg-rose-600 hover:bg-rose-700'
                                  : 'bg-emerald-600 hover:bg-emerald-700'
                              }`}
                              title={
                                isRecebido
                                  ? 'Devolver material que pegamos emprestado (Gera Saída Diversa: Devolução de Empréstimo a Terceiros)'
                                  : 'Receber de volta material que emprestamos (Gera Entrada Diversa: Recebimento de Devolução de Empréstimo)'
                              }
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>
                                {isRecebido ? 'Devolver à Entidade' : 'Receber Devolução'}
                              </span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Devolução / Quitação de Empréstimo Institucional */}
      {devolucaoLoan && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest bg-teal-600 px-2 py-0.5 rounded">
                  {devolucaoLoan.tipo === 'recebido'
                    ? 'Saída Diversa: "Devolução de Empréstimo a Terceiros"'
                    : 'Entrada Diversa: "Recebimento de Devolução de Empréstimo"'}
                </span>
                <h3 className="text-base font-bold mt-1">
                  {devolucaoLoan.tipo === 'recebido'
                    ? `Devolver Empréstimo para ${devolucaoLoan.entidade_nome} (${devolucaoLoan.numero_documento})`
                    : `Receber Devolução de ${devolucaoLoan.entidade_nome} (${devolucaoLoan.numero_documento})`}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDevolucaoLoan(null)}
                className="text-slate-300 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmarDevolucao} className="p-6 space-y-4 text-xs">
              {devolucaoError && (
                <div className="p-3 rounded bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>{devolucaoError}</div>
                </div>
              )}

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-700">
                {devolucaoLoan.tipo === 'recebido' ? (
                  <p>
                    Ao confirmar, o sistema gerará automaticamente uma{' '}
                    <strong>Saída Diversa: &ldquo;Devolução de Empréstimo a Terceiros&rdquo;</strong>, abatendo o nosso
                    estoque e quitando a dívida em quantidade com <strong>{devolucaoLoan.entidade_nome}</strong>.
                  </p>
                ) : (
                  <p>
                    Ao confirmar, o sistema gerará automaticamente uma{' '}
                    <strong>Entrada Diversa: &ldquo;Recebimento de Devolução de Empréstimo&rdquo;</strong>, recompondo o
                    saldo do produto no nosso estoque.
                  </p>
                )}
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 font-bold uppercase text-slate-700">
                    <tr>
                      <th className="p-2.5">Produto (Cód. Único)</th>
                      <th className="p-2.5 text-center">Lote</th>
                      <th className="p-2.5 text-right">Pendente</th>
                      <th className="p-2.5 text-right">Qtd a Devolver Agora</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {(devolucaoLoan.itens || []).map((it) => {
                      const pendente = Math.max(0, Number(it.quantidade) - Number(it.quantidade_devolvida || 0));
                      return (
                        <tr key={it.id}>
                          <td className="p-2.5">
                            <span className="font-mono font-bold text-teal-800">[{it.produto_codigo}]</span>{' '}
                            <span className="font-medium">{it.produto_nome}</span>
                          </td>
                          <td className="p-2.5 text-center font-mono">{it.numero_lote || '—'}</td>
                          <td className="p-2.5 text-right font-mono font-bold">
                            {pendente} {it.unidade_medida}
                          </td>
                          <td className="p-2.5 text-right">
                            <input
                              type="number"
                              min="0"
                              max={pendente}
                              value={devolucaoQuantidades[it.id] ?? pendente}
                              onChange={(e) =>
                                setDevolucaoQuantidades((prev) => ({
                                  ...prev,
                                  [it.id]: Math.min(pendente, Math.max(0, Number(e.target.value))),
                                }))
                              }
                              className="w-24 px-2 py-1 border border-slate-300 rounded text-right font-mono font-bold"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                    Responsável da Entidade Parceira (Assinatura)
                  </label>
                  <input
                    type="text"
                    value={devolucaoRespParceiro}
                    onChange={(e) => setDevolucaoRespParceiro(e.target.value)}
                    placeholder="Nome do representante da entidade parceira..."
                    className="w-full px-3 py-2 border border-slate-300 rounded text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                    Observações da Devolução
                  </label>
                  <input
                    type="text"
                    value={devolucaoObs}
                    onChange={(e) => setDevolucaoObs(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded text-xs"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setDevolucaoLoan(null)}
                  className="px-4 py-2 rounded text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded text-xs font-bold uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700 text-white shadow cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Processando...' : 'Confirmar Devolução e Emitir Ficha'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: FICHA DE EMPRÉSTIMO / DEVOLUÇÃO PARA IMPRESSÃO COM 2 ASSINATURAS FÍSICAS */}
      {fichaImpressao && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full border border-slate-300 overflow-hidden my-6">
            {/* Barra de controle (oculta na impressão) */}
            <div className="px-6 py-3.5 bg-[#00237D] text-white flex items-center justify-between print:hidden">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-teal-300" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  Ficha Institucional de Empréstimo / Devolução entre Entidades
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shadow cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Imprimir Ficha</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFichaImpressao(null)}
                  className="p-1 text-blue-200 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Corpo da Ficha Institucional para Impressão */}
            <div className="p-8 space-y-6 text-slate-900 bg-white" id="ficha-emprestimo-institucional-print">
              {/* 1. Cabeçalho Institucional: Sistema de Almoxarifado, Data/Hora, Número do Documento */}
              <div className="border-b-2 border-slate-800 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    SISTEMA DE ALMOXARIFADO HOSPITALAR • CONTROLE INTERINSTITUCIONAL
                  </div>
                  <h2 className="text-lg font-black text-slate-900 uppercase mt-0.5">
                    {fichaImpressao.modoFicha === 'devolucao'
                      ? fichaImpressao.loan.tipo === 'recebido'
                        ? 'FICHA DE DEVOLUÇÃO DE EMPRÉSTIMO A TERCEIROS'
                        : 'FICHA DE RECEBIMENTO DE DEVOLUÇÃO DE EMPRÉSTIMO'
                      : fichaImpressao.loan.tipo === 'recebido'
                      ? 'FICHA DE ENTRADA POR EMPRÉSTIMO RECEBIDO'
                      : 'FICHA DE EMPRÉSTIMO CONCEDIDO A TERCEIROS'}
                  </h2>
                  <div className="text-xs text-slate-600 font-medium">
                    Unidade Gestora: {nomeNossaUnidade}
                  </div>
                </div>

                <div className="sm:text-right border sm:border-0 p-2.5 sm:p-0 rounded bg-slate-50 sm:bg-transparent">
                  <div className="text-[10px] font-bold uppercase text-slate-500">Número do Documento</div>
                  <div className="text-base font-mono font-black text-[#00237D]">
                    {fichaImpressao.modoFicha === 'devolucao'
                      ? `DEV-${fichaImpressao.loan.numero_documento}`
                      : fichaImpressao.loan.numero_documento}
                  </div>
                  <div className="text-[11px] text-slate-600 font-mono">
                    Data/Hora:{' '}
                    {new Date(
                      fichaImpressao.modoFicha === 'devolucao' && fichaImpressao.loan.data_quitacao
                        ? fichaImpressao.loan.data_quitacao
                        : fichaImpressao.loan.data_operacao
                    ).toLocaleString('pt-BR')}
                  </div>
                </div>
              </div>

              {/* 2. Entidade de Origem e Entidade de Destino */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3.5 rounded-lg border border-slate-300 bg-slate-50/70">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    ENTIDADE DE ORIGEM (CEDENTE / REMETENTE)
                  </div>
                  <div className="text-sm font-bold text-slate-900">
                    {fichaImpressao.modoFicha === 'emprestimo'
                      ? fichaImpressao.loan.tipo === 'recebido'
                        ? `${fichaImpressao.loan.entidade_nome} (${fichaImpressao.loan.entidade_codigo})`
                        : nomeNossaUnidade
                      : fichaImpressao.loan.tipo === 'recebido'
                      ? nomeNossaUnidade
                      : `${fichaImpressao.loan.entidade_nome} (${fichaImpressao.loan.entidade_codigo})`}
                  </div>
                  <div className="text-[11px] text-slate-600 mt-0.5">
                    {fichaImpressao.loan.entidade_cnpj ? `CNPJ: ${fichaImpressao.loan.entidade_cnpj}` : 'Unidade Hospitalar Homologada'}
                  </div>
                </div>

                <div className="p-3.5 rounded-lg border border-slate-300 bg-slate-50/70">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    ENTIDADE DE DESTINO (RECEBEDORA / FAVORECIDA)
                  </div>
                  <div className="text-sm font-bold text-slate-900">
                    {fichaImpressao.modoFicha === 'emprestimo'
                      ? fichaImpressao.loan.tipo === 'recebido'
                        ? nomeNossaUnidade
                        : `${fichaImpressao.loan.entidade_nome} (${fichaImpressao.loan.entidade_codigo})`
                      : fichaImpressao.loan.tipo === 'recebido'
                      ? `${fichaImpressao.loan.entidade_nome} (${fichaImpressao.loan.entidade_codigo})`
                      : nomeNossaUnidade}
                  </div>
                  <div className="text-[11px] text-slate-600 mt-0.5">
                    Status do Termo:{' '}
                    <strong>
                      {fichaImpressao.loan.status === 'quitado' ? 'QUITADO / DEVOLVIDO' : 'PENDENTE DE DEVOLUÇÃO'}
                    </strong>
                  </div>
                </div>
              </div>

              {/* 3. Tabela com: Código, Descrição do Produto, Lote, Quantidade e Unidade */}
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-2">
                  Relação de Materiais / Insumos Movimentados
                </div>
                <table className="w-full border border-slate-400 text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-slate-800 font-bold uppercase">
                    <tr>
                      <th className="p-2.5 border border-slate-300">Código</th>
                      <th className="p-2.5 border border-slate-300">Descrição do Produto</th>
                      <th className="p-2.5 border border-slate-300 text-center">Lote</th>
                      <th className="p-2.5 border border-slate-300 text-right">Quantidade</th>
                      <th className="p-2.5 border border-slate-300 text-center">Unidade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(fichaImpressao.loan.itens || []).map((item) => (
                      <tr key={item.id}>
                        <td className="p-2.5 border border-slate-300 font-mono font-bold">
                          {item.produto_codigo}
                        </td>
                        <td className="p-2.5 border border-slate-300 font-semibold">
                          {item.produto_nome}
                        </td>
                        <td className="p-2.5 border border-slate-300 text-center font-mono">
                          {item.numero_lote || 'S/L'}
                          {item.data_validade
                            ? ` (Val: ${item.data_validade.split('-').reverse().join('/')})`
                            : ''}
                        </td>
                        <td className="p-2.5 border border-slate-300 text-right font-mono font-bold text-sm">
                          {fichaImpressao.modoFicha === 'devolucao' && Number(item.quantidade_devolvida) > 0
                            ? item.quantidade_devolvida
                            : item.quantidade}
                        </td>
                        <td className="p-2.5 border border-slate-300 text-center font-bold">
                          {item.unidade_medida}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 4. Campo de Observações */}
              <div className="p-3.5 rounded-lg border border-slate-300 bg-slate-50 text-xs">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Observações / Autorização Diretoria:
                </div>
                <div className="text-slate-800 font-medium">
                  {fichaImpressao.loan.observacao || 'Empréstimo emergencial autorizado pela diretoria.'}
                </div>
              </div>

              {/* 5. Rodapé com DOIS CAMPOS PARA ASSINATURA FÍSICA */}
              <div className="pt-10 pb-2 grid grid-cols-1 sm:grid-cols-2 gap-10 text-center text-xs">
                <div className="space-y-1">
                  <div className="text-slate-400 font-mono select-none">
                    _____________________________________
                  </div>
                  <div className="font-bold text-slate-900 uppercase">
                    Responsável pelo Almoxarifado (Entrega/Recebimento)
                  </div>
                  <div className="text-[11px] text-slate-600">
                    {fichaImpressao.loan.responsavel_almoxarifado_nome || currentUser?.nome || 'Almoxarifado Central'}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-slate-400 font-mono select-none">
                    _____________________________________
                  </div>
                  <div className="font-bold text-slate-900 uppercase">
                    Responsável da Entidade Parceira (Recebimento/Devolução)
                  </div>
                  <div className="text-[11px] text-slate-600">
                    {fichaImpressao.loan.responsavel_entidade_nome
                      ? `${fichaImpressao.loan.responsavel_entidade_nome} (${fichaImpressao.loan.entidade_nome})`
                      : fichaImpressao.loan.entidade_nome}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
