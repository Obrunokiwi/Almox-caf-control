import React, { useState } from 'react';
import { 
  ShieldAlert, 
  Lock, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  AlertCircle, 
  X,
  KeyRound
} from 'lucide-react';
import type { Usuario } from '../types/index.ts';
import { useToast } from '../context/ToastContext.tsx';

interface SecurityPasswordModalProps {
  currentUser: Usuario;
  isOpen: boolean;
  onClose: () => void;
  onPasswordChanged: () => void;
}

export const SecurityPasswordModal: React.FC<SecurityPasswordModalProps> = ({
  currentUser,
  isOpen,
  onClose,
  onPasswordChanged,
}) => {
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmaSenha, setConfirmaSenha] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const { toast } = useToast();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (novaSenha.trim().length < 6) {
      setErrorMsg('A nova senha deve possuir pelo menos 6 caracteres.');
      return;
    }

    if (novaSenha !== confirmaSenha) {
      setErrorMsg('A confirmação não coincide com a nova senha digitada.');
      return;
    }

    if (novaSenha === 'admin123') {
      setErrorMsg('A nova senha deve ser diferente da senha padrão "admin123".');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/alterar-senha', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `user:${currentUser.id}`,
        },
        body: JSON.stringify({
          nova_senha: novaSenha.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao alterar senha.');
      }

      setSuccessMsg('Senha alterada com sucesso! Suas credenciais foram atualizadas com segurança.');
      toast.success('Senha Alterada com Sucesso', 'Suas credenciais de administrador foram atualizadas.');
      setTimeout(() => {
        onPasswordChanged();
        onClose();
      }, 1200);
    } catch (err: any) {
      const msg = err.message || 'Falha de comunicação com o servidor.';
      setErrorMsg(msg);
      toast.error('Erro ao Alterar Senha', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-scaleUp">
        {/* Cabeçalho de Alerta de Segurança */}
        <div className="bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 p-5 text-white flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-xs">
              <ShieldAlert className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">Aviso de Segurança</h3>
              <p className="text-xs text-amber-100 mt-0.5">Altere a senha padrão do administrador</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo Informativo e Formulário */}
        <div className="p-6 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 space-y-1.5">
            <p className="font-bold flex items-center gap-1.5 text-amber-800">
              <KeyRound className="w-4 h-4 text-amber-700" />
              Credencial padrão em uso: <code className="bg-amber-100/80 px-1 py-0.5 rounded font-mono">admin123</code>
            </p>
            <p className="text-slate-600 text-[11px] leading-relaxed">
              Você está utilizando a senha padrão de instalação inicial. Para garantir a rastreabilidade e a proteção do banco de dados do almoxarifado, recomendamos definir uma nova senha agora.
            </p>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                Nova Senha
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  placeholder="Mínimo de 6 caracteres"
                  className="w-full pl-9 pr-10 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-teal-500 focus:bg-white transition-all shadow-inner"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                Confirmar Nova Senha
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmaSenha}
                  onChange={(e) => setConfirmaSenha(e.target.value)}
                  placeholder="Repita a nova senha"
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 focus:outline-none focus:border-teal-500 focus:bg-white transition-all shadow-inner"
                  required
                />
              </div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-2">
              <button
                type="submit"
                disabled={loading || !!successMsg}
                className="flex-1 py-2.5 px-4 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-bold rounded-lg text-xs tracking-wider uppercase transition-all shadow cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {loading ? 'Salvando...' : 'Salvar Nova Senha'}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold rounded-lg text-xs tracking-wider uppercase transition-all cursor-pointer"
              >
                Lembrar Mais Tarde
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
