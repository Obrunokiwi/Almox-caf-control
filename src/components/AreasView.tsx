import React, { useState, useEffect } from 'react';
import {
  Layers,
  Plus,
  Edit2,
  Power,
  Shield,
  FileText,
  AlertCircle,
  CheckCircle2,
  Search,
  RefreshCw,
  Copy,
  Info,
  Building2,
  FileBarChart
} from 'lucide-react';
import type { Area, Usuario } from '../types/index.ts';

interface AreasViewProps {
  currentUser: Usuario;
  onRefreshData?: () => void;
}

export const AreasView: React.FC<AreasViewProps> = ({ currentUser, onRefreshData }) => {
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Modais
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCrossReportsModalOpen, setIsCrossReportsModalOpen] = useState(false);

  // Formulário Nova Área
  const [newSigla, setNewSigla] = useState('');
  const [newNome, setNewNome] = useState('');
  const [newDescricao, setNewDescricao] = useState('');
  const [copiarCatalogo, setCopiarCatalogo] = useState(false);
  const [copiarDeSigla, setCopiarDeSigla] = useState('ALM');

  // Formulário Edição
  const [editingArea, setEditingArea] = useState<Area | null>(null);
  const [editNome, setEditNome] = useState('');
  const [editDescricao, setEditDescricao] = useState('');

  // Configuração Relatórios Cruzados
  const [crossReportArea, setCrossReportArea] = useState<Area | null>(null);
  const [selectedTargetIds, setSelectedTargetIds] = useState<number[]>([]);

  const fetchAreas = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/areas', {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
      });
      if (!res.ok) {
        throw new Error('Falha ao carregar áreas operacionais.');
      }
      const data = await res.json();
      setAreas(data);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro de conexão.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAreas();
  }, []);

  const handleCreateArea = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSigla || !newNome) {
      setErrorMsg('Sigla e nome da área são obrigatórios.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/areas', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify({
          sigla: newSigla.trim().toUpperCase(),
          nome: newNome.trim(),
          descricao: newDescricao.trim(),
          copiar_catalogo_de_sigla: copiarCatalogo ? copiarDeSigla : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao criar área.');

      setSuccessMsg(`Área "${data.nome}" (${data.sigla}) criada com sucesso com banco próprio.`);
      setIsNewModalOpen(false);
      setNewSigla('');
      setNewNome('');
      setNewDescricao('');
      setCopiarCatalogo(false);
      fetchAreas();
      onRefreshData?.();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao cadastrar área.');
    } finally {
      setLoading(false);
    }
  };

  const handleEditArea = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingArea) return;

    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/areas/${editingArea.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify({
          nome: editNome.trim(),
          descricao: editDescricao.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao atualizar área.');

      setSuccessMsg(`Área "${data.nome}" atualizada com sucesso.`);
      setIsEditModalOpen(false);
      setEditingArea(null);
      fetchAreas();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar alterações.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (area: Area) => {
    if (!confirm(`Deseja realmente ${area.ativa ? 'desativar' : 'ativar'} a área "${area.nome}" (${area.sigla})?`)) {
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/areas/${area.id}/status`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao alterar situação da área.');

      setSuccessMsg(`Área "${area.nome}" ${data.ativa ? 'ativada' : 'desativada'} com sucesso.`);
      fetchAreas();
      onRefreshData?.();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao alterar situação.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCrossReports = async (area: Area) => {
    setCrossReportArea(area);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/areas/${area.id}/relatorios-cruzados`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedTargetIds(data.map((r: any) => r.area_alvo_id));
      }
      setIsCrossReportsModalOpen(true);
    } catch {
      setIsCrossReportsModalOpen(true);
    }
  };

  const handleSaveCrossReports = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!crossReportArea) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/areas/${crossReportArea.id}/relatorios-cruzados`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: JSON.stringify({
          area_alvo_ids: selectedTargetIds,
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Erro ao salvar permissões de relatórios cruzados.');
      }

      setSuccessMsg(`Permissões de relatórios cruzados para ${crossReportArea.sigla} atualizadas com sucesso.`);
      setIsCrossReportsModalOpen(false);
    } catch (err: any) {
      setErrorMsg(err.message || 'Falha ao salvar permissões.');
    } finally {
      setLoading(false);
    }
  };

  const filteredAreas = areas.filter(
    (a) =>
      a.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.sigla.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.arquivo_db.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Topo do Módulo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-[#00237D]/10 text-[#00237D] rounded-lg">
              <Layers className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Gestão de Áreas Operacionais
            </h1>
            <span className="text-[11px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
              Arquitetura Multi-Banco
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Cada área possui seu próprio banco SQLite independente (<code className="font-mono text-slate-700">almoxarifado.db</code>, <code className="font-mono text-slate-700">caf.db</code>), com lotes, saldos e movimentações isolados.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchAreas}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors cursor-pointer"
            title="Atualizar lista"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => setIsNewModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-[#00237D] hover:bg-[#001c66] text-white text-xs font-semibold rounded-lg shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nova Área</span>
          </button>
        </div>
      </div>

      {/* Alertas */}
      {errorMsg && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-start gap-2 animate-fadeIn">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs flex items-start gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Resumo Arquitetural */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Áreas Cadastradas
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1">
            {areas.length}
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {areas.filter((a) => a.ativa).length} ativas no login
          </p>
        </div>

        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Banco Central (sistema.db)
          </div>
          <div className="text-sm font-semibold text-slate-800 mt-1 flex items-center gap-1.5">
            <Shield className="w-4 h-4 text-emerald-600" />
            <span>Autenticação & Espelhos Ativos</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Usuários e Centros de Custo espelhados automaticamente
          </p>
        </div>

        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Regra Padrão de Relatórios
          </div>
          <div className="text-sm font-semibold text-slate-800 mt-1 flex items-center gap-1.5">
            <FileBarChart className="w-4 h-4 text-blue-600" />
            <span>CAF consulta Almoxarifado</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Acesso cruzado restrito a relatórios em modo somente leitura
          </p>
        </div>
      </div>

      {/* Barra de Busca */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por sigla, nome ou arquivo de banco..."
            className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#00237D]"
          />
        </div>
      </div>

      {/* Tabela de Áreas */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
              <th className="px-4 py-3">Sigla</th>
              <th className="px-4 py-3">Nome da Área</th>
              <th className="px-4 py-3">Arquivo de Banco</th>
              <th className="px-4 py-3">Descrição / Finalidade</th>
              <th className="px-4 py-3">Situação</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
            {filteredAreas.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  Nenhuma área encontrada.
                </td>
              </tr>
            ) : (
              filteredAreas.map((area) => (
                <tr key={area.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-4 py-3 font-mono font-bold text-slate-900">
                    <span className="px-2 py-0.5 bg-slate-100 rounded border border-slate-200">
                      {area.sigla}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-900">
                    {area.nome}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-slate-500">
                    {area.arquivo_db}
                  </td>
                  <td className="px-4 py-3 text-slate-500 max-w-xs truncate">
                    {area.descricao || '—'}
                  </td>
                  <td className="px-4 py-3">
                    {area.ativa ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3" />
                        Ativa
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                        Desativada
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right space-x-1">
                    <button
                      type="button"
                      onClick={() => handleOpenCrossReports(area)}
                      className="p-1.5 text-slate-600 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                      title="Configurar Relatórios Cruzados"
                    >
                      <FileBarChart className="w-4 h-4 inline" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setEditingArea(area);
                        setEditNome(area.nome);
                        setEditDescricao(area.descricao || '');
                        setIsEditModalOpen(true);
                      }}
                      className="p-1.5 text-slate-600 hover:text-[#00237D] hover:bg-slate-100 rounded transition-colors cursor-pointer"
                      title="Editar Área"
                    >
                      <Edit2 className="w-4 h-4 inline" />
                    </button>

                    {area.sigla !== 'ALM' && area.sigla !== 'CAF' && (
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(area)}
                        className={`p-1.5 rounded transition-colors cursor-pointer ${
                          area.ativa
                            ? 'text-rose-600 hover:bg-rose-50'
                            : 'text-emerald-600 hover:bg-emerald-50'
                        }`}
                        title={area.ativa ? 'Desativar Área' : 'Ativar Área'}
                      >
                        <Power className="w-4 h-4 inline" />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Nova Área */}
      {isNewModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-1">
              Criar Nova Área Operacional
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              O sistema criará automaticamente o banco SQLite exclusivo com a estrutura padrão unificada.
            </p>

            <form onSubmit={handleCreateArea} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Sigla da Área (Única) *
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={newSigla}
                  onChange={(e) => setNewSigla(e.target.value.toUpperCase())}
                  placeholder="Ex: CCIR, UTI, AMB"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono font-bold uppercase focus:outline-none focus:border-[#00237D]"
                  required
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  A sigla não poderá ser alterada após a primeira movimentação de estoque.
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Nome Completo da Área *
                </label>
                <input
                  type="text"
                  value={newNome}
                  onChange={(e) => setNewNome(e.target.value)}
                  placeholder="Ex: Centro Cirúrgico, Ambulatório Geral"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:border-[#00237D]"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Descrição / Finalidade
                </label>
                <textarea
                  value={newDescricao}
                  onChange={(e) => setNewDescricao(e.target.value)}
                  rows={2}
                  placeholder="Descreva a atuação e tipos de insumos geridos nesta área..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:border-[#00237D]"
                />
              </div>

              {/* Opção de Copiar Catálogo */}
              <div className="pt-2 border-t border-slate-100">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={copiarCatalogo}
                    onChange={(e) => setCopiarCatalogo(e.target.checked)}
                    className="w-4 h-4 rounded text-[#00237D] focus:ring-0"
                  />
                  <span className="text-xs font-semibold text-slate-700">
                    Copiar catálogo (produtos, grupos, fornecedores) de outra área
                  </span>
                </label>
                <p className="text-[10px] text-slate-400 mt-0.5 ml-6">
                  Copia apenas os cadastros com saldo zerado, sem lotes e sem histórico.
                </p>

                {copiarCatalogo && (
                  <div className="mt-2 ml-6">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Área de Origem do Catálogo
                    </label>
                    <select
                      value={copiarDeSigla}
                      onChange={(e) => setCopiarDeSigla(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs bg-white focus:outline-none focus:border-[#00237D]"
                    >
                      {areas.filter((a) => a.ativa).map((a) => (
                        <option key={a.id} value={a.sigla}>
                          {a.sigla} — {a.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-[#00237D] hover:bg-[#001c66] rounded-lg transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {loading ? 'Criando banco...' : 'Criar Área'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Editar Área */}
      {isEditModalOpen && editingArea && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-1">
              Editar Área: {editingArea.sigla}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Arquivo: <code className="font-mono text-slate-700">{editingArea.arquivo_db}</code>
            </p>

            <form onSubmit={handleEditArea} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Nome da Área *
                </label>
                <input
                  type="text"
                  value={editNome}
                  onChange={(e) => setEditNome(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:border-[#00237D]"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                  Descrição / Finalidade
                </label>
                <textarea
                  value={editDescricao}
                  onChange={(e) => setEditDescricao(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:border-[#00237D]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-[#00237D] hover:bg-[#001c66] rounded-lg transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {loading ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Relatórios Cruzados */}
      {isCrossReportsModalOpen && crossReportArea && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 border border-slate-200">
            <h3 className="text-base font-bold text-slate-900 mb-1">
              Relatórios Cruzados: {crossReportArea.sigla} — {crossReportArea.nome}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Selecione quais outras áreas esta área tem autorização para consultar em modo somente leitura no módulo "Relatórios de outras áreas".
            </p>

            <form onSubmit={handleSaveCrossReports} className="space-y-4">
              <div className="space-y-2 max-h-60 overflow-y-auto p-1">
                {areas
                  .filter((a) => a.id !== crossReportArea.id)
                  .map((target) => {
                    const isChecked = selectedTargetIds.includes(target.id);
                    return (
                      <label
                        key={target.id}
                        className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedTargetIds([...selectedTargetIds, target.id]);
                            } else {
                              setSelectedTargetIds(selectedTargetIds.filter((id) => id !== target.id));
                            }
                          }}
                          className="w-4 h-4 rounded text-[#00237D] focus:ring-0"
                        />
                        <div>
                          <div className="text-xs font-bold text-slate-800">
                            {target.sigla} — {target.nome}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            {target.arquivo_db}
                          </div>
                        </div>
                      </label>
                    );
                  })}
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsCrossReportsModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-[#00237D] hover:bg-[#001c66] rounded-lg transition-colors shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {loading ? 'Salvando...' : 'Salvar Permissões'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
