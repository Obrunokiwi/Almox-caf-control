import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  Lock, 
  User, 
  Eye, 
  EyeOff, 
  LogIn, 
  ShieldCheck, 
  CheckCircle2,
  AlertCircle,
  UserPlus,
  KeyRound,
  ArrowLeft,
  Mail,
  CreditCard
} from 'lucide-react';
import type { EmpresaUnidade, Usuario } from '../types/index.ts';
import { SearchableSelect, type SearchableOption } from './SearchableSelect.tsx';
import { maskCpf } from '../utils/cpfUtils.ts';

interface LoginViewProps {
  unidades?: EmpresaUnidade[];
  onLoginSuccess: (user: Usuario, token: string, areaSigla: string) => void;
}

type ViewMode = 'login' | 'cadastro' | 'esqueci-senha';

export const LoginView: React.FC<LoginViewProps> = ({
  unidades = [],
  onLoginSuccess,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('login');

  // Estados do Login
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [areas, setAreas] = useState<Array<{ id: number; sigla: string; nome: string; descricao?: string }>>([
    { id: 1, sigla: 'ALM', nome: 'Almoxarifado', descricao: 'Insumos e Materiais Médicos' },
    { id: 2, sigla: 'CAF', nome: 'CAF', descricao: 'Medicamentos' },
  ]);
  const [selectedAreaSigla, setSelectedAreaSigla] = useState<string>('ALM');
  const [showPassword, setShowPassword] = useState(false);

  // Estados de Centros de Custo (para cadastro de solicitante)
  const [centrosCusto, setCentrosCusto] = useState<Array<{ id: number; codigo: string; nome: string; departamento?: string }>>([]);

  // Estados do Cadastro de Solicitante
  const [cadNome, setCadNome] = useState('');
  const [cadLogin, setCadLogin] = useState('');
  const [cadCpf, setCadCpf] = useState('');
  const [cadEmail, setCadEmail] = useState('');
  const [cadSenha, setCadSenha] = useState('');
  const [cadConfirmarSenha, setCadConfirmarSenha] = useState('');
  const [cadCcId, setCadCcId] = useState('');
  const [cadShowSenha, setCadShowSenha] = useState(false);

  // Estados de Recuperação / Redefinição de Senha
  const [recEmail, setRecEmail] = useState('');
  const [recCpf, setRecCpf] = useState('');
  const [recNovaSenha, setRecNovaSenha] = useState('');
  const [recConfirmarSenha, setRecConfirmarSenha] = useState('');
  const [recShowSenha, setRecShowSenha] = useState(false);

  // Mensagens e Feedback
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Carrega lista de áreas ativas e centros de custo do sistema
  useEffect(() => {
    fetch('/api/areas/publicas')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setAreas(data);
          setSelectedAreaSigla(data[0].sigla);
        }
      })
      .catch(() => {});

    fetch('/api/centros-custo?apenas_ativos=true')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (Array.isArray(data)) {
          setCentrosCusto(data);
          if (data.length > 0) {
            setCadCcId(String(data[0].id));
          }
        }
      })
      .catch(() => {});
  }, []);

  const areaOptions: SearchableOption[] = areas.map((a) => ({
    value: a.sigla,
    label: `${a.sigla} — ${a.nome}`,
    secondaryLabel: a.descricao || (a.sigla === 'CAF' ? 'Medicamentos' : 'Insumos'),
  }));

  const centroCustoOptions: SearchableOption[] = centrosCusto.map((cc) => ({
    value: String(cc.id),
    label: `${cc.codigo} - ${cc.nome}`,
    secondaryLabel: cc.departamento || undefined,
  }));

  // =========================================================================
  // SUBMIT DO LOGIN
  // =========================================================================
  const handleSubmitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!login || !senha) {
      setErrorMsg('Por favor, informe seu usuário e senha.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          login: login.trim(),
          senha,
          area_sigla: selectedAreaSigla,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao autenticar.');
      }

      onLoginSuccess(data.user, data.token || '', selectedAreaSigla);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro de conexão com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  // =========================================================================
  // SUBMIT DO CADASTRO DE SOLICITANTE
  // =========================================================================
  const handleSubmitCadastro = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!cadNome.trim()) {
      setErrorMsg('Por favor, informe seu Nome Completo.');
      return;
    }
    if (!cadLogin.trim()) {
      setErrorMsg('Por favor, informe o Usuário / Login desejado.');
      return;
    }

    const cleanCpfVal = cadCpf.replace(/\D/g, '');
    if (cleanCpfVal.length !== 11) {
      setErrorMsg('O CPF é obrigatório e deve conter exatamente 11 dígitos no formato 000.000.000-00.');
      return;
    }

    if (!cadEmail.trim() || !cadEmail.includes('@')) {
      setErrorMsg('Por favor, informe um E-mail institucional válido.');
      return;
    }

    if (!cadCcId) {
      setErrorMsg('Selecione o seu Centro de Custo / Setor Solicitante.');
      return;
    }

    if (!cadSenha || cadSenha.length < 4) {
      setErrorMsg('A senha de acesso deve ter pelo menos 4 caracteres.');
      return;
    }

    if (cadSenha !== cadConfirmarSenha) {
      setErrorMsg('A confirmação da senha não confere com a senha digitada.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/cadastrar-solicitante', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: cadNome.trim(),
          login: cadLogin.trim().toLowerCase(),
          cpf: cadCpf,
          email: cadEmail.trim().toLowerCase(),
          senha: cadSenha,
          centro_custo_id: Number(cadCcId),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao realizar cadastro.');
      }

      setSuccessMsg(data.message || 'Cadastro realizado com sucesso! Faça seu login.');
      setLogin(data.login || cadLogin.trim().toLowerCase());
      setSenha('');
      // Limpa campos do cadastro
      setCadNome('');
      setCadLogin('');
      setCadCpf('');
      setCadEmail('');
      setCadSenha('');
      setCadConfirmarSenha('');
      setViewMode('login');
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao comunicar com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  // =========================================================================
  // SUBMIT DA REDEFINIÇÃO DE SENHA (ESQUECI MINHA SENHA)
  // =========================================================================
  const handleSubmitRecuperacao = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!recEmail.trim() || !recEmail.includes('@')) {
      setErrorMsg('Por favor, informe o E-mail cadastrado.');
      return;
    }

    const cleanCpfVal = recCpf.replace(/\D/g, '');
    if (cleanCpfVal.length !== 11) {
      setErrorMsg('O CPF deve conter exatamente 11 dígitos no formato 000.000.000-00.');
      return;
    }

    if (!recNovaSenha || recNovaSenha.length < 4) {
      setErrorMsg('A nova senha deve possuir pelo menos 4 caracteres.');
      return;
    }

    if (recNovaSenha !== recConfirmarSenha) {
      setErrorMsg('A confirmação não confere com a nova senha digitada.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/recuperar-senha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: recEmail.trim().toLowerCase(),
          cpf: recCpf,
          nova_senha: recNovaSenha,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao redefinir senha.');
      }

      setSuccessMsg(data.message || 'Senha alterada com sucesso! Você já pode entrar com sua senha.');
      if (data.login) {
        setLogin(data.login);
      }
      setSenha('');
      setRecEmail('');
      setRecCpf('');
      setRecNovaSenha('');
      setRecConfirmarSenha('');
      setViewMode('login');
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao comunicar com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-[#f8f9fa] font-sans text-slate-800">
      {/* =========================================================================
          COLUNA ESQUERDA: Boas-vindas com visual limpo e ondas estilizadas
         ========================================================================= */}
      <div className="lg:w-7/12 relative flex flex-col justify-between bg-white px-8 py-10 lg:px-16 lg:py-16 overflow-hidden border-r border-slate-200">
        {/* Topo: Logo & Identidade AlmoxControl */}
        <div className="z-10">
          <div className="flex items-center gap-3.5">
            <div className="w-14 h-14 rounded-2xl bg-white p-1.5 shadow-md border border-slate-200/80 flex items-center justify-center shrink-0">
              <img src="/logo.png" alt="Logo Santa Casa SBC" className="w-full h-full object-contain filter drop-shadow-xs" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-black tracking-tight text-[#00237D]">ALMOXCONTROL</span>
                <span className="text-[10px] font-bold uppercase tracking-widest bg-red-50 text-[#C2363A] px-2 py-0.5 rounded-full border border-red-200">
                  Multiárea & Estoque
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium tracking-wide">
                Sistema Integrado: Almoxarifado (Insumos) & CAF (Medicamentos)
              </p>
            </div>
          </div>
        </div>

        {/* Centro: Mensagem de Boas-vindas */}
        <div className="my-12 lg:my-auto z-10 max-w-xl">
          <h1 className="text-4xl lg:text-5xl font-black text-slate-800 tracking-tight leading-tight">
            Bem-vindo ao <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00237D] via-[#1e3f9a] to-[#C2363A]">
              AlmoxControl
            </span>
          </h1>
          <p className="mt-4 text-base text-slate-600 leading-relaxed font-normal">
            Sistema com isolamento completo entre <strong>Almoxarifado</strong> e <strong>CAF</strong>,
            com estoques, lotes, notas e requisições independentes por área, módulo de consumo direto e rastreabilidade total.
          </p>

          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-start gap-3 p-3.5 rounded-lg bg-blue-50/70 border border-blue-100">
              <CheckCircle2 className="w-5 h-5 text-[#00237D] shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-[#00237D] uppercase tracking-wide">Áreas Isoladas (ALM & CAF)</h4>
                <p className="text-xs text-slate-600 mt-0.5">Estoque próprio em arquivos SQLite dedicados, sem misturar insumos e medicamentos.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3.5 rounded-lg bg-red-50/60 border border-red-100">
              <ShieldCheck className="w-5 h-5 text-[#C2363A] shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-[#C2363A] uppercase tracking-wide">Lotes & Consumo FEFO</h4>
                <p className="text-xs text-slate-600 mt-0.5">Bloqueio sumário de itens vencidos e comprovantes de entrega prontos para impressão.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Rodapé da coluna esquerda: Ondas decorativas em tons azul/navy (SVG) */}
        <div className="absolute bottom-0 left-0 right-0 pointer-events-none opacity-90">
          <svg
            className="w-full h-32 lg:h-44 text-[#00237D]/8"
            viewBox="0 0 1440 320"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="none"
          >
            <path
              fill="currentColor"
              d="M0,96L48,112C96,128,192,160,288,181.3C384,203,480,213,576,192C672,171,768,117,864,112C960,107,1056,149,1152,165.3C1248,181,1344,171,1392,165.3L1440,160L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"
            />
          </svg>
        </div>
      </div>

      {/* =========================================================================
          COLUNA DIREITA: Formulários (Login / Cadastro Solicitante / Esqueci Senha)
         ========================================================================= */}
      <div className="lg:w-5/12 flex flex-col justify-center px-8 py-10 lg:px-14 bg-[#f8f9fa] z-10 overflow-y-auto max-h-screen">
        <div className="max-w-md w-full mx-auto my-auto py-4">

          {/* Mensagens de Sucesso */}
          {successMsg && (
            <div className="mb-6 p-3.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2.5 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
              <span className="font-medium">{successMsg}</span>
            </div>
          )}

          {/* Mensagens de Erro */}
          {errorMsg && (
            <div className="mb-6 p-3.5 rounded bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2.5 animate-fadeIn">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="font-medium">{errorMsg}</span>
            </div>
          )}

          {/* =====================================================================
              1. TELA DE LOGIN REGULAR
             ===================================================================== */}
          {viewMode === 'login' && (
            <div className="animate-fadeIn">
              <div className="mb-7">
                <h2 className="text-2xl font-bold text-slate-800 tracking-tight">
                  Acesso ao Sistema
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Informe suas credenciais e a Área de atuação desejada.
                </p>
              </div>

              <form onSubmit={handleSubmitLogin} className="space-y-4">
                {/* Campo Usuário */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Usuário
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <User className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      value={login}
                      onChange={(e) => setLogin(e.target.value)}
                      placeholder="admin"
                      className="w-full pl-10 pr-3 py-2.5 bg-[#f1f3f5] border border-slate-300 rounded text-sm text-slate-800 focus:outline-none focus:border-teal-500 focus:bg-white transition-all shadow-inner"
                      required
                    />
                  </div>
                </div>

                {/* Campo Senha */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                      Senha
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setViewMode('esqueci-senha');
                        setErrorMsg(null);
                        setSuccessMsg(null);
                      }}
                      className="text-xs text-blue-700 hover:text-blue-900 hover:underline font-semibold cursor-pointer"
                    >
                      Esqueci minha senha
                    </button>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                      placeholder="Sua senha de acesso"
                      className="w-full pl-10 pr-10 py-2.5 bg-[#f1f3f5] border border-slate-300 rounded text-sm text-slate-800 focus:outline-none focus:border-teal-500 focus:bg-white transition-all shadow-inner"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Campo Área de Atuação */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Área de Atuação (Almoxarifado / CAF)
                  </label>
                  <SearchableSelect
                    options={areaOptions}
                    value={selectedAreaSigla}
                    onChange={(val) => setSelectedAreaSigla(String(val))}
                    placeholder="Selecione a Área..."
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    A sessão utilizará o banco de dados exclusivo da área selecionada.
                  </p>
                </div>

                {/* Botão ENTRAR */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 bg-[#00237D] hover:bg-[#001c66] active:bg-[#00144d] text-white font-bold py-3 px-4 rounded-lg text-sm tracking-wider uppercase transition-all shadow-md shadow-blue-950/20 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {loading ? (
                    <span>Autenticando...</span>
                  ) : (
                    <>
                      <LogIn className="w-4 h-4" />
                      <span>ENTRAR NO SISTEMA</span>
                    </>
                  )}
                </button>
              </form>

              {/* Divisor com Botão de Cadastro de Solicitante */}
              <div className="mt-6 pt-5 border-t border-slate-200">
                <div className="text-center mb-3">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Novo usuário solicitante?
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('cadastro');
                    setErrorMsg(null);
                    setSuccessMsg(null);
                  }}
                  className="w-full bg-white hover:bg-emerald-50 border-2 border-emerald-600 text-emerald-800 font-bold py-2.5 px-4 rounded-lg text-xs tracking-wider uppercase transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer hover:shadow-md"
                >
                  <UserPlus className="w-4 h-4 text-emerald-600" />
                  <span>CADASTRAR USUÁRIO (SOLICITANTE)</span>
                </button>
                <p className="text-[11px] text-slate-500 text-center mt-2">
                  Cadastro para médicos, enfermeiros e responsáveis de setor abrirem requisições.
                </p>
              </div>
            </div>
          )}

          {/* =====================================================================
              2. TELA DE AUTO-CADASTRO (APENAS SOLICITANTE DE REQUISIÇÃO)
             ===================================================================== */}
          {viewMode === 'cadastro' && (
            <div className="animate-fadeIn">
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded border border-emerald-300">
                    Novo Solicitante
                  </span>
                </div>
                <h2 className="text-2xl font-bold text-slate-800 tracking-tight">
                  Cadastrar Usuário
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Acesso para solicitação e acompanhamento de materiais e medicamentos para seu setor.
                </p>
              </div>

              <form onSubmit={handleSubmitCadastro} className="space-y-3.5">
                {/* Nome Completo */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Nome Completo *
                  </label>
                  <input
                    type="text"
                    required
                    value={cadNome}
                    onChange={(e) => setCadNome(e.target.value)}
                    placeholder="Nome completo do colaborador"
                    className="w-full px-3 py-2 bg-[#f1f3f5] border border-slate-300 rounded text-xs text-slate-800 focus:outline-none focus:border-teal-500 focus:bg-white shadow-inner"
                  />
                </div>

                {/* Usuário Login */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Usuário Login *
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <User className="w-3.5 h-3.5" />
                    </div>
                    <input
                      type="text"
                      required
                      value={cadLogin}
                      onChange={(e) => setCadLogin(e.target.value)}
                      placeholder="login.acesso"
                      className="w-full pl-9 pr-3 py-2 bg-[#f1f3f5] border border-slate-300 rounded text-xs text-slate-800 focus:outline-none focus:border-teal-500 focus:bg-white shadow-inner font-mono"
                    />
                  </div>
                </div>

                {/* CPF (Obrigatório no formato xxx.xxx.xxx-xx) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                      CPF *
                    </label>
                    <span className="text-[10px] text-slate-500 font-mono">Formato: 000.000.000-00</span>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <CreditCard className="w-3.5 h-3.5" />
                    </div>
                    <input
                      type="text"
                      required
                      value={cadCpf}
                      onChange={(e) => setCadCpf(maskCpf(e.target.value))}
                      placeholder="000.000.000-00"
                      maxLength={14}
                      className="w-full pl-9 pr-3 py-2 bg-[#f1f3f5] border border-slate-300 rounded text-xs text-slate-800 focus:outline-none focus:border-teal-500 focus:bg-white shadow-inner font-mono font-semibold"
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Não serão aceitos cadastros com CPF duplicado. Necessário para recuperação de senha.
                  </p>
                </div>

                {/* E-mail Institucional */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    E-mail Institucional *
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Mail className="w-3.5 h-3.5" />
                    </div>
                    <input
                      type="email"
                      required
                      value={cadEmail}
                      onChange={(e) => setCadEmail(e.target.value)}
                      placeholder="usuario@hospital.gov.br"
                      className="w-full pl-9 pr-3 py-2 bg-[#f1f3f5] border border-slate-300 rounded text-xs text-slate-800 focus:outline-none focus:border-teal-500 focus:bg-white shadow-inner"
                    />
                  </div>
                </div>

                {/* Centro de Custo Solicitante */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Centro de Custo Solicitante (Setor) *
                  </label>
                  <SearchableSelect
                    options={centroCustoOptions}
                    value={cadCcId}
                    onChange={(val) => setCadCcId(String(val))}
                    placeholder="Selecione seu Centro de Custo..."
                  />
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Setor para onde os insumos solicitados serão entregues e lançados.
                  </p>
                </div>

                {/* Senha e Confirmação */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                      Senha *
                    </label>
                    <div className="relative">
                      <input
                        type={cadShowSenha ? 'text' : 'password'}
                        required
                        value={cadSenha}
                        onChange={(e) => setCadSenha(e.target.value)}
                        placeholder="••••••"
                        className="w-full px-3 py-2 bg-[#f1f3f5] border border-slate-300 rounded text-xs text-slate-800 focus:outline-none focus:border-teal-500 focus:bg-white shadow-inner"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                      Confirmar Senha *
                    </label>
                    <div className="relative">
                      <input
                        type={cadShowSenha ? 'text' : 'password'}
                        required
                        value={cadConfirmarSenha}
                        onChange={(e) => setCadConfirmarSenha(e.target.value)}
                        placeholder="••••••"
                        className="w-full px-3 py-2 bg-[#f1f3f5] border border-slate-300 rounded text-xs text-slate-800 focus:outline-none focus:border-teal-500 focus:bg-white shadow-inner"
                      />
                      <button
                        type="button"
                        onClick={() => setCadShowSenha(!cadShowSenha)}
                        className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {cadShowSenha ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Perfil Restrito (Apenas Solicitante) */}
                <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-[#00237D] uppercase tracking-wider text-[11px] block">
                      Perfil de Acesso: Requisitante
                    </span>
                    <span className="text-[11px] text-slate-600">
                      Permissão exclusiva para pedidos e acompanhamento de requisições.
                    </span>
                  </div>
                  <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0" />
                </div>

                {/* Botões de Ação */}
                <div className="pt-2 flex flex-col gap-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold py-2.5 px-4 rounded-lg text-xs uppercase tracking-wider transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>{loading ? 'Cadastrando...' : 'CONCLUIR CADASTRO'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setViewMode('login');
                      setErrorMsg(null);
                      setSuccessMsg(null);
                    }}
                    className="w-full bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-2 px-4 rounded-lg text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Voltar para o Login</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* =====================================================================
              3. TELA DE ESQUECI MINHA SENHA (E-MAIL + CPF + NOVA SENHA)
             ===================================================================== */}
          {viewMode === 'esqueci-senha' && (
            <div className="animate-fadeIn">
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] font-black uppercase tracking-widest bg-blue-100 text-[#00237D] px-2 py-0.5 rounded border border-blue-300">
                    Recuperação de Acesso
                  </span>
                </div>
                <h2 className="text-2xl font-bold text-slate-800 tracking-tight">
                  Esqueci Minha Senha
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Informe o E-mail e o CPF cadastrados para redefinir sua senha de acesso.
                </p>
              </div>

              <form onSubmit={handleSubmitRecuperacao} className="space-y-4">
                {/* E-mail Cadastrado */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    E-mail Cadastrado *
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Mail className="w-3.5 h-3.5" />
                    </div>
                    <input
                      type="email"
                      required
                      value={recEmail}
                      onChange={(e) => setRecEmail(e.target.value)}
                      placeholder="seu.email@hospital.gov.br"
                      className="w-full pl-9 pr-3 py-2 bg-[#f1f3f5] border border-slate-300 rounded text-xs text-slate-800 focus:outline-none focus:border-teal-500 focus:bg-white shadow-inner"
                    />
                  </div>
                </div>

                {/* CPF Cadastrado */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                      CPF Cadastrado *
                    </label>
                    <span className="text-[10px] text-slate-500 font-mono">Formato: 000.000.000-00</span>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <CreditCard className="w-3.5 h-3.5" />
                    </div>
                    <input
                      type="text"
                      required
                      value={recCpf}
                      onChange={(e) => setRecCpf(maskCpf(e.target.value))}
                      placeholder="000.000.000-00"
                      maxLength={14}
                      className="w-full pl-9 pr-3 py-2 bg-[#f1f3f5] border border-slate-300 rounded text-xs text-slate-800 focus:outline-none focus:border-teal-500 focus:bg-white shadow-inner font-mono font-semibold"
                    />
                  </div>
                </div>

                {/* Nova Senha */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Nova Senha de Acesso *
                  </label>
                  <div className="relative">
                    <input
                      type={recShowSenha ? 'text' : 'password'}
                      required
                      value={recNovaSenha}
                      onChange={(e) => setRecNovaSenha(e.target.value)}
                      placeholder="Mínimo 4 caracteres (pode ser a senha antiga)"
                      className="w-full px-3 py-2 bg-[#f1f3f5] border border-slate-300 rounded text-xs text-slate-800 focus:outline-none focus:border-teal-500 focus:bg-white shadow-inner"
                    />
                    <button
                      type="button"
                      onClick={() => setRecShowSenha(!recShowSenha)}
                      className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {recShowSenha ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Permitido cadastrar a senha antiga novamente se desejar.
                  </p>
                </div>

                {/* Confirmar Nova Senha */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Confirmar Nova Senha *
                  </label>
                  <input
                    type={recShowSenha ? 'text' : 'password'}
                    required
                    value={recConfirmarSenha}
                    onChange={(e) => setRecConfirmarSenha(e.target.value)}
                    placeholder="Repita a nova senha"
                    className="w-full px-3 py-2 bg-[#f1f3f5] border border-slate-300 rounded text-xs text-slate-800 focus:outline-none focus:border-teal-500 focus:bg-white shadow-inner"
                  />
                </div>

                {/* Botões de Ação */}
                <div className="pt-2 flex flex-col gap-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-[#00237D] hover:bg-[#001c66] active:bg-[#00144d] text-white font-bold py-2.5 px-4 rounded-lg text-xs uppercase tracking-wider transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <KeyRound className="w-4 h-4" />
                    <span>{loading ? 'Redefinindo...' : 'REDEFINIR SENHA'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setViewMode('login');
                      setErrorMsg(null);
                      setSuccessMsg(null);
                    }}
                    className="w-full bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-2 px-4 rounded-lg text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Voltar para o Login</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Rodapé Único */}
          <div className="mt-8 pt-4 text-center border-t border-slate-200">
            <p className="text-xs text-slate-400 font-normal">
              Desenvolvido por Bruno Rocha - DPO
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
