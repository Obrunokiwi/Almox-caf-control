import React, { useState, useMemo } from 'react';
import {
  Users,
  Plus,
  Search,
  Edit2,
  Eye,
  Save,
  ArrowLeft,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  KeyRound,
  Building2,
  Mail,
  CreditCard,
  UserCheck,
  Trash2,
  CheckSquare,
  Lock,
  LayoutGrid,
  Check,
  RotateCcw,
  AlertTriangle,
  Truck,
  Package,
  PackageCheck,
  PackagePlus,
  ArrowLeftRight,
  Boxes,
  ClipboardList,
  FileBarChart,
  HardDriveDownload,
  FileSpreadsheet,
  BookOpen,
  ShoppingBag
} from 'lucide-react';
import type { Usuario, CentroCusto, PerfilUsuario, EmpresaUnidade } from '../types/index.ts';
import { maskCpf } from '../utils/cpfUtils.ts';

export const TODOS_MODULOS_SISTEMA = [
  { id: 'fornecedores', label: 'Fornecedores / Entidades', desc: 'Cadastro de fornecedores comerciais e hospitais parceiros', icon: Truck },
  { id: 'produtos', label: 'Produtos / Catálogo', desc: 'Catálogo de materiais, código único e lotes', icon: Package },
  { id: 'saldo-estoque', label: 'Consulta de Saldo em Estoque', desc: 'Conferência de saldos físicos e lotes FEFO', icon: PackageCheck },
  { id: 'kardex', label: 'Kardex do Produto', desc: 'Extrato analítico e movimentações em ordem cronológica', icon: BookOpen },
  { id: 'lista-compras', label: 'Lista de Compras / Reposição', desc: 'Relatório de reposição baseado no consumo e saldo atual', icon: ShoppingBag },
  { id: 'entradas', label: 'Entrada por Nota Fiscal', desc: 'Lançamento de notas fiscais e recebimento', icon: PackagePlus },
  { id: 'movimentacoes', label: 'Movimentações Diversas', desc: 'Devoluções de setor, perdas e saídas por vencimento', icon: ArrowLeftRight },
  { id: 'inventario', label: 'Inventário do Estoque', desc: 'Contagem física e ajustes de saldo', icon: Boxes },
  { id: 'emprestimos', label: 'Empréstimos entre Entidades', desc: 'Empréstimos e devoluções entre hospitais', icon: RotateCcw },
  { id: 'requisicoes', label: 'Requisição', desc: 'Abertura e acompanhamento de pedidos de insumos', icon: ClipboardList },
  { id: 'aprovacao-requisicoes', label: 'Aprovação de Requisições', desc: 'Análise, ajuste de quantidades e baixa FEFO', icon: CheckSquare },
  { id: 'centros-custo', label: 'Centros de Custo', desc: 'Departamentos e setores hospitalares', icon: Building2 },
  { id: 'usuarios', label: 'Usuário', desc: 'Gestão de operadores e permissões por módulo', icon: Users },
  { id: 'relatorios', label: 'Relatórios & Geral PDF', desc: 'Relatórios analíticos, gráficos e extratos', icon: FileBarChart },
  { id: 'perfil', label: 'Perfil', desc: 'Dados do operador autenticado e sessões', icon: UserCheck },
  { id: 'importacao-cadastros', label: 'Importação de Cadastros', desc: 'Importação em lote (.xlsx, .csv)', icon: FileSpreadsheet },
  { id: 'backup', label: 'Backup / Exportar Dados', desc: 'Download do SQLite, dumps e logs', icon: HardDriveDownload },
];

export const MODULOS_PADRAO_POR_PERFIL: Record<string, string[]> = {
  admin: TODOS_MODULOS_SISTEMA.map((m) => m.id),
  ti_dpo: TODOS_MODULOS_SISTEMA.map((m) => m.id),
  almoxarife: [
    'fornecedores', 'produtos', 'saldo-estoque', 'kardex', 'lista-compras', 'entradas', 'movimentacoes',
    'inventario', 'emprestimos', 'requisicoes', 'aprovacao-requisicoes',
    'relatorios', 'perfil'
  ],
  requisitante: [
    'requisicoes', 'perfil'
  ],
};

export function getModuloRestrictionReason(moduloId: string, perfil: PerfilUsuario, isMainAdmin: boolean): string | null {
  if (isMainAdmin) return null;
  if (perfil === 'requisitante') {
    if (moduloId === 'saldo-estoque') return 'Restrito: Requisitantes não possuem acesso ao saldo de estoque';
    if (moduloId === 'kardex') return 'Restrito: Requisitantes não possuem acesso ao Kardex do Produto';
    if (moduloId === 'lista-compras') return 'Restrito: Requisitantes não possuem acesso à Lista de Compras';
    if (moduloId === 'aprovacao-requisicoes') return 'Restrito: Exclusivo para Almoxarife e Administrador';
    if (['backup', 'importacao-cadastros', 'usuarios'].includes(moduloId)) return 'Restrito: Exclusivo para perfil Administrador';
  }
  if (perfil !== 'admin') {
    if (['backup', 'importacao-cadastros', 'usuarios'].includes(moduloId)) return 'Restrito: Exclusivo para perfil Administrador';
  }
  if (perfil !== 'admin' && perfil !== 'almoxarife') {
    if (['aprovacao-requisicoes', 'kardex', 'lista-compras'].includes(moduloId)) return 'Restrito: Exclusivo para Almoxarife e Administrador';
  }
  return null;
}
import { useToast } from '../context/ToastContext.tsx';
import { ConfirmDeleteModal } from './ConfirmDeleteModal.tsx';
import { CentroCustoAlertBanner } from './CentroCustoAlertBanner.tsx';
import { SearchableSelect, type SearchableOption } from './SearchableSelect.tsx';

interface UsuariosViewProps {
  usuarios: Usuario[];
  centrosCusto: CentroCusto[];
  unidades?: EmpresaUnidade[];
  currentUser: Usuario | null;
  onRefresh: () => void;
  onVoltar?: () => void;
  onNavigate?: (tab: string) => void;
}

export const UsuariosView: React.FC<UsuariosViewProps> = ({
  usuarios,
  centrosCusto,
  unidades = [],
  currentUser,
  onRefresh,
  onVoltar,
  onNavigate,
}) => {
  // Filtros de busca em duas linhas
  const [filtroCodigo, setFiltroCodigo] = useState('');
  const [filtroNome, setFiltroNome] = useState('');
  const [filtroLogin, setFiltroLogin] = useState('');
  const [filtroCpf, setFiltroCpf] = useState('');
  const [filtroEmail, setFiltroEmail] = useState('');
  const [filtroAtivo, setFiltroAtivo] = useState<'todos' | '1' | '0'>('todos');
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filtroCodigo.trim()) count++;
    if (filtroNome.trim()) count++;
    if (filtroLogin.trim()) count++;
    if (filtroCpf.trim()) count++;
    if (filtroEmail.trim()) count++;
    if (filtroAtivo !== 'todos') count++;
    return count;
  }, [filtroCodigo, filtroNome, filtroLogin, filtroCpf, filtroEmail, filtroAtivo]);

  const handleLimparFiltros = () => {
    setFiltroCodigo('');
    setFiltroNome('');
    setFiltroLogin('');
    setFiltroCpf('');
    setFiltroEmail('');
    setFiltroAtivo('todos');
    setCurrentPage(1);
  };

  // Controle de Visualização / Edição / Cadastro
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit' | 'view'>('create');
  const [activeFormTab, setActiveFormTab] = useState<'identificacao' | 'permissoes' | 'historico'>('identificacao');
  const [editingUserId, setEditingUserId] = useState<number | null>(null);

  // Campos do Formulário em Abas
  const [formCodigo, setFormCodigo] = useState('');
  const [formNome, setFormNome] = useState('');
  const [formLogin, setFormLogin] = useState('');
  const [formSenha, setFormSenha] = useState('');
  const [formCpf, setFormCpf] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPerfil, setFormPerfil] = useState<PerfilUsuario>('requisitante');
  const [formCcId, setFormCcId] = useState<number | ''>('');
  const [formEmpresaId, setFormEmpresaId] = useState<number>(1);
  const [formAtivo, setFormAtivo] = useState<number>(1);
  const [formHistoricoCriacao, setFormHistoricoCriacao] = useState('');
  const [formHistoricoAcesso, setFormHistoricoAcesso] = useState('');

  const perfilOptions: SearchableOption[] = [
    { value: 'requisitante', label: 'Requisitante (Pedidos para seu Centro de Custo)' },
    { value: 'almoxarife', label: 'Almoxarife (Análise, Baixas e Empréstimos)' },
    { value: 'admin', label: 'Administrador (Controle Irrestrito e Cadastros)' },
  ];

  const centrosCustoAtivos = useMemo(() => centrosCusto.filter((cc) => cc.ativo === 1), [centrosCusto]);

  const centroCustoOptions: SearchableOption[] = useMemo(() => [
    { value: '', label: '(Selecione o Centro de Custo)' },
    ...centrosCustoAtivos.map((cc) => ({
      value: cc.id,
      label: `${cc.codigo} - ${cc.nome}`,
    })),
  ], [centrosCustoAtivos]);

  const unidadeOptions: SearchableOption[] = useMemo(() => [
    ...unidades.map((u) => ({
      value: u.id,
      label: `${u.codigo} - ${u.nome}`,
    })),
  ], [unidades]);

  const statusOptions: SearchableOption[] = [
    { value: 1, label: 'Ativo (Liberado)' },
    { value: 0, label: 'Inativo (Bloqueado)' },
  ];

  const filtroAtivoOptions: SearchableOption[] = [
    { value: 'todos', label: 'TODOS' },
    { value: '1', label: 'SIM (Ativo)' },
    { value: '0', label: 'NÃO (Inativo)' },
  ];

  // Checkboxes de Permissões e Módulos Liberados (Aba 2)
  const [formModulos, setFormModulos] = useState<string[]>(MODULOS_PADRAO_POR_PERFIL['requisitante']);
  const [pendingPerfilChange, setPendingPerfilChange] = useState<PerfilUsuario | null>(null);

  const isTargetMainAdmin = Boolean(
    (editingUserId && editingUserId === 1) ||
    formLogin.toLowerCase() === 'admin'
  );

  const handleMarcarTodosModulos = () => {
    if (isTargetMainAdmin) return;
    const permitidos = TODOS_MODULOS_SISTEMA
      .filter((m) => !getModuloRestrictionReason(m.id, formPerfil, false))
      .map((m) => m.id);
    setFormModulos(permitidos);
  };

  const handleDesmarcarTodosModulos = () => {
    if (isTargetMainAdmin) return;
    setFormModulos([]);
  };

  const handleAplicarPadraoPerfil = (perfilAlvo: PerfilUsuario = formPerfil) => {
    if (isTargetMainAdmin) {
      setFormModulos(TODOS_MODULOS_SISTEMA.map((m) => m.id));
      return;
    }
    const padrao = (MODULOS_PADRAO_POR_PERFIL[perfilAlvo] || ['requisicoes', 'perfil'])
      .filter((mId) => !getModuloRestrictionReason(mId, perfilAlvo, false));
    setFormModulos(padrao);
  };

  const handlePerfilSelectChange = (novoPerfil: PerfilUsuario) => {
    if (novoPerfil === formPerfil) return;
    setPendingPerfilChange(novoPerfil);
  };

  const confirmarTrocaPerfil = (aplicarPadrao: boolean) => {
    if (!pendingPerfilChange) return;
    const novo = pendingPerfilChange;
    setFormPerfil(novo);
    if (aplicarPadrao) {
      handleAplicarPadraoPerfil(novo);
    } else {
      // Remove apenas módulos que são estritamente restritos no novo perfil
      setFormModulos((prev) => prev.filter((mId) => !getModuloRestrictionReason(mId, novo, isTargetMainAdmin)));
    }
    setPendingPerfilChange(null);
  };

  const toggleModulo = (moduloId: string) => {
    if (isTargetMainAdmin || formMode === 'view') return;
    const restriction = getModuloRestrictionReason(moduloId, formPerfil, false);
    if (restriction) return;

    setFormModulos((prev) =>
      prev.includes(moduloId) ? prev.filter((m) => m !== moduloId) : [...prev, moduloId]
    );
  };

  const [permissoes, setPermissoes] = useState({
    cadastrar_produtos: false,
    analisar_requisicoes: false,
    liberar_emprestimos: false,
    emitir_relatorios: true,
    estornar_movimentacoes: false,
  });

  // Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [deletingUser, setDeletingUser] = useState<Usuario | null>(null);

  const { toast } = useToast();
  const isAdmin = currentUser?.perfil === 'admin';

  // Filtragem dos usuários
  const filteredUsers = useMemo(() => {
    return usuarios.filter((u) => {
      if (filtroCodigo && !u.codigo?.toLowerCase().includes(filtroCodigo.toLowerCase()) && !String(u.id).includes(filtroCodigo)) {
        return false;
      }
      if (filtroNome && !u.nome.toLowerCase().includes(filtroNome.toLowerCase())) {
        return false;
      }
      if (filtroLogin && !u.login.toLowerCase().includes(filtroLogin.toLowerCase())) {
        return false;
      }
      if (filtroCpf && !u.cpf?.toLowerCase().includes(filtroCpf.toLowerCase())) {
        return false;
      }
      if (filtroEmail && !u.email?.toLowerCase().includes(filtroEmail.toLowerCase())) {
        return false;
      }
      if (filtroAtivo !== 'todos') {
        const ativoVal = filtroAtivo === '1' ? 1 : 0;
        if (u.ativo !== ativoVal) return false;
      }
      return true;
    });
  }, [usuarios, filtroCodigo, filtroNome, filtroLogin, filtroCpf, filtroEmail, filtroAtivo]);

  // Paginação calculada
  const totalPages = Math.ceil(filteredUsers.length / pageSize) || 1;
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, currentPage, pageSize]);

  // Abertura do formulário de novo usuário
  const handleNovo = () => {
    setFormMode('create');
    setEditingUserId(null);
    setFormCodigo(`USR-00${usuarios.length + 1}`);
    setFormNome('');
    setFormLogin('');
    setFormSenha('123456');
    setFormCpf('');
    setFormEmail('');
    setFormPerfil('requisitante');
    setFormCcId(centrosCusto[0]?.id || '');
    setFormEmpresaId(unidades[0]?.id || 1);
    setFormAtivo(1);
    setFormHistoricoCriacao(new Date().toLocaleString('pt-BR'));
    setFormHistoricoAcesso('Primeiro acesso pendente');
    setFormModulos([...(MODULOS_PADRAO_POR_PERFIL['requisitante'] || ['requisicoes', 'perfil'])]);
    setPermissoes({
      cadastrar_produtos: false,
      analisar_requisicoes: false,
      liberar_emprestimos: false,
      emitir_relatorios: true,
      estornar_movimentacoes: false,
    });
    setActiveFormTab('identificacao');
    setErrorMsg(null);
    setIsFormOpen(true);
  };

  // Abertura para edição
  const handleEditar = (u: Usuario) => {
    setFormMode('edit');
    setEditingUserId(u.id);
    setFormCodigo(u.codigo || `USR-${String(u.id).padStart(4, '0')}`);
    setFormNome(u.nome);
    setFormLogin(u.login);
    setFormSenha('');
    setFormCpf(u.cpf || '');
    setFormEmail(u.email || '');
    setFormPerfil(u.perfil);
    setFormCcId(u.centro_custo_id || '');
    setFormEmpresaId(u.empresa_id || 1);
    setFormAtivo(u.ativo);
    setFormHistoricoCriacao(u.criado_em ? new Date(u.criado_em).toLocaleString('pt-BR') : '29/09/2026');
    setFormHistoricoAcesso(u.ultimo_acesso ? new Date(u.ultimo_acesso).toLocaleString('pt-BR') : 'Sem registros recentes');
    const isTargetAdmin = u.id === 1 || u.login === 'admin';
    setFormModulos(
      isTargetAdmin
        ? [...TODOS_MODULOS_SISTEMA.map((m) => m.id)]
        : (u.modulos && u.modulos.length > 0 ? [...u.modulos] : [...(MODULOS_PADRAO_POR_PERFIL[u.perfil] || ['requisicoes', 'perfil'])])
    );
    setPermissoes({
      cadastrar_produtos: ['admin', 'almoxarife'].includes(u.perfil),
      analisar_requisicoes: ['admin', 'almoxarife'].includes(u.perfil),
      liberar_emprestimos: ['admin', 'almoxarife'].includes(u.perfil),
      emitir_relatorios: true,
      estornar_movimentacoes: u.perfil === 'admin',
    });
    setActiveFormTab('identificacao');
    setErrorMsg(null);
    setIsFormOpen(true);
  };

  // Visualizar apenas
  const handleVisualizar = (u: Usuario) => {
    handleEditar(u);
    setFormMode('view');
  };

  // Salvar formulário
  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formMode === 'view') {
      setIsFormOpen(false);
      return;
    }

    if (!formNome || !formLogin || !formPerfil) {
      const msg = 'Nome, login e perfil são campos obrigatórios.';
      setErrorMsg(msg);
      toast.error('Campos Obrigatórios', msg);
      setActiveFormTab('identificacao');
      return;
    }

    if (formPerfil === 'requisitante' && !formCcId) {
      const msg = 'Centro de Custo é obrigatório para usuários Requisitantes.';
      setErrorMsg(msg);
      toast.error('Centro de Custo Obrigatório', msg);
      setActiveFormTab('identificacao');
      return;
    }

    const cleanCpfDigits = formCpf.replace(/\D/g, '');
    if (cleanCpfDigits.length !== 11) {
      const msg = 'O CPF é obrigatório e deve ter 11 dígitos no formato 000.000.000-00.';
      setErrorMsg(msg);
      toast.error('CPF Obrigatório', msg);
      setActiveFormTab('identificacao');
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);

    try {
      const payload: any = {
        codigo: formCodigo,
        nome: formNome.trim(),
        login: formLogin.trim(),
        cpf: formCpf ? formCpf.trim() : null,
        email: formEmail ? formEmail.trim() : null,
        perfil: formPerfil,
        centro_custo_id: formCcId || null,
        empresa_id: formEmpresaId || 1,
        ativo: formAtivo,
        modulos: formModulos,
      };

      if (formSenha && formSenha.trim()) {
        payload.senha = formSenha.trim();
      }

      const url = formMode === 'create' ? '/api/usuarios' : `/api/usuarios/${editingUserId}`;
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
        throw new Error(data.error || 'Erro ao salvar usuário.');
      }

      if (formMode === 'create') {
        toast.success(
          'Usuário Cadastrado',
          `O operador "${payload.nome}" (@${payload.login}) foi adicionado ao sistema.`
        );
      } else {
        toast.success(
          'Usuário Atualizado',
          `O cadastro do operador "${payload.nome}" (@${payload.login}) foi atualizado.`
        );
      }

      setIsFormOpen(false);
      onRefresh();
    } catch (err: any) {
      const msg = err.message || 'Erro ao processar solicitação.';
      setErrorMsg(msg);
      toast.error(
        formMode === 'create' ? 'Erro ao Cadastrar Usuário' : 'Erro ao Editar Usuário',
        msg
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingUser) return;
    setIsProcessing(true);
    try {
      const res = await fetch(`/api/usuarios/${deletingUser.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `user:${currentUser?.id}`,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao excluir usuário.');
      }

      toast.success(
        'Usuário Excluído',
        data.message || `O operador "${deletingUser.nome}" (@${deletingUser.login}) foi excluído.`
      );
      if (editingUserId === deletingUser.id) {
        setIsFormOpen(false);
      }
      setDeletingUser(null);
      onRefresh();
    } catch (err: any) {
      toast.error('Erro ao Excluir Usuário', err.message || 'Falha ao excluir usuário.');
    } finally {
      setIsProcessing(false);
    }
  };

  const getPerfilBadge = (p: string) => {
    switch (p) {
      case 'admin':
        return <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 text-[10px] font-bold uppercase tracking-wider border border-purple-200">Administrador</span>;
      case 'almoxarife':
        return <span className="px-2 py-0.5 rounded bg-teal-100 text-teal-800 text-[10px] font-bold uppercase tracking-wider border border-teal-200">Almoxarife</span>;
      case 'requisitante':
        return <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-bold uppercase tracking-wider border border-blue-200">Requisitante</span>;
      default:
        return <span>{p}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* =========================================================================
          CABEÇALHO DA TELA DE CONSULTA DE USUÁRIO
         ========================================================================= */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-teal-100 text-teal-800 rounded-lg">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">Consulta de Usuário</h1>
            <p className="text-xs text-slate-500">Gestão e controle de operadores de almoxarifado e solicitantes</p>
          </div>
        </div>

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

      {/* Aviso de Centro de Custo Vazio */}
      {isAdmin && centrosCustoAtivos.length === 0 && (
        <CentroCustoAlertBanner
          isAdmin={isAdmin}
          onCadastrarCentroCusto={onNavigate ? () => onNavigate('centros-custo') : undefined}
          mensagemPersonalizada="Cadastre ao menos um Centro de Custo para começar a vincular usuários e setores da instituição."
        />
      )}

      {/* =========================================================================
          SEÇÃO 1: FORMULÁRIO DE CADASTRO / EDIÇÃO EM ABAS (SE ABERTO)
         ========================================================================= */}
      {isFormOpen ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-md overflow-hidden animate-fadeIn">
          {/* Cabeçalho do Formulário */}
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-teal-100 text-teal-800 px-2 py-0.5 rounded">
                {formMode === 'create' ? 'Novo Cadastro' : formMode === 'edit' ? 'Alteração de Registro' : 'Visualização'}
              </span>
              <h2 className="text-base font-bold text-slate-800 mt-1">
                {formMode === 'create' ? 'Cadastrar Novo Usuário' : `Usuário: ${formNome} (${formLogin})`}
              </h2>
            </div>

            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Voltar para Listagem</span>
            </button>
          </div>

          {errorMsg && (
            <div className="mx-6 mt-4 p-3 rounded bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {errorMsg}
            </div>
          )}

          {/* Abas do Formulário */}
          <div className="flex border-b border-slate-200 px-6 pt-2 bg-slate-50/50">
            <button
              type="button"
              onClick={() => setActiveFormTab('identificacao')}
              className={`px-5 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
                activeFormTab === 'identificacao'
                  ? 'border-teal-600 text-teal-700 bg-white rounded-t'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              1. Identificação
            </button>

            <button
              type="button"
              onClick={() => setActiveFormTab('permissoes')}
              className={`px-5 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
                activeFormTab === 'permissoes'
                  ? 'border-teal-600 text-teal-700 bg-white rounded-t'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              2. Permissões / Acesso
            </button>

            <button
              type="button"
              onClick={() => setActiveFormTab('historico')}
              className={`px-5 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
                activeFormTab === 'historico'
                  ? 'border-teal-600 text-teal-700 bg-white rounded-t'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              3. Histórico & Auditoria
            </button>
          </div>

          <form onSubmit={handleSalvar} className="p-6 space-y-6">
            {/* ABA 1: IDENTIFICAÇÃO */}
            {activeFormTab === 'identificacao' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Código do Usuário
                  </label>
                  <input
                    type="text"
                    value={formCodigo}
                    onChange={(e) => setFormCodigo(e.target.value)}
                    disabled={formMode === 'view'}
                    className="w-full px-3 py-2 bg-[#f1f3f5] border border-slate-300 rounded text-xs text-slate-800 font-mono focus:bg-white focus:border-teal-500 shadow-inner"
                    placeholder="ex: USR-001"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Nome Completo *
                  </label>
                  <input
                    type="text"
                    value={formNome}
                    onChange={(e) => setFormNome(e.target.value)}
                    disabled={formMode === 'view'}
                    className="w-full px-3 py-2 bg-[#f1f3f5] border border-slate-300 rounded text-xs text-slate-800 focus:bg-white focus:border-teal-500 shadow-inner"
                    placeholder="Nome completo do colaborador"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Usuário Login *
                  </label>
                  <input
                    type="text"
                    value={formLogin}
                    onChange={(e) => setFormLogin(e.target.value)}
                    disabled={formMode === 'view'}
                    className="w-full px-3 py-2 bg-[#f1f3f5] border border-slate-300 rounded text-xs text-slate-800 font-mono focus:bg-white focus:border-teal-500 shadow-inner"
                    placeholder="login.acesso"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Senha de Acesso {formMode === 'edit' && '(deixe em branco p/ manter)'}
                  </label>
                  <input
                    type="password"
                    value={formSenha}
                    onChange={(e) => setFormSenha(e.target.value)}
                    disabled={formMode === 'view'}
                    className="w-full px-3 py-2 bg-[#f1f3f5] border border-slate-300 rounded text-xs text-slate-800 focus:bg-white focus:border-teal-500 shadow-inner"
                    placeholder={formMode === 'edit' ? '••••••••' : 'Mínimo 6 dígitos'}
                    required={formMode === 'create'}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    CPF *
                  </label>
                  <input
                    type="text"
                    value={formCpf}
                    onChange={(e) => setFormCpf(maskCpf(e.target.value))}
                    disabled={formMode === 'view'}
                    className="w-full px-3 py-2 bg-[#f1f3f5] border border-slate-300 rounded text-xs text-slate-800 focus:bg-white focus:border-teal-500 shadow-inner"
                    placeholder="000.000.000-00"
                    maxLength={14}
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    E-mail Institucional
                  </label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    disabled={formMode === 'view'}
                    className="w-full px-3 py-2 bg-[#f1f3f5] border border-slate-300 rounded text-xs text-slate-800 focus:bg-white focus:border-teal-500 shadow-inner"
                    placeholder="usuario@hospital.gov.br"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Perfil de Acesso *
                  </label>
                  <SearchableSelect
                    options={perfilOptions}
                    value={formPerfil}
                    onChange={(val) => handlePerfilSelectChange(val as PerfilUsuario)}
                    disabled={formMode === 'view'}
                    placeholder="Selecione o perfil..."
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                      Centro de Custo Solicitante {formPerfil === 'requisitante' && '*'}
                    </label>
                    {isAdmin && onNavigate && (
                      <button
                        type="button"
                        onClick={() => onNavigate('centros-custo')}
                        className="text-[10px] font-bold text-teal-700 hover:text-teal-900 hover:underline flex items-center gap-0.5 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Cadastrar novo centro de custo</span>
                      </button>
                    )}
                  </div>
                  {centrosCustoAtivos.length > 0 ? (
                    <SearchableSelect
                      options={centroCustoOptions}
                      value={formCcId}
                      onChange={(val) => setFormCcId(val ? Number(val) : '')}
                      disabled={formMode === 'view'}
                      placeholder="Selecione o Centro de Custo..."
                      allowClear
                    />
                  ) : (
                    <div className="p-2.5 rounded bg-amber-50 border border-amber-300 text-amber-900 text-xs">
                      <span>Nenhum Centro de Custo ativo cadastrado. </span>
                      {isAdmin && onNavigate ? (
                        <button
                          type="button"
                          onClick={() => onNavigate('centros-custo')}
                          className="font-bold underline text-teal-800 hover:text-teal-950 cursor-pointer ml-1"
                        >
                          Cadastre ao menos um Centro de Custo para começar
                        </button>
                      ) : (
                        <span>Entre em contato com o administrador para cadastrar um Centro de Custo.</span>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Unidade / Almoxarifado
                  </label>
                  <SearchableSelect
                    options={unidadeOptions}
                    value={formEmpresaId}
                    onChange={(val) => setFormEmpresaId(Number(val))}
                    disabled={formMode === 'view'}
                    placeholder="Selecione a Unidade..."
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Status do Usuário
                  </label>
                  <SearchableSelect
                    options={statusOptions}
                    value={formAtivo}
                    onChange={(val) => setFormAtivo(Number(val))}
                    disabled={formMode === 'view'}
                    placeholder="Selecione o Status..."
                  />
                </div>
              </div>
            )}

            {/* ABA 2: MÓDULOS LIBERADOS & PERMISSÕES */}
            {activeFormTab === 'permissoes' && (
              <div className="space-y-5">
                {/* Banner de Perfil e Botões de Ação Rápida */}
                <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-800">Módulos Liberados</span>
                      <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase rounded bg-teal-100 text-teal-800 border border-teal-200">
                        Perfil: {formPerfil}
                      </span>
                      {isTargetMainAdmin && (
                        <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase rounded bg-amber-100 text-amber-800 border border-amber-200">
                          Acesso Irrestrito (Admin Principal)
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Selecione quais telas e funcionalidades do sistema este operador poderá visualizar e operar.
                    </p>
                  </div>

                  {formMode !== 'view' && !isTargetMainAdmin && (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleMarcarTodosModulos}
                        className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-[11px] font-semibold flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                      >
                        <CheckSquare className="w-3.5 h-3.5 text-teal-600" />
                        <span>Marcar todos</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleDesmarcarTodosModulos}
                        className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-[11px] font-semibold flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                        <span>Desmarcar todos</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAplicarPadraoPerfil()}
                        className="px-2.5 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-300 rounded text-[11px] font-semibold flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                      >
                        <ShieldCheck className="w-3.5 h-3.5 text-teal-700" />
                        <span>Aplicar padrão do perfil</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Grade de 15 Módulos */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {TODOS_MODULOS_SISTEMA.map((modulo) => {
                    const IconComponent = modulo.icon;
                    const isChecked = isTargetMainAdmin || formModulos.includes(modulo.id);
                    const restrictionReason = getModuloRestrictionReason(modulo.id, formPerfil, isTargetMainAdmin);
                    const isDisabled = formMode === 'view' || isTargetMainAdmin || Boolean(restrictionReason);

                    return (
                      <div
                        key={modulo.id}
                        onClick={() => {
                          if (!isDisabled) toggleModulo(modulo.id);
                        }}
                        className={`relative p-3.5 rounded-lg border transition-all text-left select-none ${
                          isDisabled
                            ? 'bg-slate-100/80 border-slate-200 opacity-60 cursor-not-allowed'
                            : isChecked
                            ? 'bg-teal-50/50 border-teal-500 shadow-xs cursor-pointer hover:border-teal-600 hover:bg-teal-50'
                            : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50 shadow-xs cursor-pointer'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`w-4 h-4 mt-0.5 rounded flex items-center justify-center border transition-colors shrink-0 ${
                              isChecked
                                ? 'bg-teal-600 border-teal-600 text-white'
                                : 'border-slate-300 bg-white'
                            }`}
                          >
                            {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <IconComponent
                                className={`w-4 h-4 shrink-0 ${
                                  isChecked ? 'text-teal-700' : 'text-slate-400'
                                }`}
                              />
                              <span
                                className={`text-xs font-bold truncate ${
                                  isChecked ? 'text-teal-950' : 'text-slate-700'
                                }`}
                              >
                                {modulo.label}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                              {modulo.desc}
                            </p>

                            {restrictionReason && (
                              <div className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-0.5">
                                <Lock className="w-3 h-3 shrink-0" />
                                <span className="truncate">{restrictionReason}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Permissões operacionais avançadas */}
                <div className="pt-3 border-t border-slate-200">
                  <div className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-2">
                    Permissões Operacionais Complementares
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <label className="flex items-center gap-2.5 p-2 bg-slate-50 border border-slate-200 rounded cursor-pointer hover:bg-slate-100">
                      <input
                        type="checkbox"
                        checked={permissoes.cadastrar_produtos || ['admin', 'almoxarife'].includes(formPerfil)}
                        disabled={formMode === 'view' || formPerfil !== 'admin'}
                        onChange={(e) => setPermissoes({ ...permissoes, cadastrar_produtos: e.target.checked })}
                        className="w-3.5 h-3.5 text-teal-600 rounded"
                      />
                      <span className="font-medium text-slate-700">Edição e cadastro de catálogo de produtos</span>
                    </label>
                    <label className="flex items-center gap-2.5 p-2 bg-slate-50 border border-slate-200 rounded cursor-pointer hover:bg-slate-100">
                      <input
                        type="checkbox"
                        checked={permissoes.analisar_requisicoes || ['admin', 'almoxarife'].includes(formPerfil)}
                        disabled={formMode === 'view' || formPerfil !== 'admin'}
                        onChange={(e) => setPermissoes({ ...permissoes, analisar_requisicoes: e.target.checked })}
                        className="w-3.5 h-3.5 text-teal-600 rounded"
                      />
                      <span className="font-medium text-slate-700">Aprovação/rejeição e baixa de requisições</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* ABA 3: HISTÓRICO & AUDITORIA */}
            {activeFormTab === 'historico' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
                <div className="p-4 bg-slate-50 rounded border border-slate-200 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                    <Clock className="w-4 h-4 text-slate-500" />
                    <span>Data de Criação do Usuário</span>
                  </div>
                  <div className="text-xs text-slate-600 font-mono">{formHistoricoCriacao}</div>
                  <p className="text-[11px] text-slate-400">Gravado automaticamente no SQLite na inserção do registro.</p>
                </div>

                <div className="p-4 bg-slate-50 rounded border border-slate-200 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                    <UserCheck className="w-4 h-4 text-slate-500" />
                    <span>Último Acesso Registrado</span>
                  </div>
                  <div className="text-xs text-slate-600 font-mono">{formHistoricoAcesso}</div>
                  <p className="text-[11px] text-slate-400">Atualizado dinamicamente em cada autenticação bem-sucedida.</p>
                </div>
              </div>
            )}

            {/* Rodapé do Formulário: Botões SALVAR e VOLTAR */}
            <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-3">
              <div>
                {formMode === 'edit' && isAdmin && editingUserId && editingUserId !== currentUser?.id && formLogin !== 'admin' && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = usuarios.find((usr) => usr.id === editingUserId);
                      if (target) setDeletingUser(target);
                    }}
                    disabled={isProcessing}
                    className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold px-4 py-2 rounded text-xs flex items-center gap-1.5 transition-all uppercase tracking-wide cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>EXCLUIR USUÁRIO</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="bg-teal-600 hover:bg-teal-700 text-white font-medium px-4 py-2 rounded text-xs flex items-center gap-1.5 transition-all shadow uppercase tracking-wide cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>VOLTAR</span>
                </button>

                {formMode !== 'view' && (
                  <button
                    type="submit"
                    disabled={isProcessing}
                    className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-medium px-5 py-2 rounded text-xs flex items-center gap-1.5 transition-all shadow uppercase tracking-wide cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    <span>{isProcessing ? 'SALVANDO...' : 'SALVAR'}</span>
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      ) : null}

      {/* =========================================================================
          SEÇÃO 2: TELA DE CONSULTA DE USUÁRIO (FILTROS + BOTÕES)
         ========================================================================= */}
      {/* Top Action Bar: + NOVO e 🔍 FILTROS */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-teal-50 text-teal-800 rounded-lg">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-800">Gestão de Usuários</h2>
            <p className="text-[11px] text-slate-500">Operadores e permissões por módulo do sistema</p>
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Código
              </label>
              <input
                type="text"
                value={filtroCodigo}
                onChange={(e) => { setFiltroCodigo(e.target.value); setCurrentPage(1); }}
                placeholder="Pesquisar por código..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded text-xs text-slate-800 focus:bg-white focus:border-teal-500 shadow-inner"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Nome
              </label>
              <input
                type="text"
                value={filtroNome}
                onChange={(e) => { setFiltroNome(e.target.value); setCurrentPage(1); }}
                placeholder="Pesquisar por nome do colaborador..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded text-xs text-slate-800 focus:bg-white focus:border-teal-500 shadow-inner"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Usuário Login
              </label>
              <input
                type="text"
                value={filtroLogin}
                onChange={(e) => { setFiltroLogin(e.target.value); setCurrentPage(1); }}
                placeholder="Pesquisar por login..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded text-xs text-slate-800 focus:bg-white focus:border-teal-500 shadow-inner"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                CPF
              </label>
              <input
                type="text"
                value={filtroCpf}
                onChange={(e) => { setFiltroCpf(e.target.value); setCurrentPage(1); }}
                placeholder="Pesquisar por CPF..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded text-xs text-slate-800 focus:bg-white focus:border-teal-500 shadow-inner"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                E-mail
              </label>
              <input
                type="text"
                value={filtroEmail}
                onChange={(e) => { setFiltroEmail(e.target.value); setCurrentPage(1); }}
                placeholder="Pesquisar por e-mail..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded text-xs text-slate-800 focus:bg-white focus:border-teal-500 shadow-inner"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Ativo
              </label>
              <SearchableSelect
                options={filtroAtivoOptions}
                value={filtroAtivo}
                onChange={(val) => { setFiltroAtivo(val as any); setCurrentPage(1); }}
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

      {/* =========================================================================
          SEÇÃO 3: GRID DE RESULTADOS (ZEBRADA) + PAGINAÇÃO
         ========================================================================= */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3">Código</th>
                <th className="py-2.5 px-3">Nome</th>
                <th className="py-2.5 px-3">Usuário Login</th>
                <th className="py-2.5 px-3">CPF</th>
                <th className="py-2.5 px-3">E-mail</th>
                <th className="py-2.5 px-3 text-center">Perfil</th>
                <th className="py-2.5 px-3">Centro de Custo</th>
                <th className="py-2.5 px-3 text-center">Ativo</th>
                <th className="py-2.5 px-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {paginatedUsers.length > 0 ? (
                paginatedUsers.map((u) => (
                  <tr key={u.id} className="odd:bg-white even:bg-slate-50/70 hover:bg-teal-50/40 transition-colors">
                    <td className="py-2 px-3 font-mono font-semibold text-slate-700">
                      {u.codigo || `USR-${String(u.id).padStart(4, '0')}`}
                    </td>
                    <td className="py-2 px-3 font-medium text-slate-800">{u.nome}</td>
                    <td className="py-2 px-3 font-mono text-slate-600">{u.login}</td>
                    <td className="py-2 px-3 text-slate-600">{u.cpf || '-'}</td>
                    <td className="py-2 px-3 text-slate-600">{u.email || '-'}</td>
                    <td className="py-2 px-3 text-center">{getPerfilBadge(u.perfil)}</td>
                    <td className="py-2 px-3 text-slate-600">{u.centro_custo_nome || 'Geral / Almoxarifado'}</td>
                    <td className="py-2 px-3 text-center">
                      {u.ativo ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded text-[10px] border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>SIM</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-slate-500 font-bold bg-slate-100 px-2 py-0.5 rounded text-[10px] border border-slate-200">
                          <XCircle className="w-3 h-3" />
                          <span>NÃO</span>
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleVisualizar(u)}
                          className="p-1.5 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors"
                          title="Visualizar usuário"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {isAdmin && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleEditar(u)}
                              className="p-1.5 rounded hover:bg-teal-100 text-teal-700 transition-colors cursor-pointer"
                              title="Editar usuário"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingUser(u)}
                              className="p-1.5 rounded hover:bg-rose-100 text-rose-600 transition-colors cursor-pointer"
                              title="Excluir usuário"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-500">
                    Nenhum usuário encontrado para os critérios pesquisados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Rodapé: Contador à esquerda e Paginação à direita */}
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
          <div>
            <strong>{filteredUsers.length}</strong> registro(s) encontrado(s)
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

      <ConfirmDeleteModal
        isOpen={!!deletingUser}
        title="Excluir Usuário do Sistema"
        entityCode={deletingUser?.codigo || (deletingUser ? `USR-${String(deletingUser.id).padStart(4, '0')}` : undefined)}
        entityName={deletingUser ? `${deletingUser.nome} (@${deletingUser.login})` : ''}
        description="Esta ação removerá o operador do sistema. O histórico contábil e de auditoria anterior será preservado."
        isProcessing={isProcessing}
        onConfirm={handleConfirmDelete}
        onClose={() => setDeletingUser(null)}
      />

      {/* Modal de Confirmação de Troca de Perfil */}
      {pendingPerfilChange && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="p-4 bg-teal-800 text-white flex items-center gap-2.5">
              <ShieldCheck className="w-5 h-5 text-teal-300" />
              <h3 className="text-sm font-bold tracking-wide uppercase">Alteração de Perfil de Acesso</h3>
            </div>
            <div className="p-5 space-y-3 text-xs text-slate-700">
              <p>
                Você alterou o perfil de acesso para{' '}
                <strong className="text-teal-900 uppercase underline">{pendingPerfilChange}</strong>.
              </p>
              <p className="text-slate-600 leading-relaxed">
                Deseja aplicar automaticamente os <strong>módulos padrão</strong> recomendados para esta função, ou deseja manter as seleções personalizadas atuais?
              </p>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded text-[11px] text-slate-600">
                <span className="font-semibold text-slate-800">Nota:</span> Quaisquer módulos estritamente restritos ao novo perfil serão desabilitados conforme a política de segurança hospitalar.
              </div>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingPerfilChange(null)}
                className="w-full sm:w-auto px-3 py-2 text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded text-xs font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => confirmarTrocaPerfil(false)}
                className="w-full sm:w-auto px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded text-xs font-semibold shadow-xs cursor-pointer"
              >
                Manter Seleção Atual
              </button>
              <button
                type="button"
                onClick={() => confirmarTrocaPerfil(true)}
                className="w-full sm:w-auto px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded text-xs font-semibold shadow-sm cursor-pointer"
              >
                Sim, Aplicar Módulos Padrão
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
