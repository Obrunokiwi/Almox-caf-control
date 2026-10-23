import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar.tsx';
import { TopBar } from './components/TopBar.tsx';
import { LoginView } from './components/LoginView.tsx';
import { ModuleGridView } from './components/ModuleGridView.tsx';
import { RequisicoesView } from './components/RequisicoesView.tsx';
import { EmprestimosView } from './components/EmprestimosView.tsx';
import { EntradasView } from './components/EntradasView.tsx';
import { ProdutosView } from './components/ProdutosView.tsx';
import { FornecedoresView } from './components/FornecedoresView.tsx';
import { MovimentacoesView } from './components/MovimentacoesView.tsx';
import { InventarioView } from './components/InventarioView.tsx';
import { CentrosCustoView } from './components/CentrosCustoView.tsx';
import { UsuariosView } from './components/UsuariosView.tsx';
import { RelatoriosView } from './components/RelatoriosView.tsx';
import { PerfilView } from './components/PerfilView.tsx';
import { DocumentacaoView } from './components/DocumentacaoView.tsx';
import { SecurityPasswordModal } from './components/SecurityPasswordModal.tsx';
import { BackupView } from './components/BackupView.tsx';
import { BackupConfirmationModal } from './components/BackupConfirmationModal.tsx';
import { ConfirmDeleteModal } from './components/ConfirmDeleteModal.tsx';
import { SaldoEstoqueView } from './components/SaldoEstoqueView.tsx';
import { ImportacaoCadastrosView } from './components/ImportacaoCadastrosView.tsx';
import { useToast } from './context/ToastContext.tsx';
import { Lock } from 'lucide-react';
import type { 
  Usuario, 
  CentroCusto, 
  Produto, 
  Fornecedor,
  Requisicao, 
  Emprestimo, 
  EmprestimoInstitucional,
  Movimentacao, 
  DashboardStats,
  EmpresaUnidade
} from './types/index.ts';

export default function App() {
  // Estado de Autenticação e Sessão
  const [currentUser, setCurrentUser] = useState<Usuario | null>(null);
  const [activeUnidadeId, setActiveUnidadeId] = useState<number>(1);
  const [unidades, setUnidades] = useState<EmpresaUnidade[]>([]);
  const [showSecurityModal, setShowSecurityModal] = useState<boolean>(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState<boolean>(false);

  // Navegação: Modo Grade vs Tela de Módulo
  const [isGridView, setIsGridView] = useState<boolean>(true);
  const [currentTab, setCurrentTab] = useState<string>('relatorios');
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);

  // Dados do Sistema
  const [centrosCusto, setCentrosCusto] = useState<CentroCusto[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [requisicoes, setRequisicoes] = useState<Requisicao[]>([]);
  const [emprestimos, setEmprestimos] = useState<Emprestimo[]>([]);
  const [emprestimosInstitucionais, setEmprestimosInstitucionais] = useState<EmprestimoInstitucional[]>([]);
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isDataLoaded, setIsDataLoaded] = useState<boolean>(false);

  // Modais de Criação Rápida
  const [isNovaRequisicaoOpen, setIsNovaRequisicaoOpen] = useState<boolean>(false);
  const [isNovaEntradaOpen, setIsNovaEntradaOpen] = useState<boolean>(false);
  const [isNovoEmprestimoOpen, setIsNovoEmprestimoOpen] = useState<boolean>(false);
  const [isResetDbModalOpen, setIsResetDbModalOpen] = useState<boolean>(false);
  const [isResettingDb, setIsResettingDb] = useState<boolean>(false);

  const { toast } = useToast();

  // Carrega todas as unidades cadastradas
  const loadUnidades = useCallback(async () => {
    try {
      const res = await fetch('/api/empresas-unidades');
      if (res.ok) {
        const data = await res.json();
        setUnidades(data);
      }
    } catch (err) {
      console.error('Erro ao buscar unidades:', err);
    }
  }, []);

  // Carrega dados gerais sincronizados com o servidor SQLite (sem loop de re-render)
  const currentUserId = currentUser?.id ?? null;

  const loadData = useCallback(async (overrideUserId?: number) => {
    try {
      const token = localStorage.getItem('multi_almox_token');
      if (!token) {
        return;
      }

      const areaSigla = localStorage.getItem('multi_almox_area_sigla') || currentUser?.area_sigla || 'ALM';
      const authHeader: Record<string, string> = { 
        'Authorization': `Bearer ${token}`,
        'X-Area-Sigla': areaSigla
      };

      const [
        meRes,
        statsRes,
        usersRes,
        ccRes,
        fornRes,
        prodRes,
        reqRes,
        empRes,
        empInstRes,
        movRes
      ] = await Promise.all([
        fetch('/api/auth/me', { headers: authHeader }),
        fetch('/api/dashboard/stats', { headers: authHeader }),
        fetch('/api/usuarios', { headers: authHeader }),
        fetch('/api/centros-custo', { headers: authHeader }),
        fetch('/api/fornecedores?apenas_ativos=false', { headers: authHeader }),
        fetch('/api/produtos?apenas_ativos=false', { headers: authHeader }),
        fetch('/api/requisicoes', { headers: authHeader }),
        fetch('/api/emprestimos', { headers: authHeader }),
        fetch('/api/emprestimos-institucionais', { headers: authHeader }),
        fetch('/api/movimentacoes?limite=150', { headers: authHeader }),
      ]);

      // Ignora resposta se o usuário deslogou enquanto a requisição estava em andamento
      if (!localStorage.getItem('multi_almox_token')) {
        return;
      }

      if (meRes.ok) {
        const meData = await meRes.json();
        if (meData.user) {
          setCurrentUser((prev) => {
            if (
              prev &&
              prev.id === meData.user.id &&
              prev.nome === meData.user.nome &&
              prev.perfil === meData.user.perfil &&
              prev.area_sigla === meData.user.area_sigla &&
              prev.usando_senha_padrao === meData.user.usando_senha_padrao &&
              prev.empresa_id === meData.user.empresa_id
            ) {
              return prev;
            }
            return meData.user;
          });
          if (meData.user.empresa_id) {
            setActiveUnidadeId((prevId) => prevId || meData.user.empresa_id);
          }
          if (meData.user.login === 'admin' && meData.user.usando_senha_padrao) {
            setShowSecurityModal(true);
          }
        }
      } else {
        localStorage.removeItem('multi_almox_token');
        localStorage.removeItem('multi_almox_user_id');
        localStorage.removeItem('multi_almox_area_sigla');
        setCurrentUser(null);
        return;
      }

      if (statsRes.ok) setStats(await statsRes.json());
      if (usersRes.ok) setUsuarios(await usersRes.json());
      if (ccRes.ok) setCentrosCusto(await ccRes.json());
      if (fornRes.ok) setFornecedores(await fornRes.json());
      if (prodRes.ok) setProdutos(await prodRes.json());
      if (reqRes.ok) setRequisicoes(await reqRes.json());
      if (empRes.ok) setEmprestimos(await empRes.json());
      if (empInstRes.ok) setEmprestimosInstitucionais(await empInstRes.json());
      if (movRes.ok) setMovimentacoes(await movRes.json());
    } catch (err) {
      console.error('Erro ao sincronizar dados com o servidor:', err);
    } finally {
      setIsDataLoaded(true);
    }
  }, [currentUserId, currentUser?.area_sigla]);

  useEffect(() => {
    loadUnidades();
    loadData();
  }, [loadUnidades, loadData]);

  // Unidade ativa atual
  const activeUnidade = unidades.find((u) => u.id === activeUnidadeId) || unidades[0] || null;

  // Ação de Login Formal
  const handleLoginSuccess = (user: Usuario, token: string, areaSigla: string) => {
    localStorage.setItem('multi_almox_token', token);
    localStorage.setItem('multi_almox_user_id', String(user.id));
    localStorage.setItem('multi_almox_area_sigla', areaSigla);
    setCurrentUser(user);
    setIsGridView(true);
    setCurrentTab('relatorios');
    setIsDataLoaded(false);
    toast.success('Sessão Iniciada', `Bem-vindo(a), ${user.nome} (${user.perfil.toUpperCase()}).`);
    if (user.login === 'admin' && user.usando_senha_padrao) {
      setShowSecurityModal(true);
    } else {
      setShowSecurityModal(false);
    }
    loadData(user.id);
  };

  // Alternar Área Operacional (ALM, CAF, etc.)
  const handleSwitchArea = async (newSigla: string) => {
    try {
      const token = localStorage.getItem('multi_almox_token');
      if (!token) return;

      const res = await fetch('/api/auth/trocar-area', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-Area-Sigla': newSigla
        },
        body: JSON.stringify({ area_sigla: newSigla })
      });

      const data = await res.json();
      if (res.ok && data.user) {
        localStorage.setItem('multi_almox_area_sigla', newSigla);
        if (data.token) {
          localStorage.setItem('multi_almox_token', data.token);
        }
        setCurrentUser(data.user);
        toast.success('Área Alterada', `Sessão alternada para: ${data.user.area_sigla} (${data.user.area_nome || newSigla})`);
        loadData();
      } else {
        toast.error('Erro ao Trocar Área', data.error || 'Não foi possível alternar de área.');
      }
    } catch {
      toast.error('Erro ao Trocar Área', 'Falha de comunicação com o servidor.');
    }
  };

  // Encerrar sessão (obrigatório para trocar de usuário)
  const handleLogout = () => {
    localStorage.removeItem('multi_almox_token');
    localStorage.removeItem('multi_almox_user_id');
    localStorage.removeItem('multi_almox_area_sigla');
    setCurrentUser(null);
    setIsDataLoaded(false);
    setShowSecurityModal(false);
    setIsBackupModalOpen(false);
    setIsNovaRequisicaoOpen(false);
    setIsNovaEntradaOpen(false);
    setIsNovoEmprestimoOpen(false);
    setIsGridView(true);
    setCurrentTab('relatorios');
    toast.info('Sessão Encerrada', 'Você saiu do sistema com segurança.');
  };

  // Seleção de Módulo a partir do Grid
  const handleSelectModuleFromGrid = (moduleId: string) => {
    if (moduleId === 'aprovacao-requisicoes') {
      setCurrentTab('requisicoes');
    } else {
      setCurrentTab(moduleId);
    }
    setIsGridView(false);
  };

  // Retorno ao Grid (reavalia dados atualizados do banco)
  const handleReturnToGrid = useCallback(() => {
    loadData();
    setIsGridView(true);
  }, [loadData]);

  // Limpeza de logs de acesso e auditoria
  const handleResetDb = () => {
    setIsResetDbModalOpen(true);
  };

  const handleConfirmResetDb = async () => {
    setIsResettingDb(true);
    try {
      const token = localStorage.getItem('multi_almox_token');
      const res = await fetch('/api/system/reset', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'X-Area-Sigla': currentUser?.area_sigla || 'ALM'
        },
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(
          'Logs de Acesso Limpos',
          data.message || 'Histórico de logs de acesso limpo com sucesso.'
        );
        setIsResetDbModalOpen(false);
        loadData();
      } else {
        toast.error('Erro ao Limpar Logs', data.error || 'Erro ao limpar logs de acesso.');
      }
    } catch {
      toast.error('Falha de Conexão', 'Não foi possível comunicar com o servidor.');
    } finally {
      setIsResettingDb(false);
    }
  };

  // Contadores para alertas de badges
  const pendingReqCount = stats?.kpis?.requisicoes_pendentes ?? requisicoes.filter((r) => r.status === 'pendente').length;
  const overdueLoanCount = stats?.kpis?.emprestimos_atrasados ?? emprestimos.filter((e) => e.status === 'atrasado').length;
  const lowStockCount = stats?.kpis?.itens_estoque_baixo ?? produtos.filter((p) => p.ativo !== 0 && p.quantidade_atual <= p.estoque_minimo).length;

  const isMainAdmin = currentUser?.id === 1 || currentUser?.login === 'admin';

  // Verifica se a aba atual está liberada para o usuário autenticado
  const isCurrentTabAllowed = React.useMemo(() => {
    if (!currentUser) return false;
    if (isMainAdmin) return true;

    // Normaliza abas equivalentes aos módulos
    const moduloChave =
      currentTab === 'inventarios' ? 'inventario' :
      currentTab === 'dashboard' ? 'relatorios' :
      currentTab;

    // Documentação do sistema é livre ou para administradores
    if (moduloChave === 'documentacao') return true;

    // Regra A: Requisitante NUNCA vê saldo em estoque
    if (moduloChave === 'saldo-estoque' && currentUser.perfil === 'requisitante') {
      return false;
    }

    // Regra B: Backup, Importação e Usuários são restritos a administradores
    if (['backup', 'importacao-cadastros', 'usuarios'].includes(moduloChave) && currentUser.perfil !== 'admin' && currentUser.perfil !== 'ti_dpo') {
      return false;
    }

    // Se o usuário tem lista de módulos salva, checar se contém a chave
    if (Array.isArray(currentUser.modulos)) {
      return currentUser.modulos.includes(moduloChave);
    }

    return true;
  }, [currentUser, isMainAdmin, currentTab]);

  // =========================================================================
  // 1. SE NÃO ESTIVER AUTENTICADO: EXIBE TELA DE LOGIN EM 2 COLUNAS
  // =========================================================================
  if (!currentUser) {
    return (
      <LoginView
        unidades={unidades}
        onLoginSuccess={handleLoginSuccess}
      />
    );
  }

  // =========================================================================
  // 2. SE ESTIVER NO MODO GRADE: EXIBE O DASHBOARD EM GRID DE MÓDULOS
  // =========================================================================
  if (isGridView) {
    const activeCentrosCustoCount = centrosCusto.filter((cc) => cc.ativo === 1).length;

    return (
      <>
        <ModuleGridView
          currentUser={currentUser}
          activeUnidade={activeUnidade}
          activeAreaSigla={currentUser?.area_sigla || localStorage.getItem('multi_almox_area_sigla') || 'ALM'}
          activeAreaNome={currentUser?.area_nome || 'Almoxarifado'}
          areasLiberadas={currentUser?.areas_liberadas || []}
          onSwitchArea={handleSwitchArea}
          produtos={produtos}
          requisicoes={requisicoes}
          activeCentrosCustoCount={activeCentrosCustoCount}
          centrosCustoCount={activeCentrosCustoCount}
          isDataLoaded={isDataLoaded}
          requisicoesPendentesCount={pendingReqCount}
          emprestimosAtrasadosCount={overdueLoanCount}
          itensEstoqueBaixoCount={lowStockCount}
          onSelectModule={handleSelectModuleFromGrid}
          onLogout={handleLogout}
        />
        {showSecurityModal && (
          <SecurityPasswordModal
            currentUser={currentUser}
            isOpen={showSecurityModal}
            onClose={() => setShowSecurityModal(false)}
            onPasswordChanged={() => {
              loadData();
              setShowSecurityModal(false);
            }}
          />
        )}
      </>
    );
  }

  // =========================================================================
  // 3. SE ESTIVER DENTRO DE UM MÓDULO: EXIBE A INTERFACE DE TRABALHO
  // =========================================================================
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#f8f9fa] font-sans antialiased text-slate-800">
      {/* Barra Superior em largura total com Logo sempre visível e botão para alternar o Menu Lateral */}
      <TopBar
        currentTab={currentTab}
        currentUser={currentUser}
        activeUnidade={activeUnidade}
        activeAreaSigla={currentUser?.area_sigla || localStorage.getItem('multi_almox_area_sigla') || 'ALM'}
        activeAreaNome={currentUser?.area_nome || 'Almoxarifado'}
        areasLiberadas={currentUser?.areas_liberadas || []}
        onSwitchArea={handleSwitchArea}
        produtos={produtos}
        requisicoes={requisicoes}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        onSelectTab={(tab) => setCurrentTab(tab)}
        onOpenNovaRequisicao={() => {
          setCurrentTab('requisicoes');
          setIsNovaRequisicaoOpen(true);
        }}
        onOpenNovaEntrada={() => {
          setCurrentTab('entradas');
          setIsNovaEntradaOpen(true);
        }}
        onOpenNovoEmprestimo={() => {
          setCurrentTab('emprestimos');
          setIsNovoEmprestimoOpen(true);
        }}
        onResetDb={handleResetDb}
        onGoToGrid={handleReturnToGrid}
        onLogout={handleLogout}
        onOpenBackupModal={() => setIsBackupModalOpen(true)}
      />

      {/* Área de Trabalho: Menu Lateral Ocultável + Conteúdo Principal */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {isSidebarOpen && (
          <Sidebar
            currentTab={currentTab}
            onSelectTab={(tab) => setCurrentTab(tab)}
            currentUser={currentUser}
            activeUnidade={activeUnidade}
            onGoToGrid={handleReturnToGrid}
            onLogout={handleLogout}
            onCloseSidebar={() => setIsSidebarOpen(false)}
            pendingRequisitionsCount={pendingReqCount}
            overdueLoansCount={overdueLoanCount}
            lowStockCount={lowStockCount}
          />
        )}

        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
          <main className="flex-1 p-6">
          {!isCurrentTabAllowed ? (
            <div className="max-w-xl mx-auto my-12 bg-white rounded-2xl shadow-xl border border-amber-200/80 p-8 text-center animate-fade-in">
              <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-amber-100">
                <Lock className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-bold text-slate-800 mb-2">Acesso Restrito ao Módulo</h2>
              <p className="text-sm text-slate-600 mb-6 leading-relaxed">
                Seu usuário não possui permissão ativa para acessar este módulo ou as permissões foram atualizadas pela administração do sistema.
              </p>
              <button
                onClick={handleReturnToGrid}
                className="inline-flex items-center justify-center px-5 py-2.5 bg-[#00237D] hover:bg-[#001858] text-white font-medium rounded-xl transition-all shadow-sm cursor-pointer"
              >
                Voltar ao Painel Principal
              </button>
            </div>
          ) : (
            <>
              {currentTab === 'requisicoes' && (
                <RequisicoesView
                  requisicoes={requisicoes}
                  produtos={produtos}
                  centrosCusto={centrosCusto}
                  currentUser={currentUser}
                  activeUnidade={activeUnidade}
                  onRefresh={loadData}
                  isCreateModalOpen={isNovaRequisicaoOpen}
                  setIsCreateModalOpen={setIsNovaRequisicaoOpen}
                  onVoltar={handleReturnToGrid}
                  onNavigate={(tab) => setCurrentTab(tab)}
                />
              )}

              {currentTab === 'fornecedores' && (
                <FornecedoresView
                  fornecedores={fornecedores}
                  currentUser={currentUser}
                  onRefresh={loadData}
                  onVoltar={handleReturnToGrid}
                  onNavigate={(tab) => setCurrentTab(tab)}
                />
              )}

              {currentTab === 'emprestimos' && (
                <EmprestimosView
                  emprestimos={emprestimos}
                  emprestimosInstitucionais={emprestimosInstitucionais}
                  produtos={produtos}
                  fornecedores={fornecedores}
                  centrosCusto={centrosCusto}
                  usuarios={usuarios}
                  currentUser={currentUser}
                  activeUnidade={activeUnidade}
                  onRefresh={loadData}
                  isCreateModalOpen={isNovoEmprestimoOpen}
                  setIsCreateModalOpen={setIsNovoEmprestimoOpen}
                  onVoltar={handleReturnToGrid}
                  onNavigate={(tab) => setCurrentTab(tab)}
                />
              )}

              {currentTab === 'saldo-estoque' && (
                <SaldoEstoqueView
                  produtos={produtos}
                  centrosCusto={centrosCusto}
                  movimentacoes={movimentacoes}
                  currentUser={currentUser}
                  onRefresh={loadData}
                  onVoltar={handleReturnToGrid}
                />
              )}

              {currentTab === 'entradas' && (
                <EntradasView
                  produtos={produtos}
                  fornecedores={fornecedores}
                  centrosCusto={centrosCusto}
                  movimentacoes={movimentacoes}
                  currentUser={currentUser}
                  activeUnidade={activeUnidade}
                  onRefresh={loadData}
                  isCreateModalOpen={isNovaEntradaOpen}
                  setIsCreateModalOpen={setIsNovaEntradaOpen}
                  onVoltar={handleReturnToGrid}
                  onNavigate={(tab) => setCurrentTab(tab)}
                />
              )}

              {currentTab === 'produtos' && (
                <ProdutosView
                  produtos={produtos}
                  currentUser={currentUser}
                  onRefresh={loadData}
                  onVoltar={handleReturnToGrid}
                  onNavigate={(tab) => setCurrentTab(tab)}
                />
              )}

              {currentTab === 'movimentacoes' && (
                <MovimentacoesView
                  movimentacoes={movimentacoes}
                  produtos={produtos}
                  fornecedores={fornecedores}
                  centrosCusto={centrosCusto}
                  currentUser={currentUser}
                  activeUnidade={activeUnidade}
                  onRefresh={loadData}
                  onVoltar={handleReturnToGrid}
                />
              )}

              {currentTab === 'inventarios' && (
                <InventarioView
                  currentUser={currentUser}
                  activeUnidade={activeUnidade}
                  centrosCusto={centrosCusto}
                  produtos={produtos}
                  onRefresh={loadData}
                  onVoltar={handleReturnToGrid}
                  onNavigate={(tab) => setCurrentTab(tab)}
                />
              )}

              {currentTab === 'centros-custo' && (
                <CentrosCustoView
                  centrosCusto={centrosCusto}
                  unidades={unidades}
                  currentUser={currentUser}
                  onRefresh={loadData}
                  onVoltar={handleReturnToGrid}
                />
              )}

              {currentTab === 'usuarios' && (
                <UsuariosView
                  usuarios={usuarios}
                  centrosCusto={centrosCusto}
                  unidades={unidades}
                  currentUser={currentUser}
                  onRefresh={loadData}
                  onVoltar={handleReturnToGrid}
                  onNavigate={(tab) => setCurrentTab(tab)}
                />
              )}

              {(currentTab === 'relatorios' || currentTab === 'dashboard') && (
                <RelatoriosView
                  centrosCusto={centrosCusto}
                  produtos={produtos}
                  movimentacoes={movimentacoes}
                  stats={stats}
                  activeUnidade={activeUnidade}
                  currentUser={currentUser}
                  onVoltar={handleReturnToGrid}
                  onNavigate={(tab) => setCurrentTab(tab)}
                />
              )}

              {currentTab === 'importacao-cadastros' && (
                <ImportacaoCadastrosView
                  currentUser={currentUser}
                  onRefresh={loadData}
                  onVoltar={handleReturnToGrid}
                />
              )}

              {currentTab === 'perfil' && (
                <PerfilView
                  currentUser={currentUser}
                  unidades={unidades}
                  activeUnidade={activeUnidade}
                  onSelectUnidade={(uid) => setActiveUnidadeId(uid)}
                  onVoltar={handleReturnToGrid}
                  onOpenBackupModal={() => setIsBackupModalOpen(true)}
                />
              )}

              {currentTab === 'backup' && currentUser?.perfil === 'admin' && (
                <BackupView
                  currentUser={currentUser}
                  onVoltar={handleReturnToGrid}
                />
              )}

              {currentTab === 'documentacao' && (
                <DocumentacaoView
                  currentUser={currentUser}
                  onRefreshDb={handleResetDb}
                />
              )}
            </>
          )}
          </main>
          <footer className="py-3 px-6 text-center text-xs text-slate-400 font-normal border-t border-slate-200/60 bg-transparent print:hidden shrink-0">
            Desenvolvido por Bruno Rocha - DPO
          </footer>
        </div>
      </div>

      {showSecurityModal && (
        <SecurityPasswordModal
          currentUser={currentUser}
          isOpen={showSecurityModal}
          onClose={() => setShowSecurityModal(false)}
          onPasswordChanged={() => {
            loadData();
            setShowSecurityModal(false);
          }}
        />
      )}

      {currentUser && currentUser.perfil === 'admin' && (
        <BackupConfirmationModal
          currentUser={currentUser}
          isOpen={isBackupModalOpen}
          onClose={() => setIsBackupModalOpen(false)}
        />
      )}

      <ConfirmDeleteModal
        isOpen={isResetDbModalOpen}
        title="Limpar Logs de Acesso e Auditoria"
        entityName="Histórico de Logs de Acesso"
        description="Esta ação excluirá o histórico de auditoria e acesso do sistema. Os dados operacionais (produtos, estoques, movimentações, requisições) serão mantidos intactos."
        isProcessing={isResettingDb}
        onConfirm={handleConfirmResetDb}
        onClose={() => setIsResetDbModalOpen(false)}
      />
    </div>
  );
}
