import React, { useState } from 'react';
import { FolderTree, Plus, Trash2, X, Layers, CheckCircle2, AlertCircle } from 'lucide-react';
import { GrupoProduto, SubgrupoProduto } from '../types/index.ts';
import { getAuthHeaders } from '../utils/apiUtils.ts';
import { useToast } from '../context/ToastContext.tsx';

interface GruposSubgruposModalProps {
  isOpen: boolean;
  onClose: () => void;
  grupos: GrupoProduto[];
  subgrupos: SubgrupoProduto[];
  onUpdated: () => void;
  canEdit: boolean;
}

export const GruposSubgruposModal: React.FC<GruposSubgruposModalProps> = ({
  isOpen,
  onClose,
  grupos,
  subgrupos,
  onUpdated,
  canEdit,
}) => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'grupos' | 'subgrupos'>('grupos');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form Grupo
  const [novoGrupoCodigo, setNovoGrupoCodigo] = useState('');
  const [novoGrupoNome, setNovoGrupoNome] = useState('');
  const [novoGrupoTipo, setNovoGrupoTipo] = useState<'consumivel' | 'nao_consumivel'>('consumivel');

  // Form Subgrupo
  const [novoSubgrupoGrupoId, setNovoSubgrupoGrupoId] = useState<string>('');
  const [novoSubgrupoCodigo, setNovoSubgrupoCodigo] = useState('');
  const [novoSubgrupoNome, setNovoSubgrupoNome] = useState('');

  if (!isOpen) return null;

  const handleSalvarGrupo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoGrupoNome.trim()) {
      setErrorMsg('Informe o nome do grupo de produtos.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      const res = await fetch('/api/grupos-produtos', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          codigo: novoGrupoCodigo.trim() || undefined,
          nome: novoGrupoNome.trim(),
          tipo_padrao: novoGrupoTipo,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao cadastrar grupo.');
      }

      toast.success('Grupo cadastrado com sucesso!');
      setNovoGrupoCodigo('');
      setNovoGrupoNome('');
      setNovoGrupoTipo('consumivel');
      onUpdated();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar grupo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExcluirGrupo = async (grupo: GrupoProduto) => {
    if (!confirm(`Deseja realmente excluir o grupo "${grupo.nome}"?`)) return;

    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      const res = await fetch(`/api/grupos-produtos/${grupo.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao excluir grupo.');
      }
      toast.success(data.message || 'Grupo excluído com sucesso!');
      onUpdated();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao excluir grupo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSalvarSubgrupo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoSubgrupoNome.trim()) {
      setErrorMsg('Informe o nome do subgrupo.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      const res = await fetch('/api/subgrupos-produtos', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          grupo_id: novoSubgrupoGrupoId ? Number(novoSubgrupoGrupoId) : null,
          codigo: novoSubgrupoCodigo.trim() || undefined,
          nome: novoSubgrupoNome.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao cadastrar subgrupo.');
      }

      toast.success('Subgrupo cadastrado com sucesso!');
      setNovoSubgrupoCodigo('');
      setNovoSubgrupoNome('');
      onUpdated();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar subgrupo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExcluirSubgrupo = async (subgrupo: SubgrupoProduto) => {
    if (!confirm(`Deseja realmente excluir o subgrupo "${subgrupo.nome}"?`)) return;

    try {
      setIsSubmitting(true);
      setErrorMsg(null);
      const res = await fetch(`/api/subgrupos-produtos/${subgrupo.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao excluir subgrupo.');
      }
      toast.success(data.message || 'Subgrupo excluído com sucesso!');
      onUpdated();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao excluir subgrupo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/20 border border-teal-400/30 flex items-center justify-center text-teal-400">
              <FolderTree className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">
                Gestão de Grupos e Subgrupos de Produtos
              </h2>
              <p className="text-xs text-slate-300">
                Classificação hierárquica e categorização para relatórios e inventário
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab navigation */}
        <div className="bg-slate-100 px-6 pt-3 flex gap-2 border-b border-slate-200">
          <button
            type="button"
            onClick={() => { setActiveTab('grupos'); setErrorMsg(null); }}
            className={`px-4 py-2 text-xs font-bold rounded-t-lg transition-colors flex items-center gap-2 cursor-pointer ${
              activeTab === 'grupos'
                ? 'bg-white text-teal-700 border-t-2 border-x border-teal-600 border-b-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
            }`}
          >
            <Layers className="w-4 h-4 text-teal-600" />
            <span>GRUPOS DE PRODUTOS ({grupos.length})</span>
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('subgrupos'); setErrorMsg(null); }}
            className={`px-4 py-2 text-xs font-bold rounded-t-lg transition-colors flex items-center gap-2 cursor-pointer ${
              activeTab === 'subgrupos'
                ? 'bg-white text-teal-700 border-t-2 border-x border-teal-600 border-b-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
            }`}
          >
            <FolderTree className="w-4 h-4 text-teal-600" />
            <span>SUBGRUPOS DE PRODUTOS ({subgrupos.length})</span>
          </button>
        </div>

        {/* Body content with scroll */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {activeTab === 'grupos' ? (
            <div className="space-y-6">
              {/* Formulário Novo Grupo */}
              {canEdit && (
                <form onSubmit={handleSalvarGrupo} className="p-4 bg-teal-50/60 rounded-xl border border-teal-200/80 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-teal-900 uppercase tracking-wider">
                    <Plus className="w-4 h-4 text-teal-700" />
                    <span>Cadastrar Novo Grupo de Produto</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                    <div className="md:col-span-3">
                      <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                        Código (opcional)
                      </label>
                      <input
                        type="text"
                        value={novoGrupoCodigo}
                        onChange={(e) => setNovoGrupoCodigo(e.target.value.toUpperCase())}
                        placeholder="Ex: GRP-MED"
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs uppercase font-mono text-slate-800 focus:border-teal-500"
                      />
                    </div>
                    <div className="md:col-span-5">
                      <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                        Nome do Grupo *
                      </label>
                      <input
                        type="text"
                        required
                        value={novoGrupoNome}
                        onChange={(e) => setNovoGrupoNome(e.target.value.toUpperCase())}
                        placeholder="Ex: MEDICAMENTOS, MATERIAIS MÉDICOS..."
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs uppercase text-slate-800 font-semibold focus:border-teal-500"
                      />
                    </div>
                    <div className="md:col-span-4">
                      <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                        Tipo Padrão
                      </label>
                      <select
                        value={novoGrupoTipo}
                        onChange={(e) => setNovoGrupoTipo(e.target.value as any)}
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs text-slate-800 focus:border-teal-500 font-medium"
                      >
                        <option value="consumivel">Consumível (Dispensação / Requisição)</option>
                        <option value="nao_consumivel">Não Consumível (Equipamento / Empréstimo)</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end pt-1">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{isSubmitting ? 'CADASTRANDO...' : 'CADASTRAR GRUPO'}</span>
                    </button>
                  </div>
                </form>
              )}

              {/* Tabela de Grupos Cadastrados */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Código</th>
                      <th className="py-2.5 px-3">Nome do Grupo</th>
                      <th className="py-2.5 px-3">Tipo Padrão</th>
                      <th className="py-2.5 px-3 text-center">Subgrupos</th>
                      <th className="py-2.5 px-3 text-center">Produtos</th>
                      {canEdit && <th className="py-2.5 px-3 text-right">Ações</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {grupos.length > 0 ? (
                      grupos.map((g) => (
                        <tr key={g.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-2 px-3 font-mono font-bold text-slate-700">
                            {g.codigo || `GRP-${g.id}`}
                          </td>
                          <td className="py-2 px-3 font-semibold text-slate-800 uppercase">
                            {g.nome}
                          </td>
                          <td className="py-2 px-3">
                            {g.tipo_padrao === 'consumivel' ? (
                              <span className="px-2 py-0.5 rounded bg-teal-100 text-teal-800 text-[10px] font-medium">
                                Consumível
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-medium">
                                Não Consumível
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-center font-bold text-slate-700">
                            {g.total_subgrupos ?? subgrupos.filter((s) => s.grupo_id === g.id).length}
                          </td>
                          <td className="py-2 px-3 text-center font-bold text-slate-700">
                            {g.total_produtos ?? 0}
                          </td>
                          {canEdit && (
                            <td className="py-2 px-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleExcluirGrupo(g)}
                                className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                                title="Excluir Grupo"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-slate-400">
                          Nenhum grupo de produtos cadastrado nesta área.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Formulário Novo Subgrupo */}
              {canEdit && (
                <form onSubmit={handleSalvarSubgrupo} className="p-4 bg-teal-50/60 rounded-xl border border-teal-200/80 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-teal-900 uppercase tracking-wider">
                    <Plus className="w-4 h-4 text-teal-700" />
                    <span>Cadastrar Novo Subgrupo de Produto</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                    <div className="md:col-span-4">
                      <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                        Grupo Pai / Vinculado
                      </label>
                      <select
                        value={novoSubgrupoGrupoId}
                        onChange={(e) => setNovoSubgrupoGrupoId(e.target.value)}
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs text-slate-800 focus:border-teal-500 font-medium"
                      >
                        <option value="">Geral / Sem Grupo Específico</option>
                        {grupos.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.codigo ? `${g.codigo} - ` : ''}{g.nome}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="md:col-span-3">
                      <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                        Código (opcional)
                      </label>
                      <input
                        type="text"
                        value={novoSubgrupoCodigo}
                        onChange={(e) => setNovoSubgrupoCodigo(e.target.value.toUpperCase())}
                        placeholder="Ex: SG-ANTIB"
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs uppercase font-mono text-slate-800 focus:border-teal-500"
                      />
                    </div>
                    <div className="md:col-span-5">
                      <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                        Nome do Subgrupo *
                      </label>
                      <input
                        type="text"
                        required
                        value={novoSubgrupoNome}
                        onChange={(e) => setNovoSubgrupoNome(e.target.value.toUpperCase())}
                        placeholder="Ex: ANTIBIÓTICOS, ANALGÉSICOS, SERINGAS..."
                        className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs uppercase text-slate-800 font-semibold focus:border-teal-500"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end pt-1">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{isSubmitting ? 'CADASTRANDO...' : 'CADASTRAR SUBGRUPO'}</span>
                    </button>
                  </div>
                </form>
              )}

              {/* Tabela de Subgrupos Cadastrados */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Código</th>
                      <th className="py-2.5 px-3">Nome do Subgrupo</th>
                      <th className="py-2.5 px-3">Grupo Vinculado</th>
                      <th className="py-2.5 px-3 text-center">Produtos Vinculados</th>
                      {canEdit && <th className="py-2.5 px-3 text-right">Ações</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {subgrupos.length > 0 ? (
                      subgrupos.map((sg) => (
                        <tr key={sg.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-2 px-3 font-mono font-bold text-slate-700">
                            {sg.codigo || `SGRP-${sg.id}`}
                          </td>
                          <td className="py-2 px-3 font-semibold text-slate-800 uppercase">
                            {sg.nome}
                          </td>
                          <td className="py-2 px-3 text-slate-600">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-medium">
                              <Layers className="w-3 h-3 text-slate-400" />
                              <span>{sg.grupo_nome || 'Geral'}</span>
                            </span>
                          </td>
                          <td className="py-2 px-3 text-center font-bold text-slate-700">
                            {sg.total_produtos ?? 0}
                          </td>
                          {canEdit && (
                            <td className="py-2 px-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleExcluirSubgrupo(sg)}
                                className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                                title="Excluir Subgrupo"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-slate-400">
                          Nenhum subgrupo cadastrado nesta área.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex items-center justify-between text-xs">
          <div className="text-slate-500 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>As alterações refletem imediatamente no formulário de produtos, importações e relatórios.</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-semibold transition-colors cursor-pointer"
          >
            FECHAR
          </button>
        </div>
      </div>
    </div>
  );
};
