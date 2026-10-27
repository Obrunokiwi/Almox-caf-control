import React, { useState } from 'react';
import { LogIn, X, AlertTriangle, Hospital } from 'lucide-react';
import type { Usuario } from '../types/index.ts';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: Usuario, token: string) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
}) => {
  const [login, setLogin] = useState<string>('admin');
  const [senha, setSenha] = useState<string>('123456');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: login.trim(), senha: senha.trim() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Credenciais inválidas');

      onLoginSuccess(data.user, data.token);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-70 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full border border-slate-200 overflow-hidden flex flex-col">
        <div className="p-4 px-6 border-b border-slate-200 flex items-center justify-between bg-[#00237D] text-white">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-white p-0.5 flex items-center justify-center shrink-0">
              <img src="/logo.png" alt="Logo Santa Casa S.B.C - Multihospital" className="w-full h-full object-contain" />
            </div>
            <h3 className="text-sm font-bold">Autenticação AlmoxControl</h3>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Usuário / Login
            </label>
            <input
              type="text"
              required
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              className="w-full p-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-teal-500 text-slate-800 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Senha
            </label>
            <input
              type="password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="w-full p-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-teal-500 text-slate-800"
            />
          </div>

          {errorMsg && (
            <div className="bg-red-50 border border-red-200 text-red-800 p-2.5 rounded-lg text-xs flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-[11px] text-slate-600 space-y-0.5">
            <strong className="block text-slate-800 font-semibold mb-1">Contas de Teste (Senha: 123456):</strong>
            <div>• <span className="font-mono font-medium">admin</span> (Administrador Geral)</div>
            <div>• <span className="font-mono font-medium">almoxarife</span> (Almoxarife Chefe)</div>
            <div>• <span className="font-mono font-medium">requisitante</span> (UTI Geral)</div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isProcessing}
              className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors cursor-pointer shadow-xs disabled:opacity-50 flex items-center gap-1.5"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>{isProcessing ? 'Entrando...' : 'Entrar no Sistema'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
