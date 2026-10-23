import React from 'react';
import { 
  UserCheck, 
  Building2, 
  ShieldCheck, 
  Calendar, 
  Clock, 
  Mail, 
  CreditCard, 
  ArrowLeft,
  Hospital,
  CheckCircle2,
  HardDriveDownload,
  Database
} from 'lucide-react';
import type { Usuario, EmpresaUnidade } from '../types/index.ts';
import { useToast } from '../context/ToastContext.tsx';

interface PerfilViewProps {
  currentUser: Usuario;
  unidades: EmpresaUnidade[];
  activeUnidade?: EmpresaUnidade | null;
  onSelectUnidade: (unidadeId: number) => void;
  onVoltar: () => void;
  onOpenBackupModal?: () => void;
}

export const PerfilView: React.FC<PerfilViewProps> = ({
  currentUser,
  unidades,
  activeUnidade,
  onSelectUnidade,
  onVoltar,
  onOpenBackupModal,
}) => {
  const { toast } = useToast();

  const getPerfilBadge = (perfil: string) => {
    switch (perfil) {
      case 'admin':
        return <span className="px-2.5 py-1 rounded bg-purple-100 text-purple-800 text-xs font-bold uppercase tracking-wider">Administrador Geral</span>;
      case 'almoxarife':
        return <span className="px-2.5 py-1 rounded bg-teal-100 text-teal-800 text-xs font-bold uppercase tracking-wider">Almoxarife Responsável</span>;
      case 'requisitante':
        return <span className="px-2.5 py-1 rounded bg-blue-100 text-blue-800 text-xs font-bold uppercase tracking-wider">Requisitante Assistencial</span>;
      default:
        return <span>{perfil}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Barra Superior */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-teal-100 text-teal-800 rounded-lg">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">Perfil do Usuário</h1>
            <p className="text-xs text-slate-500">Credenciais, permissões de acesso e unidade hospitalar ativa</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onVoltar}
          className="bg-teal-600 hover:bg-teal-700 text-white font-medium px-4 py-2 rounded text-xs flex items-center gap-1.5 transition-all shadow uppercase tracking-wide cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>VOLTAR</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card de Identificação */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-teal-700 to-teal-500 flex items-center justify-center text-white text-2xl font-black shadow-md shadow-teal-700/20">
            {currentUser.nome.charAt(0)}
          </div>

          <div>
            <h2 className="text-lg font-bold text-slate-800">{currentUser.nome}</h2>
            <p className="text-xs text-slate-500 font-mono">@{currentUser.login}</p>
            <div className="mt-2">{getPerfilBadge(currentUser.perfil)}</div>
          </div>

          <div className="pt-4 border-t border-slate-200 space-y-2 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-slate-400" />
              <span><strong>CPF:</strong> {currentUser.cpf || '123.456.789-00'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-slate-400" />
              <span><strong>E-mail:</strong> {currentUser.email || `${currentUser.login}@hospital.gov.br`}</span>
            </div>
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-slate-400" />
              <span><strong>Centro de Custo:</strong> {currentUser.centro_custo_nome || 'Geral / Almoxarifado'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-400" />
              <span><strong>Cadastrado em:</strong> {currentUser.criado_em ? new Date(currentUser.criado_em).toLocaleDateString('pt-BR') : '29/09/2026'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" />
              <span><strong>Último Acesso:</strong> {currentUser.ultimo_acesso ? new Date(currentUser.ultimo_acesso).toLocaleString('pt-BR') : 'Hoje, recente'}</span>
            </div>
          </div>
        </div>

        {/* Card de Unidade de Operação */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <Hospital className="w-5 h-5 text-teal-700" />
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Unidade / Almoxarifado Ativo</h3>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            Selecione o almoxarifado em que deseja operar. Todos os relatórios, consultas de saldo e requisições 
            obedecerão ao escopo da unidade selecionada.
          </p>

          <div className="space-y-2">
            {unidades.map((u) => {
              const isSelected = activeUnidade?.id === u.id;
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => {
                    onSelectUnidade(u.id);
                    toast.info('Unidade Hospitalar Alterada', `Operando agora em: ${u.codigo} - ${u.nome}.`);
                  }}
                  className={`w-full p-3 rounded-lg border text-left flex items-start justify-between gap-3 transition-all cursor-pointer ${
                    isSelected
                      ? 'border-teal-600 bg-teal-50/60 shadow-sm'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div>
                    <div className="text-xs font-bold text-slate-800">{u.codigo} - {u.nome}</div>
                    <div className="text-[11px] text-slate-500">{u.cidade} - {u.uf} | CNPJ: {u.cnpj || '00.000.000/0001-00'}</div>
                  </div>
                  {isSelected && <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Card de Permissões */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-teal-700" />
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Permissões de Módulo</h3>
          </div>

          <div className="space-y-2.5 text-xs text-slate-700">
            <div className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-200">
              <span>Consulta de Usuários e Centros de Custo</span>
              <span className={`font-bold ${currentUser.perfil === 'admin' ? 'text-emerald-700' : 'text-slate-400'}`}>
                {currentUser.perfil === 'admin' ? 'Liberado' : 'Restrito'}
              </span>
            </div>

            <div className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-200">
              <span>Aprovação e Atendimento de Requisições</span>
              <span className={`font-bold ${['admin', 'almoxarife'].includes(currentUser.perfil) ? 'text-emerald-700' : 'text-slate-400'}`}>
                {['admin', 'almoxarife'].includes(currentUser.perfil) ? 'Liberado' : 'Restrito'}
              </span>
            </div>

            <div className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-200">
              <span>Entrada de Estoque por Nota Fiscal</span>
              <span className={`font-bold ${['admin', 'almoxarife'].includes(currentUser.perfil) ? 'text-emerald-700' : 'text-slate-400'}`}>
                {['admin', 'almoxarife'].includes(currentUser.perfil) ? 'Liberado' : 'Restrito'}
              </span>
            </div>

            <div className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-200">
              <span>Abertura de Requisição Assistencial</span>
              <span className="font-bold text-emerald-700">Liberado</span>
            </div>

            <div className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-200">
              <span>Emissão de Relatórios Gerenciais</span>
              <span className="font-bold text-emerald-700">Liberado</span>
            </div>

            <div className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-200">
              <span>Estorno de Movimentações (Auditoria)</span>
              <span className={`font-bold ${currentUser.perfil === 'admin' ? 'text-emerald-700' : 'text-slate-400'}`}>
                {currentUser.perfil === 'admin' ? 'Liberado' : 'Restrito'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Seção de Troca de Senha / Segurança da Conta */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm max-w-xl">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-1">
          Segurança da Conta & Alteração de Senha
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          Defina uma nova senha segura para seu login de operador.
        </p>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.target as HTMLFormElement;
            const novaSenha = (form.elements.namedItem('novaSenha') as HTMLInputElement).value;
            const confirmaSenha = (form.elements.namedItem('confirmaSenha') as HTMLInputElement).value;

            if (novaSenha.length < 6) {
              toast.error('Senha Inválida', 'A nova senha deve ter no mínimo 6 caracteres.');
              return;
            }
            if (novaSenha !== confirmaSenha) {
              toast.error('Senhas Divergentes', 'A confirmação não coincide com a nova senha.');
              return;
            }

            try {
              const token = localStorage.getItem('multi_almox_token') || localStorage.getItem('token') || '';
              const res = await fetch('/api/auth/alterar-senha', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': token ? `Bearer ${token}` : `user:${currentUser.id}`,
                  'X-Area-Sigla': currentUser.area_sigla || 'ALM',
                },
                body: JSON.stringify({ nova_senha: novaSenha }),
              });
              const data = await res.json();
              if (res.ok) {
                toast.success('Senha Atualizada', data.message || 'Sua senha de operador foi alterada com sucesso!');
                form.reset();
              } else {
                toast.error('Erro ao Alterar Senha', data.error || 'Erro ao alterar senha.');
              }
            } catch {
              toast.error('Falha de Conexão', 'Não foi possível comunicar com o servidor.');
            }
          }}
          className="space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Nova Senha
              </label>
              <input
                type="password"
                name="novaSenha"
                placeholder="Mínimo 6 dígitos"
                required
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded focus:bg-white focus:outline-none focus:border-teal-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Confirmar Nova Senha
              </label>
              <input
                type="password"
                name="confirmaSenha"
                placeholder="Repita a nova senha"
                required
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded focus:bg-white focus:outline-none focus:border-teal-500"
              />
            </div>
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded text-xs font-bold uppercase tracking-wider transition-all shadow cursor-pointer"
          >
            Atualizar Senha
          </button>
        </form>
      </div>

      {/* Seção Exclusiva de Backup para Administrador */}
      {currentUser.perfil === 'admin' && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm max-w-xl">
          <div className="flex items-center gap-2 mb-1">
            <Database className="w-5 h-5 text-teal-700" />
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
              Backup & Exportação do Banco de Dados
            </h3>
            <span className="px-1.5 py-0.5 bg-purple-100 text-purple-800 text-[9px] font-bold rounded uppercase">
              Exclusivo Admin
            </span>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Faça download do arquivo físico SQLite (.db), script SQL (.sql) ou dump em JSON para garantia de continuidade, auditoria ou migração.
          </p>

          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={onOpenBackupModal}
              className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs uppercase tracking-wider transition-all shadow flex items-center gap-2 cursor-pointer"
            >
              <HardDriveDownload className="w-4 h-4" />
              <span>Gerar e Baixar Backup Agora</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
