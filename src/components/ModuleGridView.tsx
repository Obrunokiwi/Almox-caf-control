import React, { useState, useMemo } from 'react';
import {
  Users,
  Building2,
  Package,
  PackagePlus,
  ClipboardList,
  CheckSquare,
  RotateCcw,
  FileBarChart,
  UserCheck,
  Search,
  LogOut,
  Hospital,
  Sparkles,
  ArrowRight,
  HardDriveDownload,
  Truck,
  ArrowLeftRight,
  Boxes,
  PackageCheck,
  AlertCircle,
  FileSpreadsheet,
  Layers,
  BookOpen,
  ShoppingBag,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import type { Usuario, EmpresaUnidade, Produto, Requisicao } from '../types/index.ts';
import { NotificationsDropdown } from './NotificationsDropdown.tsx';

interface ModuleGridViewProps {
  currentUser: Usuario;
  activeUnidade?: EmpresaUnidade | null;
  activeAreaSigla?: string;
  activeAreaNome?: string;
  areasLiberadas?: Array<{ id: number; sigla: string; nome: string }>;
  onSwitchArea?: (sigla: string) => void;
  produtos?: Produto[];
  requisicoes?: Requisicao[];
  centrosCustoCount?: number;
  activeCentrosCustoCount?: number;
  isDataLoaded?: boolean;
  requisicoesPendentesCount: number;
  emprestimosAtrasadosCount: number;
  itensEstoqueBaixoCount: number;
  onSelectModule: (moduleId: string) => void;
  onLogout: () => void;
}

export const ModuleGridView: React.FC<ModuleGridViewProps> = ({
  currentUser,
  activeUnidade,
  activeAreaSigla = 'ALM',
  activeAreaNome = 'Almoxarifado',
  areasLiberadas = [],
  onSwitchArea,
  produtos = [],
  requisicoes = [],
  centrosCustoCount = 0,
  activeCentrosCustoCount,
  isDataLoaded = false,
  requisicoesPendentesCount,
  emprestimosAtrasadosCount,
  itensEstoqueBaixoCount,
  onSelectModule,
  onLogout,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const effectiveActiveCcCount = activeCentrosCustoCount !== undefined ? activeCentrosCustoCount : centrosCustoCount;
  const shouldShowEmptyCentroCusto = isDataLoaded && currentUser.perfil === 'admin' && effectiveActiveCcCount === 0;

  // Lista de módulos com regras de visibilidade por perfil e separação estrutural de cadastros
  const allModules = [
    {
      id: 'fornecedores',
      label: 'Fornecedores / Entidades',
      descricao: 'Cadastro próprio de fornecedores comerciais e hospitais parceiros',
      icon: Truck,
      badge: 'Etapa 1',
      badgeColor: 'bg-teal-600 text-white',
      allowedRoles: ['admin', 'almoxarife', 'requisitante'],
    },
    {
      id: 'produtos',
      label: 'Produtos / Catálogo',
      descricao: 'Catálogo com código único interno, estoque mín/máx e lotes',
      icon: Package,
      badge: itensEstoqueBaixoCount > 0 ? `${itensEstoqueBaixoCount} crítico` : 'Etapa 2',
      badgeColor: itensEstoqueBaixoCount > 0 ? 'bg-rose-500 text-white' : 'bg-teal-600 text-white',
      allowedRoles: ['admin', 'almoxarife', 'requisitante'],
    },
    {
      id: 'saldo-estoque',
      label: 'Consulta de Saldo em Estoque',
      descricao: 'Conferência detalhada de saldo total, lotes FEFO e valores em estoque',
      icon: PackageCheck,
      badge: 'Consulta',
      badgeColor: 'bg-teal-600 text-white',
      allowedRoles: ['admin', 'almoxarife'],
    },
    {
      id: 'kardex',
      label: 'Kardex do Produto',
      descricao: 'Extrato cronológico detalhado de entradas, saídas e evolução de saldo',
      icon: BookOpen,
      badge: 'Físico/Financeiro',
      badgeColor: 'bg-indigo-600 text-white',
      allowedRoles: ['admin', 'almoxarife'],
    },
    {
      id: 'lista-compras',
      label: 'Lista de Compras / Reposição',
      descricao: 'Relatório gerencial de estimativa e sugestão de reposição de estoque',
      icon: ShoppingBag,
      badge: 'Reposição',
      badgeColor: 'bg-[#00237D] text-white',
      allowedRoles: ['admin', 'almoxarife'],
    },
    {
      id: 'entradas',
      label: 'Entrada por Nota Fiscal',
      descricao: 'Operação separada de entrada de NF vinculada ao código interno e lote',
      icon: PackagePlus,
      badge: 'Etapa 3',
      badgeColor: 'bg-blue-600 text-white',
      allowedRoles: ['admin', 'almoxarife'],
    },
    {
      id: 'movimentacoes',
      label: 'Movimentações Diversas',
      descricao: 'Saídas por vencimento/descarte, avaria, perda, doação e livro-caixa',
      icon: ArrowLeftRight,
      badge: null,
      allowedRoles: ['admin', 'almoxarife'],
    },
    {
      id: 'inventarios',
      label: 'Inventário do Estoque',
      descricao: 'Recontagem física, auditoria e ajuste de saldo por centro de custo e lote',
      icon: Boxes,
      badge: 'Contagem',
      badgeColor: 'bg-emerald-600 text-white',
      allowedRoles: ['admin', 'almoxarife'],
    },
    {
      id: 'emprestimos',
      label: 'Empréstimos entre Entidades',
      descricao: 'Empréstimo recebido/concedido entre hospitais e ficha com assinaturas',
      icon: RotateCcw,
      badge: emprestimosAtrasadosCount > 0 ? `${emprestimosAtrasadosCount} pendente(s)` : null,
      badgeColor: 'bg-rose-500 text-white',
      allowedRoles: ['admin', 'almoxarife', 'requisitante'],
    },
    {
      id: 'requisicoes',
      label: 'Requisição',
      descricao: 'Abertura e acompanhamento de pedidos de insumos dos setores',
      icon: ClipboardList,
      badge: null,
      allowedRoles: ['admin', 'almoxarife', 'requisitante'],
    },
    {
      id: 'aprovacao-requisicoes',
      label: 'Aprovação de Requisições',
      descricao: 'Análise pelo almoxarifado, bloqueio de lote vencido e baixa FEFO',
      icon: CheckSquare,
      badge: requisicoesPendentesCount > 0 ? `${requisicoesPendentesCount} pendente(s)` : null,
      badgeColor: 'bg-amber-400 text-slate-900',
      allowedRoles: ['admin', 'almoxarife'],
    },
    {
      id: 'centros-custo',
      label: 'Centros de Custo',
      descricao: 'Departamentos e setores hospitalares',
      icon: Building2,
      badge: null,
      allowedRoles: ['admin', 'almoxarife'],
    },
    {
      id: 'usuarios',
      label: 'Usuário',
      descricao: 'Consulta, cadastro e permissões de operadores',
      icon: Users,
      badge: null,
      allowedRoles: ['admin', 'almoxarife'],
    },
    {
      id: 'relatorios',
      label: 'Relatórios & Geral PDF',
      descricao: 'Relatório Geral Impresso/PDF, validade (30/60/90d) e posição de estoque',
      icon: FileBarChart,
      badge: 'Relatório Geral',
      badgeColor: 'bg-teal-500/80 text-white',
      allowedRoles: ['admin', 'almoxarife', 'requisitante'],
    },
    {
      id: 'perfil',
      label: 'Perfil',
      descricao: 'Dados da conta, permissões e histórico de acessos',
      icon: UserCheck,
      badge: null,
      allowedRoles: ['admin', 'almoxarife', 'requisitante'],
    },
    {
      id: 'importacao-cadastros',
      label: 'Importação de Cadastros',
      descricao: 'Importar produtos (.xls/.xlsx/.csv) e fornecedores com validação de duplicidade e prévia',
      icon: FileSpreadsheet,
      badge: 'Admin',
      badgeColor: 'bg-indigo-600 text-white',
      allowedRoles: ['admin'],
    },
    {
      id: 'backup',
      label: 'Backup / Exportar Dados',
      descricao: 'Download seguro do SQLite (.db), script SQL (.sql) ou JSON',
      icon: HardDriveDownload,
      badge: 'Admin',
      badgeColor: 'bg-emerald-600 text-white',
      allowedRoles: ['admin'],
    },
  ];

  // Filtra por perfil do usuário e matriz de módulos liberados
  const isMainAdmin = currentUser.id === 1 || currentUser.login.toLowerCase() === 'admin';
  const userModulos = currentUser.modulos || [];

  const filteredModules = useMemo(() => {
    return allModules
      .filter((mod) => {
        // Regra 1: Administrador principal possui acesso irrestrito
        if (isMainAdmin) return true;
        // Regra 2: Saldo de estoque nunca é liberado ao requisitante
        if (currentUser.perfil === 'requisitante' && mod.id === 'saldo-estoque') return false;
        // Regra 3: Checagem de perfil base
        if (!mod.allowedRoles.includes(currentUser.perfil)) return false;
        // Regra 4: Checagem da matriz de módulos liberados configurada no cadastro do usuário
        if (userModulos.length > 0) {
          const modKeyNorm = mod.id === 'inventarios' ? 'inventario' : mod.id;
          return userModulos.includes(modKeyNorm) || userModulos.includes(mod.id);
        }
        return true;
      })
      .filter((mod) => 
        mod.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
        mod.descricao.toLowerCase().includes(searchTerm.toLowerCase())
      );
  }, [allModules, isMainAdmin, currentUser.perfil, userModulos, searchTerm]);

  // Paginação de Módulos (15 por página)
  const [currentPage, setCurrentPage] = useState(1);
  const [slideDirection, setSlideDirection] = useState<'right' | 'left'>('right');
  const pageSize = 15;

  const totalPages = useMemo(() => Math.ceil(filteredModules.length / pageSize) || 1, [filteredModules.length, pageSize]);

  const paginatedModules = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredModules.slice(start, start + pageSize);
  }, [filteredModules, currentPage, pageSize]);

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setSlideDirection('right');
      setCurrentPage((p) => p + 1);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setSlideDirection('left');
      setCurrentPage((p) => p - 1);
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setSlideDirection('right');
    setCurrentPage(1);
  };

  const getPerfilLabel = (p: string) => {
    switch (p) {
      case 'admin': return 'Administrador';
      case 'almoxarife': return 'Almoxarife';
      case 'requisitante': return 'Requisitante';
      default: return p;
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col bg-gradient-to-br from-[#091535] via-[#102456] to-[#070e24] text-white font-sans select-none">
      {/* =========================================================================
          CABEÇALHO SUPERIOR: Identificação, Unidade e Busca
         ========================================================================= */}
      <header className="relative z-[100] w-full h-16 px-8 flex items-center justify-between gap-4 border-b border-white/10 bg-[#091535]/95 backdrop-blur-md">
        {/* Identificação do Sistema Minimalista */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-white p-1 shadow-xs flex items-center justify-center shrink-0">
            <img src="/logo.png" alt="Logo Santa Casa S.B.C - Multihospital" className="w-full h-full object-contain" />
          </div>
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-sm font-bold tracking-wide text-white">ALMOXCONTROL</span>
            <span aria-hidden="true" className="text-white/25 hidden sm:inline">·</span>
            <span className="text-xs text-blue-200/70 hidden sm:inline truncate">
              {activeUnidade ? `${activeUnidade.codigo} — ${activeUnidade.nome}` : 'Almoxarifado Central'}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-teal-500/20 text-teal-200 border border-teal-400/30 shrink-0">
              <Layers className="w-3 h-3 text-teal-300" />
              <span>Área: {activeAreaSigla}</span>
            </span>
          </div>
        </div>

        {/* Busca Minimalista no Centro */}
        <div className="w-56 md:w-72 relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-blue-200/50">
            <Search className="w-3.5 h-3.5" />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={handleSearchChange}
            placeholder="Filtrar módulos..."
            className="w-full pl-8 pr-3 py-1.5 bg-white/8 border border-white/12 rounded-lg text-xs text-white placeholder-blue-200/45 focus:outline-none focus:bg-white/15 focus:border-white/30 transition-all"
          />
        </div>

        {/* Direita: Notificações, Operador e Sair */}
        <div className="relative z-[100] flex items-center justify-end gap-2">
          <NotificationsDropdown
            produtos={produtos}
            requisicoes={requisicoes}
            currentUser={currentUser}
            onNavigate={(moduleId) => onSelectModule(moduleId)}
            variant="dark"
          />

          <div className="h-4 w-px bg-white/15 mx-1" />

          <div className="hidden sm:flex items-center gap-2 text-xs text-white/90 pr-1">
            <span className="font-medium">{currentUser.nome}</span>
            <span aria-hidden="true" className="text-white/30">·</span>
            <span className="text-blue-200/70">{getPerfilLabel(currentUser.perfil)}</span>
          </div>

          <button
            type="button"
            onClick={onLogout}
            title="Encerrar sessão"
            className="p-2 rounded-lg text-white/70 hover:text-white hover:bg-rose-500/25 transition-all cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* =========================================================================
          CORPO PRINCIPAL: Grid de Ícones Translúcidos sobre o Gradiente Teal
         ========================================================================= */}
      <main className="relative z-10 flex-1 w-full max-w-6xl mx-auto px-6 py-12 flex flex-col justify-center">
        {/* Aviso de Centro de Custo Vazio */}
        {shouldShowEmptyCentroCusto && (
          <div className="mb-6 p-4 rounded-xl bg-amber-500/20 border border-amber-400/40 backdrop-blur-md flex flex-wrap items-center justify-between gap-3 animate-fadeIn">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-400 text-slate-900 rounded-lg shrink-0 font-bold">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-amber-100 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-amber-300 shrink-0" />
                  <span>Cadastre ao menos um Centro de Custo para começar</span>
                </h4>
                <p className="text-xs text-amber-200/80 mt-0.5">
                  O sistema inicia vazio. Para vincular operadores, realizar requisições e dar entrada de insumos, cadastre os centros de custo da instituição.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onSelectModule('centros-custo')}
              className="px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow transition-colors cursor-pointer"
            >
              <span>Cadastrar Centro de Custo</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Banner discreto com notificações/alertas */}
        {(requisicoesPendentesCount > 0 || emprestimosAtrasadosCount > 0 || itensEstoqueBaixoCount > 0) && (
          <div className="mb-8 p-4 rounded-xl bg-white/10 border border-white/15 backdrop-blur-md flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-teal-300" />
              <span className="text-xs font-semibold text-teal-100">
                Resumo operacional ativo para {activeUnidade?.nome || 'sua unidade'}:
              </span>
            </div>

            <div className="flex items-center gap-3">
              {requisicoesPendentesCount > 0 && (
                <button
                  type="button"
                  onClick={() => onSelectModule('aprovacao-requisicoes')}
                  className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-400/30 text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                  <span>{requisicoesPendentesCount} requisição(ões) pendente(s)</span>
                </button>
              )}

              {emprestimosAtrasadosCount > 0 && (
                <button
                  type="button"
                  onClick={() => onSelectModule('emprestimos')}
                  className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-400/30 text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse"></span>
                  <span>{emprestimosAtrasadosCount} empréstimo(s) em atraso</span>
                </button>
              )}

              {itensEstoqueBaixoCount > 0 && (
                <button
                  type="button"
                  onClick={() => onSelectModule('produtos')}
                  className="px-3 py-1.5 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 text-teal-200 border border-teal-400/30 text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <span>{itensEstoqueBaixoCount} item(ns) abaixo do estoque mínimo</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Grid de Ícones em Quadrados Arredondados com Animação de Deslize */}
        <div
          key={`page-${currentPage}-${slideDirection}`}
          className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6 sm:gap-8 justify-items-center ${
            slideDirection === 'left' ? 'animate-slide-left' : 'animate-slide-right'
          }`}
        >
          {paginatedModules.map((mod) => {
            const Icon = mod.icon;
            return (
              <button
                key={mod.id}
                onClick={() => onSelectModule(mod.id)}
                className="group relative flex flex-col items-center justify-center p-4 w-36 h-36 sm:w-40 sm:h-40 rounded-2xl bg-white/10 hover:bg-white/20 active:bg-white/25 border border-white/20 hover:border-[#6EC1E4]/50 shadow-lg hover:shadow-[#00237D]/40 backdrop-blur-md transition-all duration-200 transform hover:-translate-y-1.5 cursor-pointer text-center"
              >
                {/* Badge no canto superior direito do botão */}
                {mod.badge && (
                  <div className={`absolute -top-2 -right-2 px-2 py-0.5 rounded-full text-[10px] font-bold shadow-md uppercase tracking-wider ${mod.badgeColor || 'bg-[#C2363A] text-white'}`}>
                    {mod.badge}
                  </div>
                )}

                {/* Ícone branco de traço fino */}
                <div className="w-14 h-14 rounded-xl bg-white/15 group-hover:bg-white/25 flex items-center justify-center text-white transition-all group-hover:scale-110 mb-3 shadow-inner">
                  <Icon className="w-7 h-7 stroke-[1.6]" />
                </div>

                {/* Nome do Módulo abaixo do ícone */}
                <span className="text-xs sm:text-sm font-semibold text-white group-hover:text-[#6EC1E4] tracking-wide transition-colors leading-tight">
                  {mod.label}
                </span>

                <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-1.5 text-[10px] text-[#6EC1E4] flex items-center gap-0.5">
                  <span>Acessar</span>
                  <ArrowRight className="w-2.5 h-2.5" />
                </div>
              </button>
            );
          })}
        </div>

        {/* Paginação de Módulos (15 por página) */}
        {totalPages > 1 && (
          <div className="mt-8 flex items-center justify-center gap-4 animate-fadeIn">
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={handlePrevPage}
              className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 active:bg-white/30 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-semibold text-white border border-white/20 flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Anterior</span>
            </button>

            <span className="text-xs font-semibold text-blue-100 bg-white/10 px-3.5 py-2 rounded-xl border border-white/15 backdrop-blur-xs">
              Página {currentPage} de {totalPages} ({filteredModules.length} módulos)
            </span>

            <button
              type="button"
              disabled={currentPage === totalPages}
              onClick={handleNextPage}
              className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 active:bg-white/30 disabled:opacity-30 disabled:cursor-not-allowed text-xs font-semibold text-white border border-white/20 flex items-center gap-1.5 transition-all shadow-md cursor-pointer"
            >
              <span>Próxima</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {filteredModules.length === 0 && (
          <div className="text-center py-12 text-blue-200/70">
            Nenhum módulo encontrado para a busca &ldquo;{searchTerm}&rdquo;.
          </div>
        )}
      </main>

      {/* =========================================================================
      {/* =========================================================================
          RODAPÉ ÚNICO
         ========================================================================= */}
      <footer className="w-full py-4 text-center border-t border-white/10 bg-black/20 text-xs text-slate-400 font-normal">
        Desenvolvido por Bruno Rocha - DPO
      </footer>
    </div>
  );
};
