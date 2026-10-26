import React, { useState, useRef, useEffect } from 'react';
import {
  Plus,
  RefreshCw,
  PackagePlus,
  LayoutGrid,
  LogOut,
  HardDriveDownload,
  ChevronRight,
  ChevronDown,
  Search,
  ClipboardList,
  RotateCcw,
  User,
  Truck,
  Package,
  ArrowLeftRight,
  FileBarChart,
  Building2,
  Users,
  CheckSquare,
  CornerDownLeft,
  X,
  PanelLeft,
  PanelLeftClose,
  Boxes,
  Layers,
  ArrowRight
} from 'lucide-react';
import type { Usuario, EmpresaUnidade, Produto, Requisicao, Area } from '../types/index.ts';
import { NotificationsDropdown } from './NotificationsDropdown.tsx';

interface TopBarProps {
  currentTab: string;
  currentUser: Usuario | null;
  activeUnidade?: EmpresaUnidade | null;
  activeAreaSigla?: string;
  activeAreaNome?: string;
  areasLiberadas?: Array<{ id: number; sigla: string; nome: string }>;
  onSwitchArea?: (sigla: string) => void;
  produtos?: Produto[];
  requisicoes?: Requisicao[];
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  onSelectTab?: (tab: string) => void;
  onOpenNovaRequisicao: () => void;
  onOpenNovaEntrada: () => void;
  onOpenNovoEmprestimo: () => void;
  onOpenNovoConsumo?: () => void;
  onResetDb: () => void;
  onGoToGrid: () => void;
  onLogout: () => void;
  onOpenBackupModal?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  currentTab,
  currentUser,
  activeUnidade,
  activeAreaSigla = 'ALM',
  activeAreaNome = 'Almoxarifado',
  areasLiberadas = [],
  onSwitchArea,
  produtos = [],
  requisicoes = [],
  isSidebarOpen = false,
  onToggleSidebar,
  onSelectTab,
  onOpenNovaRequisicao,
  onOpenNovaEntrada,
  onOpenNovoEmprestimo,
  onOpenNovoConsumo,
  onResetDb,
  onGoToGrid,
  onLogout,
  onOpenBackupModal,
}) => {
  const [isSwitchAreaModalOpen, setIsSwitchAreaModalOpen] = useState(false);
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');

  const quickCreateRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const commandInputRef = useRef<HTMLInputElement>(null);

  const isAlmoxarifeOrAdmin =
    currentUser?.perfil === 'admin' || currentUser?.perfil === 'almoxarife';

  // Fechar popovers ao clicar fora e atalho global Ctrl+K / Cmd+K
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (quickCreateRef.current && !quickCreateRef.current.contains(event.target as Node)) {
        setIsQuickCreateOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsCommandOpen((prev) => !prev);
      } else if (event.key === 'Escape') {
        setIsQuickCreateOpen(false);
        setIsUserMenuOpen(false);
        setIsCommandOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (isCommandOpen) {
      setCommandQuery('');
      setTimeout(() => commandInputRef.current?.focus(), 30);
    }
  }, [isCommandOpen]);

  const getTabTitle = (tab: string) => {
    switch (tab) {
      case 'consumo': return 'Consumo Direto';
      case 'kardex': return 'Kardex do Produto';
      case 'lista-compras': return 'Lista de Compras / Reposição';
      case 'areas': return 'Áreas Operacionais';
      case 'relatorios-outras-areas': return 'Relatórios de Outras Áreas';
      case 'fornecedores': return 'Fornecedores e Entidades';
      case 'produtos': return 'Produtos e Catálogo';
      case 'entradas': return 'Entrada de Nota Fiscal';
      case 'movimentacoes': return 'Movimentações Diversas';
      case 'inventarios': return 'Inventário do Estoque';
      case 'emprestimos': return 'Empréstimos Institucionais';
      case 'requisicoes': return 'Requisições de Insumos';
      case 'aprovacao-requisicoes': return 'Aprovação de Requisições';
      case 'centros-custo': return 'Centros de Custo';
      case 'usuarios': return 'Usuários e Operadores';
      case 'relatorios': return 'Relatórios e Geral PDF';
      case 'perfil': return 'Perfil do Operador';
      case 'backup': return 'Backup e Exportação';
      case 'documentacao': return 'Documentação Técnica';
      default: return 'Almoxarifado';
    }
  };

  const getInitials = (name?: string) => {
    if (!name) return 'OP';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const getShortName = (name?: string) => {
    if (!name) return 'Operador';
    const parts = name.trim().split(/\s+/);
    return parts.slice(0, 2).join(' ');
  };

  const getPerfilLabel = (perfil?: string) => {
    switch (perfil) {
      case 'admin': return 'Administrador';
      case 'almoxarife': return 'Almoxarife';
      case 'requisitante': return 'Requisitante';
      default: return 'Operador';
    }
  };

  // Opções para a Paleta de Comando Rápida (Ctrl+K)
  const commandItems = [
    {
      id: 'act-req',
      group: 'Ações Rápidas',
      label: 'Nova Requisição de Insumos',
      hint: 'Abrir formulário de pedido',
      icon: Plus,
      action: () => {
        onOpenNovaRequisicao();
        setIsCommandOpen(false);
      },
      allowed: true,
    },
    {
      id: 'act-nf',
      group: 'Ações Rápidas',
      label: 'Lançar Entrada por Nota Fiscal',
      hint: 'Registrar NF e lote no estoque',
      icon: PackagePlus,
      action: () => {
        onOpenNovaEntrada();
        setIsCommandOpen(false);
      },
      allowed: isAlmoxarifeOrAdmin,
    },
    {
      id: 'act-emp',
      group: 'Ações Rápidas',
      label: 'Registrar Empréstimo entre Entidades',
      hint: 'Empréstimo recebido ou concedido',
      icon: RotateCcw,
      action: () => {
        onOpenNovoEmprestimo();
        setIsCommandOpen(false);
      },
      allowed: true,
    },
    {
      id: 'nav-fornecedores',
      group: 'Navegação',
      label: 'Fornecedores e Entidades Parceiras',
      hint: 'Etapa 1 · Cadastro comercial e hospitais',
      icon: Truck,
      action: () => {
        onSelectTab?.('fornecedores');
        setIsCommandOpen(false);
      },
      allowed: true,
    },
    {
      id: 'nav-produtos',
      group: 'Navegação',
      label: 'Produtos e Catálogo (Código Único)',
      hint: 'Etapa 2 · Catálogo padronizado e lotes',
      icon: Package,
      action: () => {
        onSelectTab?.('produtos');
        setIsCommandOpen(false);
      },
      allowed: true,
    },
    {
      id: 'nav-entradas',
      group: 'Navegação',
      label: 'Entrada por Nota Fiscal',
      hint: 'Etapa 3 · Lançamento de documentos',
      icon: PackagePlus,
      action: () => {
        onSelectTab?.('entradas');
        setIsCommandOpen(false);
      },
      allowed: isAlmoxarifeOrAdmin,
    },
    {
      id: 'nav-movimentacoes',
      group: 'Navegação',
      label: 'Movimentações Diversas e Livro-Caixa',
      hint: 'Descartes, ajustes e histórico',
      icon: ArrowLeftRight,
      action: () => {
        onSelectTab?.('movimentacoes');
        setIsCommandOpen(false);
      },
      allowed: isAlmoxarifeOrAdmin,
    },
    {
      id: 'nav-inventarios',
      group: 'Navegação',
      label: 'Inventário do Estoque (Recontagem)',
      hint: 'Auditoria e ajuste físico de saldo',
      icon: Boxes,
      action: () => {
        onSelectTab?.('inventarios');
        setIsCommandOpen(false);
      },
      allowed: isAlmoxarifeOrAdmin,
    },
    {
      id: 'nav-emprestimos',
      group: 'Navegação',
      label: 'Empréstimos Institucionais',
      hint: 'Controle e termos com assinatura',
      icon: RotateCcw,
      action: () => {
        onSelectTab?.('emprestimos');
        setIsCommandOpen(false);
      },
      allowed: true,
    },
    {
      id: 'nav-requisicoes',
      group: 'Navegação',
      label: 'Requisições de Insumos',
      hint: 'Pedidos dos setores hospitalares',
      icon: ClipboardList,
      action: () => {
        onSelectTab?.('requisicoes');
        setIsCommandOpen(false);
      },
      allowed: true,
    },
    {
      id: 'nav-aprovacoes',
      group: 'Navegação',
      label: 'Aprovação de Requisições',
      hint: 'Triagem e baixa de lotes FEFO',
      icon: CheckSquare,
      action: () => {
        onSelectTab?.('aprovacao-requisicoes');
        setIsCommandOpen(false);
      },
      allowed: isAlmoxarifeOrAdmin,
    },
    {
      id: 'nav-relatorios',
      group: 'Navegação',
      label: 'Relatórios e Relatório Geral (PDF)',
      hint: 'Posição de estoque, validades e consumo',
      icon: FileBarChart,
      action: () => {
        onSelectTab?.('relatorios');
        setIsCommandOpen(false);
      },
      allowed: true,
    },
    {
      id: 'nav-cc',
      group: 'Navegação',
      label: 'Centros de Custo',
      hint: 'Setores e unidades assistenciais',
      icon: Building2,
      action: () => {
        onSelectTab?.('centros-custo');
        setIsCommandOpen(false);
      },
      allowed: true,
    },
    {
      id: 'nav-usuarios',
      group: 'Navegação',
      label: 'Usuários e Operadores',
      hint: 'Gestão de acessos e perfis',
      icon: Users,
      action: () => {
        onSelectTab?.('usuarios');
        setIsCommandOpen(false);
      },
      allowed: isAlmoxarifeOrAdmin,
    },
  ].filter(
    (item) =>
      item.allowed &&
      (item.label.toLowerCase().includes(commandQuery.toLowerCase()) ||
        item.hint.toLowerCase().includes(commandQuery.toLowerCase()))
  );

  return (
    <>
      <header className="relative h-14 px-5 bg-white/95 backdrop-blur-md border-b border-slate-200/80 flex items-center justify-between shrink-0 z-40 select-none">
        {/* Esquerda: Botão Ocultar/Exibir Menu Lateral + Logo Visível no Topo + Trilha Minimalista */}
        <div className="flex items-center gap-2.5 min-w-0">
          {onToggleSidebar && (
            <button
              type="button"
              onClick={onToggleSidebar}
              className={`p-2 rounded-lg transition-colors cursor-pointer shrink-0 ${
                isSidebarOpen
                  ? 'bg-slate-100 text-[#00237D]'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
              title={isSidebarOpen ? 'Ocultar menu lateral' : 'Mostrar menu lateral'}
            >
              {isSidebarOpen ? (
                <PanelLeftClose className="w-4 h-4" />
              ) : (
                <PanelLeft className="w-4 h-4" />
              )}
            </button>
          )}

          {/* Logo Institucional sempre visível no topo */}
          <button
            type="button"
            onClick={onGoToGrid}
            className="flex items-center gap-2.5 pr-1 rounded-lg hover:opacity-90 transition-opacity cursor-pointer shrink-0"
            title="Voltar ao Painel de Módulos em Grade"
          >
            <div className="w-8 h-8 rounded-lg bg-white p-0.5 shadow-2xs border border-slate-200/80 flex items-center justify-center shrink-0">
              <img src="/logo.png" alt="Logo Santa Casa SBC" className="w-full h-full object-contain" />
            </div>
            <div className="hidden sm:flex flex-col items-start leading-none">
              <span className="font-extrabold text-slate-900 text-xs tracking-tight">ALMOXCONTROL</span>
              <span className="text-[9px] text-[#00237D] font-semibold uppercase tracking-wider mt-0.5">
                Almoxarifado
              </span>
            </div>
          </button>

          <div className="h-4 w-px bg-slate-200 mx-0.5 shrink-0" />

          <button
            type="button"
            onClick={onGoToGrid}
            className="hidden md:flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100/80 text-xs font-medium transition-colors cursor-pointer shrink-0"
            title="Voltar ao Painel em Grade"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Módulos</span>
          </button>

          <ChevronRight className="w-3.5 h-3.5 text-slate-300 hidden md:inline shrink-0" />

          <h1 className="text-sm font-semibold text-slate-900 tracking-tight truncate">
            {getTabTitle(currentTab)}
          </h1>

          {/* Badge da Área Ativa e Trocar de Área */}
          <div className="flex items-center gap-1.5 pl-2 shrink-0">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-[#00237D]/10 text-[#00237D] border border-[#00237D]/20">
              <Layers className="w-3.5 h-3.5" />
              <span>Área: {activeAreaSigla}</span>
            </span>

            {(areasLiberadas.length > 1 || currentUser?.perfil === 'admin' || currentUser?.perfil === 'ti_dpo') && onSwitchArea && (
              <button
                type="button"
                onClick={() => setIsSwitchAreaModalOpen(true)}
                className="flex items-center gap-1 px-2 py-1 text-xs font-semibold text-slate-600 hover:text-[#00237D] hover:bg-slate-100 rounded-md transition-colors cursor-pointer border border-slate-200"
                title="Trocar Área de Atuação"
              >
                <ArrowLeftRight className="w-3 h-3 text-slate-500" />
                <span className="hidden lg:inline text-[11px]">Trocar de área</span>
              </button>
            )}
          </div>
        </div>

        {/* Direita: Busca Rápida (⌘K), Botão Único "+ Criar", Notificações e Perfil */}
        <div className="flex items-center gap-2">
          {/* Gatilho Minimalista de Busca / Paleta de Comandos */}
          <button
            type="button"
            onClick={() => setIsCommandOpen(true)}
            title="Buscar módulo ou executar ação rápida (Ctrl+K)"
            className="hidden md:flex items-center justify-between gap-6 px-3 py-1.5 rounded-lg bg-slate-100/70 hover:bg-slate-100 text-slate-400 hover:text-slate-600 text-xs transition-all cursor-pointer border border-transparent hover:border-slate-200/70"
          >
            <span className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <span>Ir para ou criar...</span>
            </span>
            <kbd className="text-[10px] font-mono text-slate-400 bg-white px-1.5 py-0.5 rounded border border-slate-200/70">
              ⌘K
            </kbd>
          </button>

          {/* Menu Único "+ Criar" (Concentra ações rápidas sem poluir a barra) */}
          <div className="relative" ref={quickCreateRef}>
            <button
              type="button"
              onClick={() => setIsQuickCreateOpen((prev) => !prev)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-[#00237D] text-white text-xs font-medium transition-colors cursor-pointer shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Criar</span>
              <ChevronDown
                className={`w-3 h-3 text-white/70 transition-transform duration-150 ${
                  isQuickCreateOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {isQuickCreateOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-200/90 py-1.5 z-50 text-slate-800">
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Operações Rápidas
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setIsQuickCreateOpen(false);
                    onOpenNovaRequisicao();
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-start gap-2.5 transition-colors cursor-pointer"
                >
                  <ClipboardList className="w-4 h-4 text-[#00237D] mt-0.5 shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-slate-800">Nova Requisição</div>
                    <div className="text-[11px] text-slate-400">Solicitar insumos à área ativa</div>
                  </div>
                </button>

                {isAlmoxarifeOrAdmin && onOpenNovoConsumo && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsQuickCreateOpen(false);
                      onOpenNovoConsumo();
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-start gap-2.5 transition-colors cursor-pointer"
                  >
                    <Boxes className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-xs font-semibold text-slate-800">Novo Consumo Direto</div>
                      <div className="text-[11px] text-slate-400">Entrega para setor sem requisição</div>
                    </div>
                  </button>
                )}

                {isAlmoxarifeOrAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsQuickCreateOpen(false);
                      onOpenNovaEntrada();
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-start gap-2.5 transition-colors cursor-pointer"
                  >
                    <PackagePlus className="w-4 h-4 text-teal-600 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-xs font-semibold text-slate-800">Entrada de Nota Fiscal</div>
                      <div className="text-[11px] text-slate-400">Registrar NF e lote no estoque</div>
                    </div>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setIsQuickCreateOpen(false);
                    onOpenNovoEmprestimo();
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-start gap-2.5 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-slate-800">Empréstimo Institucional</div>
                    <div className="text-[11px] text-slate-400">Registrar troca com outra unidade</div>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Sino de Notificações Minimalista */}
          <NotificationsDropdown
            produtos={produtos}
            requisicoes={requisicoes}
            currentUser={currentUser}
            onNavigate={(tab) => onSelectTab && onSelectTab(tab)}
            variant="light"
          />

          {/* Divisor sutil */}
          <div className="h-4 w-px bg-slate-200 mx-0.5" />

          {/* Menu do Operador & Ferramentas de Sistema */}
          <div className="relative" ref={userMenuRef}>
            <button
              type="button"
              onClick={() => setIsUserMenuOpen((prev) => !prev)}
              className="flex items-center gap-2 pl-1.5 pr-2 py-1 rounded-lg hover:bg-slate-100/80 transition-colors cursor-pointer"
              title="Conta do operador e ferramentas do sistema"
            >
              <div className="w-7 h-7 rounded-full bg-slate-900 text-white text-[11px] font-semibold flex items-center justify-center shrink-0">
                {getInitials(currentUser?.nome)}
              </div>
              <span className="text-xs font-medium text-slate-700 hidden sm:inline max-w-[130px] truncate">
                {getShortName(currentUser?.nome)}
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 ${
                  isUserMenuOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {isUserMenuOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-200/90 py-1.5 z-50 text-slate-800">
                {/* Identificação limpa do operador */}
                <div className="px-3.5 py-2.5 border-b border-slate-100">
                  <div className="text-xs font-semibold text-slate-900 truncate">
                    {currentUser?.nome}
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
                    <span>{getPerfilLabel(currentUser?.perfil)}</span>
                    <span aria-hidden="true">·</span>
                    <span className="truncate">{activeUnidade?.codigo || 'Central'}</span>
                  </div>
                </div>

                {/* Atalhos de Conta */}
                <div className="py-1">
                  <button
                    type="button"
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      onSelectTab?.('perfil');
                    }}
                    className="w-full px-3.5 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    <span>Meu Perfil e Unidade</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      onGoToGrid();
                    }}
                    className="w-full px-3.5 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <LayoutGrid className="w-3.5 h-3.5 text-slate-400" />
                    <span>Painel de Módulos em Grade</span>
                  </button>
                </div>

                {/* Ferramentas Administrativas (se Admin) */}
                {currentUser?.perfil === 'admin' && (
                  <div className="py-1 border-t border-slate-100">
                    <div className="px-3.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Administração da Base
                    </div>
                    {onOpenBackupModal && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          onOpenBackupModal();
                        }}
                        className="w-full px-3.5 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition-colors cursor-pointer"
                      >
                        <HardDriveDownload className="w-3.5 h-3.5 text-teal-600" />
                        <span>Exportar Backup (.DB)</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        onResetDb();
                      }}
                      className="w-full px-3.5 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                      <span>Restaurar Base Inicial</span>
                    </button>
                  </div>
                )}

                {/* Encerrar Sessão */}
                <div className="pt-1 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      onLogout();
                    }}
                    className="w-full px-3.5 py-2 text-left text-xs font-medium text-rose-600 hover:bg-rose-50/70 flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Encerrar Sessão</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Paleta de Comandos Flutuante (Ctrl+K / ⌘K) */}
      {isCommandOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-start justify-center pt-20 px-4"
          onClick={() => setIsCommandOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden select-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                ref={commandInputRef}
                type="text"
                value={commandQuery}
                onChange={(e) => setCommandQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && commandItems.length > 0) {
                    commandItems[0].action();
                  }
                }}
                placeholder="Digite um módulo ou operação rápida..."
                className="w-full text-sm text-slate-800 placeholder-slate-400 focus:outline-none bg-transparent"
              />
              <button
                type="button"
                onClick={() => setIsCommandOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto p-2 space-y-1">
              {commandItems.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  Nenhum módulo ou ação encontrada para "{commandQuery}".
                </div>
              ) : (
                commandItems.map((item, idx) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={item.action}
                      className={`w-full px-3 py-2.5 rounded-xl text-left flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                        idx === 0 ? 'bg-slate-100/80 hover:bg-slate-100' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-800 truncate">
                            {item.label}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate">{item.hint}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 shrink-0">
                        <span>{item.group}</span>
                        <CornerDownLeft className="w-3 h-3" />
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
              <span>Pressione <strong className="text-slate-600">Enter</strong> para abrir o primeiro resultado</span>
              <span><strong className="text-slate-600">ESC</strong> para fechar</span>
            </div>
          </div>
        </div>
      )}
      {/* Modal Trocar de Área */}
      {isSwitchAreaModalOpen && onSwitchArea && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-[#00237D]" />
                <h3 className="text-sm font-bold text-slate-900">
                  Trocar Área de Atuação
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSwitchAreaModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-4">
              Selecione a área para onde deseja alternar sua sessão. Os dados na tela serão recarregados com a base da área selecionada.
            </p>

            <div className="space-y-2 mb-4">
              {areasLiberadas.map((a) => {
                const isCurrent = a.sigla.toUpperCase() === activeAreaSigla.toUpperCase();
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      setIsSwitchAreaModalOpen(false);
                      if (!isCurrent) {
                        onSwitchArea(a.sigla);
                      }
                    }}
                    className={`w-full p-3 rounded-lg border text-left flex items-center justify-between transition-colors cursor-pointer ${
                      isCurrent
                        ? 'border-[#00237D] bg-blue-50/50 text-[#00237D]'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-bold flex items-center gap-2">
                        <span>{a.sigla} — {a.nome}</span>
                        {isCurrent && (
                          <span className="text-[10px] font-bold uppercase bg-[#00237D] text-white px-1.5 py-0.2 rounded">
                            Ativa
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {a.sigla === 'CAF' ? 'Central de Medicamentos' : 'Insumos e Materiais'}
                      </div>
                    </div>
                    {!isCurrent && <ArrowRight className="w-4 h-4 text-slate-400" />}
                  </button>
                );
              })}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsSwitchAreaModalOpen(false)}
                className="px-3.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
