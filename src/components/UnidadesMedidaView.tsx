import React, { useState, useEffect } from 'react';
import { 
  Ruler, 
  Search, 
  Plus, 
  Edit2, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  X, 
  Layers, 
  ShieldCheck, 
  Save 
} from 'lucide-react';
import type { Usuario } from '../types/index.ts';
import { useToast } from '../context/ToastContext.tsx';

interface UnidadeMedida {
  id: number;
  sigla: string;
  descricao: string;
  ativo: number;
  criado_em: string;
}

interface UnidadesMedidaViewProps {
  currentUser: Usuario;
  activeAreaSigla?: string;
}

export const UnidadesMedidaView: React.FC<UnidadesMedidaViewProps> = ({
  currentUser,
  activeAreaSigla = 'ALM',
}) => {
  const [unidades, setUnidades] = useState<UnidadeMedida[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingUnidade, setEditingUnidade] = useState<UnidadeMedida | null>(null);
  const [siglaInput, setSiglaInput] = useState<string>('');
  const [descricaoInput, setDescricaoInput] = useState<string>('');
  const [ativoInput, setAtivoInput] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const { toast } = useToast();
  const canManage = ['admin', 'ti_dpo', 'almoxarife'].includes(currentUser.perfil);

  const loadUnidades = async () => {
    try {
      setLoading(true);
      const token = sessionStorage.getItem('multi_almox_token');
      const res = await fetch('/api/unidades-medida', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Area-Sigla': activeAreaSigla,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setUnidades(data);
      } else {
        const err = await res.json();
        toast.error('Erro', err.error || 'Falha ao carregar unidades de medida');
      }
    } catch (error) {
      console.error('Erro ao buscar unidades de medida:', error);
      toast.error('Erro', 'Falha de conexão ao buscar unidades de medida');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUnidades();
  }, [activeAreaSigla]);

  const handleOpenCreate = () => {
    setEditingUnidade(null);
    setSiglaInput('');
    setDescricaoInput('');
    setAtivoInput(true);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (um: UnidadeMedida) => {
    setEditingUnidade(um);
    setSiglaInput(um.sigla);
    setDescricaoInput(um.descricao);
    setAtivoInput(um.ativo === 1);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!siglaInput.trim()) {
      toast.error('Campo obrigatório', 'Informe a sigla da unidade de medida.');
      return;
    }
    if (!descricaoInput.trim()) {
      toast.error('Campo obrigatório', 'Informe a descrição da unidade de medida.');
      return;
    }

    try {
      setSubmitting(true);
      const token = sessionStorage.getItem('multi_almox_token');
      const url = editingUnidade 
        ? `/api/unidades-medida/${editingUnidade.id}` 
        : '/api/unidades-medida';
      const method = editingUnidade ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-Area-Sigla': activeAreaSigla,
        },
        body: JSON.stringify({
          sigla: siglaInput.trim(),
          descricao: descricaoInput.trim(),
          ativo: ativoInput ? 1 : 0,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao salvar unidade de medida');
      }

      toast.success(
        editingUnidade ? 'Unidade Atualizada' : 'Unidade Cadastrada',
        `Unidade "${data.sigla}" salva com sucesso.`
      );
      setIsModalOpen(false);
      loadUnidades();
    } catch (err: any) {
      toast.error('Falha na operação', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredUnidades = unidades.filter((u) => 
    u.sigla.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.descricao.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 font-semibold text-xs tracking-wider uppercase mb-1">
            <Ruler className="w-4 h-4" />
            <span>Navegação e Permissões</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Gestão de Unidades de Medida</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Cadastro compartilhado de siglas e descrições de unidades para padronização em todo o catálogo de produtos.
          </p>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={handleOpenCreate}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm transition-colors shadow-xs cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Unidade de Medida</span>
          </button>
        )}
      </div>

      {/* Barra de Pesquisa e Filtros */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Pesquisar por sigla (ex: UN, CX, KG) ou descrição..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
        </div>
        <div className="text-xs text-slate-500 font-medium">
          Total: <span className="font-bold text-slate-700">{filteredUnidades.length}</span> unidade(s)
        </div>
      </div>

      {/* Tabela de Unidades */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 text-xs font-semibold uppercase tracking-wider">
                <th className="py-3.5 px-6">Sigla</th>
                <th className="py-3.5 px-6">Descrição</th>
                <th className="py-3.5 px-6">Status</th>
                <th className="py-3.5 px-6">Data de Cadastro</th>
                {canManage && <th className="py-3.5 px-6 text-right">Ações</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    Carregando unidades de medida...
                  </td>
                </tr>
              ) : filteredUnidades.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    Nenhuma unidade de medida encontrada.
                  </td>
                </tr>
              ) : (
                filteredUnidades.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-4 px-6 font-mono font-bold text-indigo-700 bg-indigo-50/30 w-36">
                      {u.sigla}
                    </td>
                    <td className="py-4 px-6 text-slate-800 font-medium">
                      {u.descricao}
                    </td>
                    <td className="py-4 px-6">
                      {u.ativo === 1 ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Ativa
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
                          <XCircle className="w-3.5 h-3.5" />
                          Inativa
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-slate-500 text-xs">
                      {u.criado_em ? new Date(u.criado_em).toLocaleDateString('pt-BR') : '-'}
                    </td>
                    {canManage && (
                      <td className="py-4 px-6 text-right">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(u)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-600 font-medium text-xs transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>Editar</span>
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Cadastro / Edição */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                  <Ruler className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-900 text-lg">
                  {editingUnidade ? 'Editar Unidade de Medida' : 'Nova Unidade de Medida'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Sigla da Unidade <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={siglaInput}
                  onChange={(e) => setSiglaInput(e.target.value.toUpperCase())}
                  placeholder="Ex: CX, PCT, UN, L, KG"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-900 uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  A sigla deve ser única (ex: UN, CX, FR), sem duplicidade.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Descrição Completa <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={descricaoInput}
                  onChange={(e) => setDescricaoInput(e.target.value)}
                  placeholder="Ex: Caixa, Pacote, Unidade, Litro, Quilograma"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              {editingUnidade && (
                <div className="flex items-center gap-3 pt-2">
                  <input
                    type="checkbox"
                    id="ativoCheckbox"
                    checked={ativoInput}
                    onChange={(e) => setAtivoInput(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                  />
                  <label htmlFor="ativoCheckbox" className="text-sm font-medium text-slate-700 select-none">
                    Unidade Ativa no Sistema
                  </label>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-medium text-sm transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{submitting ? 'Salvando...' : 'Salvar Unidade'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
