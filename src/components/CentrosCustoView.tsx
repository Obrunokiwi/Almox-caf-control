import React, { useState, useMemo } from 'react';
import {
  Building2,
  Plus,
  Search,
  RotateCcw,
  Edit2,
  Trash2,
  Eye,
  Save,
  ArrowLeft,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Hospital,
  Power
} from 'lucide-react';
import type { CentroCusto, Usuario, EmpresaUnidade } from '../types/index.ts';
import { useToast } from '../context/ToastContext.tsx';
import { ConfirmDeleteModal } from './ConfirmDeleteModal.tsx';
import { CentroCustoAlertBanner } from './CentroCustoAlertBanner.tsx';
import { SearchableSelect, type SearchableOption } from './SearchableSelect.tsx';

interface CentrosCustoViewProps {
  centrosCusto: CentroCusto[];
  unidades?: EmpresaUnidade[];
  currentUser: Usuario | null;
  onRefresh: () => void;
  onVoltar?: () => void;
}

export const CentrosCustoView: React.FC<CentrosCustoViewProps> = ({
  centrosCusto,
  unidades = [],
  currentUser,
  onRefresh,
  onVoltar,
}) => {
  const { toast } = useToast();
  const isAdmin = currentUser?.perfil === 'admin';
  const isAlmoxarife = currentUser?.perfil === 'almoxarife';
  const canAccess = isAdmin || isAlmoxarife;

  // Filtros de Consulta: Código, Nome, Ativo (Todos/Sim/Não)
  const [filtroCodigo, setFiltroCodigo] = useState('');
  const [filtroNome, setFiltroNome] = useState('');
  const [filtroAtivo, setFiltroAtivo] = useState<'todos' | 'sim' | 'nao'>('todos');
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filtroCodigo.trim()) count++;
    if (filtroNome.trim()) count++;
    if (filtroAtivo !== 'todos') count++;
    return count;
  }, [filtroCodigo, filtroNome, filtroAtivo]);

  // Estado do Formulário
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit' | 'view'>('create');
  const [editingId, setEditingId] = useState<number | null>(null);

  // Campos do Formulário: Código (numérico, único), Nome (obrigatório), Responsável (opcional), Ativo (Sim/Não)
  const [formCodigo, setFormCodigo] = useState('');
  const [formNome, setFormNome] = useState('');
  const [formResponsavel, setFormResponsavel] = useState('');
  const [formAtivo, setFormAtivo] = useState<number>(1);
  const [formError, setFormError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Modais de exclusão / inativação
  const [deletingCentro, setDeletingCentro] = useState<CentroCusto | null>(null);
  const [inactivatePrompt, setInactivatePrompt] = useState<{
    centro: CentroCusto;
    motivo: string;
  } | null>(null);

  // Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Filtragem da grade
  const filteredCentros = useMemo(() => {
    return centrosCusto.filter((cc) => {
      if (filtroCodigo.trim() && !String(cc.codigo).toLowerCase().includes(filtroCodigo.trim().toLowerCase())) {
        return false;
      }
      if (filtroNome.trim() && !cc.nome.toLowerCase().includes(filtroNome.trim().toLowerCase())) {
        return false;
      }
      if (filtroAtivo !== 'todos') {
        const val = filtroAtivo === 'sim' ? 1 : 0;
        if (cc.ativo !== val) return false;
      }
      return true;
    });
  }, [centrosCusto, filtroCodigo, filtroNome, filtroAtivo]);

  const totalPages = Math.ceil(filteredCentros.length / pageSize) || 1;
  const paginatedCentros = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredCentros.slice(start, start + pageSize);
  }, [filteredCentros, currentPage, pageSize]);

  // Se o usuário não tiver permissão (ex: requisitante)
  if (!canAccess) {
    return (
      <div className="p-8 max-w-2xl mx-auto text-center space-y-4">
        <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 inline-block text-amber-700">
          <Building2 className="w-12 h-12 mx-auto" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">Acesso Restrito</h2>
        <p className="text-sm text-slate-600">
          O cadastro e gestão de Centros de Custo é restrito ao Administrador (com consulta pelo Almoxarife).
          Requisitantes têm acesso à Consulta de Saldo em Estoque e às Requisições de Insumos.
        </p>
        {onVoltar && (
          <button
            type="button"
            onClick={onVoltar}
            className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-sm"
          >
            Voltar ao Painel
          </button>
        )}
      </div>
    );
  }

  // Ações de formulário
  const handleNovo = () => {
    // Sugere próximo código numérico
    let proximoNum = 1;
    const numerosExistentes = centrosCusto
      .map((c) => parseInt(c.codigo, 10))
      .filter((n) => !isNaN(n));
    if (numerosExistentes.length > 0) {
      proximoNum = Math.max(...numerosExistentes) + 1;
    }

    setFormMode('create');
    setEditingId(null);
    setFormCodigo(String(proximoNum));
    setFormNome('');
    setFormResponsavel('');
    setFormAtivo(1);
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleEditar = (cc: CentroCusto) => {
    setFormMode('edit');
    setEditingId(cc.id);
    setFormCodigo(cc.codigo);
    setFormNome(cc.nome);
    setFormResponsavel(cc.responsavel || '');
    setFormAtivo(cc.ativo);
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleVisualizar = (cc: CentroCusto) => {
    handleEditar(cc);
    setFormMode('view');
  };

  const handleLimparForm = () => {
    if (formMode === 'create') {
      setFormCodigo('');
    }
    setFormNome('');
    setFormResponsavel('');
    setFormAtivo(1);
    setFormError(null);
  };

  const handleLimparFiltros = () => {
    setFiltroCodigo('');
    setFiltroNome('');
    setFiltroAtivo('todos');
    setCurrentPage(1);
  };

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formMode === 'view') {
      setIsFormOpen(false);
      return;
    }

    const codLimpo = formCodigo.trim();
    if (!codLimpo || !/^\d+$/.test(codLimpo)) {
      const msg = 'O código deve ser numérico (ex: 1, 2, 101, 102).';
      setFormError(msg);
      toast.error('Código Inválido', msg);
      return;
    }

    if (!formNome.trim()) {
      const msg = 'O nome do Centro de Custo é obrigatório.';
      setFormError(msg);
      toast.error('Nome Obrigatório', msg);
      return;
    }

    setIsProcessing(true);
    setFormError(null);

    try {
      const payload = {
        codigo: codLimpo,
        nome: formNome.trim(),
        responsavel: formResponsavel.trim(),
        ativo: formAtivo,
      };

      const url = formMode === 'create' ? '/api/centros-custo' : `/api/centros-custo/${editingId}`;
      const method = formMode === 'create' ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `user:${currentUser?.id}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao salvar Centro de Custo.');
      }

      toast.success(
        formMode === 'create' ? 'Centro de Custo Criado' : 'Centro de Custo Atualizado',
        `Setor "${payload.codigo} - ${payload.nome}" gravado com sucesso.`
      );

      setIsFormOpen(false);
      onRefresh();
    } catch (err: any) {
      const msg = err.message || 'Erro ao processar requisição.';
      setFormError(msg);
      toast.error('Falha na Gravação', msg);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmExcluir = async () => {
    if (!deletingCentro) return;
    setIsProcessing(true);

    try {
      const res = await fetch(`/api/centros-custo/${deletingCentro.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `user:${currentUser?.id}`,
        },
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.canInactivate) {
          // Exibe aviso para inativação
          setInactivatePrompt({
            centro: deletingCentro,
            motivo: data.error,
          });
          setDeletingCentro(null);
          return;
        }
        throw new Error(data.error || 'Falha ao excluir registro.');
      }

      toast.success(
        'Centro de Custo Excluído',
        data.message || `Setor "${deletingCentro.codigo} - ${deletingCentro.nome}" removido.`
      );
      setDeletingCentro(null);
      onRefresh();
    } catch (err: any) {
      toast.error('Exclusão Não Permitida', err.message || 'Erro ao excluir.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleInativarDireto = async (cc: CentroCusto) => {
    setIsProcessing(true);
    try {
      const res = await fetch(`/api/centros-custo/${cc.id}/toggle`, {
        method: 'PATCH',
        headers: {
          'Authorization': `user:${currentUser?.id}`,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao inativar.');

      toast.success('Centro de Custo Inativado', `O setor "${cc.codigo} - ${cc.nome}" foi inativado.`);
      setInactivatePrompt(null);
      onRefresh();
    } catch (err: any) {
      toast.error('Erro ao Inativar', err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-teal-100 text-teal-800 rounded-lg">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                Cadastros &gt; Centros de Custo
              </span>
              {isAdmin && (
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  Acesso Total (Admin)
                </span>
              )}
              {isAlmoxarife && (
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                  Apenas Consulta (Almoxarife)
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight mt-1">
              Centros de Custo
            </h1>
            <p className="text-xs text-slate-500">
              Setores solicitantes, enfermarias, unidades de internação, farmácia e almoxarifados locais
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && !isFormOpen && (
            <button
              type="button"
              onClick={handleNovo}
              className="bg-teal-700 hover:bg-teal-800 text-white font-semibold px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 transition-all shadow cursor-pointer uppercase tracking-wider"
            >
              <Plus className="w-4 h-4" />
              <span>+ NOVO</span>
            </button>
          )}

          {onVoltar && (
            <button
              type="button"
              onClick={onVoltar}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 transition-all border border-slate-200 cursor-pointer uppercase tracking-wider"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>VOLTAR</span>
            </button>
          )}
        </div>
      </div>

      {/* Banner de Aviso de Estado Inicial Vazio */}
      {isAdmin && centrosCusto.filter((cc) => cc.ativo === 1).length === 0 && !isFormOpen && (
        <CentroCustoAlertBanner
          isAdmin={isAdmin}
          onCadastrarCentroCusto={isAdmin ? handleNovo : undefined}
          mensagemPersonalizada="Nenhum Centro de Custo ativo cadastrado no sistema. Cadastre ao menos um Centro de Custo para começar a movimentar o estoque, cadastrar usuários e receber notas fiscais."
        />
      )}

      {/* =========================================================================
          TELA DE CADASTRO / EDIÇÃO / VISUALIZAÇÃO
         ========================================================================= */}
      {isFormOpen ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-fadeIn">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-teal-700" />
              <h2 className="text-base font-bold text-slate-800">
                {formMode === 'create'
                  ? 'Novo Centro de Custo'
                  : formMode === 'edit'
                  ? `Editar Centro de Custo #${editingId}`
                  : `Visualizar Centro de Custo #${editingId}`}
              </h2>
            </div>

            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="text-xs text-slate-500 hover:text-slate-800 font-medium flex items-center gap-1 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Voltar para Consulta</span>
            </button>
          </div>

          {formError && (
            <div className="m-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <form onSubmit={handleSalvar} className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Código (numérico, único) */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Código (numérico, único) *
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={formCodigo}
                  disabled={formMode === 'view'}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    setFormCodigo(val);
                  }}
                  placeholder="ex: 101"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-800 focus:bg-white focus:border-teal-500 focus:ring-1 focus:ring-teal-500 disabled:opacity-60"
                  required
                />
                <span className="text-[10px] text-slate-400 mt-1 block">Apenas números.</span>
              </div>

              {/* Nome (obrigatório) */}
              <div className="lg:col-span-2">
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Nome do Centro de Custo *
                </label>
                <input
                  type="text"
                  value={formNome}
                  disabled={formMode === 'view'}
                  onChange={(e) => setFormNome(e.target.value)}
                  placeholder="ex: UTI Geral Adulto, Centro Cirúrgico, Enfermaria 3A..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:bg-white focus:border-teal-500 focus:ring-1 focus:ring-teal-500 disabled:opacity-60"
                  required
                />
              </div>

              {/* Ativo (Sim/Não) */}
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Ativo *
                </label>
                <SearchableSelect
                  options={[
                    { value: 1, label: 'Sim (Ativo)' },
                    { value: 0, label: 'Não (Inativo)' },
                  ]}
                  value={formAtivo}
                  disabled={formMode === 'view'}
                  onChange={(val) => setFormAtivo(Number(val))}
                  placeholder="Selecione..."
                />
              </div>

              {/* Responsável (opcional) */}
              <div className="lg:col-span-4">
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Responsável (opcional)
                </label>
                <input
                  type="text"
                  value={formResponsavel}
                  disabled={formMode === 'view'}
                  onChange={(e) => setFormResponsavel(e.target.value)}
                  placeholder="ex: Dr. Carlos Mendes, Enf. Roberta Lima..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:bg-white focus:border-teal-500 focus:ring-1 focus:ring-teal-500 disabled:opacity-60"
                />
              </div>
            </div>

            {/* Botões do Formulário: VOLTAR, LIMPAR, SALVAR */}
            <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer border border-slate-300 uppercase tracking-wider"
              >
                VOLTAR
              </button>

              <div className="flex items-center gap-2">
                {formMode !== 'view' && (
                  <button
                    type="button"
                    onClick={handleLimparForm}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer border border-slate-300 uppercase tracking-wider"
                  >
                    LIMPAR
                  </button>
                )}

                {formMode !== 'view' && (
                  <button
                    type="submit"
                    disabled={isProcessing}
                    className="px-5 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-semibold cursor-pointer shadow flex items-center gap-1.5 uppercase tracking-wider disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    <span>{isProcessing ? 'SALVANDO...' : 'SALVAR'}</span>
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      ) : (
        /* =========================================================================
            TELA DE CONSULTA DE CENTRO DE CUSTO
           ========================================================================= */
        <div className="space-y-4">
          {/* Top Action Bar: + NOVO e 🔍 FILTROS */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-teal-50 text-teal-800 rounded-lg">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-800">Centros de Custo</h2>
                <p className="text-[11px] text-slate-500">Gestão de departamentos e setores hospitalares</p>
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

              {isAdmin && (
                <button
                  type="button"
                  onClick={handleNovo}
                  className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-medium px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 transition-all shadow-sm uppercase tracking-wide cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ NOVO</span>
                </button>
              )}
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

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Código
                  </label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={filtroCodigo}
                      onChange={(e) => {
                        setFiltroCodigo(e.target.value);
                        setCurrentPage(1);
                      }}
                      placeholder="Filtrar por código..."
                      className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:bg-white focus:border-teal-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Nome do Centro de Custo
                  </label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={filtroNome}
                      onChange={(e) => {
                        setFiltroNome(e.target.value);
                        setCurrentPage(1);
                      }}
                      placeholder="Filtrar por nome..."
                      className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:bg-white focus:border-teal-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Ativo
                  </label>
                  <SearchableSelect
                    options={[
                      { value: 'todos', label: 'Todos' },
                      { value: 'sim', label: 'Sim (Ativos)' },
                      { value: 'nao', label: 'Não (Inativos)' },
                    ]}
                    value={filtroAtivo}
                    onChange={(val) => {
                      setFiltroAtivo(val as any);
                      setCurrentPage(1);
                    }}
                    placeholder="Filtrar por status..."
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

          {/* Grade de Consulta: Código | Nome | Responsável | Ativo */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">Código</th>
                    <th className="py-3 px-4">Nome</th>
                    <th className="py-3 px-4">Responsável</th>
                    <th className="py-3 px-4">Ativo</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedCentros.length > 0 ? (
                    paginatedCentros.map((cc) => (
                      <tr key={cc.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-teal-800">
                          {cc.codigo}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-800">
                          {cc.nome}
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          {cc.responsavel && cc.responsavel.trim() ? cc.responsavel : (
                            <span className="text-slate-400 italic">Não informado</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {cc.ativo === 1 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Sim</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-100 text-slate-600 border border-slate-200">
                              <XCircle className="w-3 h-3 text-slate-500" />
                              <span>Não</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {isAdmin ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleEditar(cc)}
                                title="Editar Centro de Custo"
                                className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600 hover:text-teal-700 transition-colors cursor-pointer"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeletingCentro(cc)}
                                title="Excluir Centro de Custo"
                                className="p-1.5 rounded-md hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleVisualizar(cc)}
                              title="Visualizar dados do Centro de Custo"
                              className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1 ml-auto cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Visualizar</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        Nenhum centro de custo encontrado com os filtros aplicados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Paginação */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
              <span>
                Total: <strong>{filteredCentros.length}</strong> registro(s) encontrado(s)
              </span>

              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(1)}
                    className="p-1 rounded hover:bg-slate-200 disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronsLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="p-1 rounded hover:bg-slate-200 disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="px-2 font-medium">
                    Página {currentPage} de {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="p-1 rounded hover:bg-slate-200 disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(totalPages)}
                    className="p-1 rounded hover:bg-slate-200 disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronsRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão */}
      {deletingCentro && (
        <ConfirmDeleteModal
          isOpen={!!deletingCentro}
          title="Excluir Centro de Custo"
          entityName={`${deletingCentro.codigo} - ${deletingCentro.nome}`}
          description="A exclusão definitiva só será permitida se não houver nenhuma movimentação, requisição, inventário ou usuário vinculado a este setor. Caso contrário, ele deverá ser inativado."
          isProcessing={isProcessing}
          onConfirm={handleConfirmExcluir}
          onClose={() => setDeletingCentro(null)}
        />
      )}

      {/* Modal de Alerta quando o Centro de Custo possui vínculos e deve ser apenas Inativado */}
      {inactivatePrompt && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4 animate-scaleUp">
            <div className="flex items-center gap-3 text-amber-700">
              <div className="p-2.5 bg-amber-100 rounded-full">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-800">
                Exclusão Bloqueada por Integridade
              </h3>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {inactivatePrompt.motivo}
            </p>

            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-900">
              <strong>Recomendação:</strong> Desative este Centro de Custo para que ele não apareça em novas requisições ou movimentações, preservando o histórico de auditoria.
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setInactivatePrompt(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer border border-slate-300"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => handleInativarDireto(inactivatePrompt.centro)}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-1.5 shadow"
              >
                <Power className="w-3.5 h-3.5" />
                <span>Inativar Centro de Custo</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
