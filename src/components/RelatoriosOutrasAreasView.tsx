import React, { useState, useEffect } from 'react';
import {
  FileBarChart,
  Layers,
  Search,
  RefreshCw,
  AlertCircle,
  Eye,
  Package,
  ArrowLeftRight,
  ShieldCheck,
  Calendar,
  Building2,
  Lock
} from 'lucide-react';
import type { Area, Usuario } from '../types/index.ts';

interface RelatoriosOutrasAreasViewProps {
  currentUser: Usuario;
  activeAreaSigla?: string;
  activeAreaNome?: string;
}

export const RelatoriosOutrasAreasView: React.FC<RelatoriosOutrasAreasViewProps> = ({
  currentUser,
  activeAreaSigla = 'CAF',
  activeAreaNome = 'CAF',
}) => {
  const [permittedAreas, setPermittedAreas] = useState<Area[]>([]);
  const [selectedTargetSigla, setSelectedTargetSigla] = useState<string>('ALM');
  const [activeSubTab, setActiveSubTab] = useState<'saldo' | 'movimentacoes' | 'validades'>('saldo');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Dados carregados da outra área
  const [saldoData, setSaldoData] = useState<any[]>([]);
  const [movimentacoesData, setMovimentacoesData] = useState<any[]>([]);
  const [validadesData, setValidadesData] = useState<any[]>([]);

  // Carrega lista de áreas autorizadas para consulta cruzada
  useEffect(() => {
    const fetchPermitted = async () => {
      try {
        const token = localStorage.getItem('multi_almox_token') || localStorage.getItem('token') || '';
        const res = await fetch('/api/relatorios-outras-areas/areas-permitidas', {
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Area-Sigla': activeAreaSigla,
          },
        });
        if (res.ok) {
          const list: Area[] = await res.json();
          setPermittedAreas(list);
          if (list.length > 0) {
            setSelectedTargetSigla(list[0].sigla);
          }
        }
      } catch (err: any) {
        setErrorMsg('Erro ao identificar permissões de relatórios cruzados.');
      }
    };
    fetchPermitted();
  }, [activeAreaSigla]);

  // Carrega dados da área alvo selecionada
  const fetchTargetData = async () => {
    if (!selectedTargetSigla) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      const token = localStorage.getItem('multi_almox_token') || localStorage.getItem('token') || '';
      const headers = {
        Authorization: `Bearer ${token}`,
        'X-Area-Sigla': activeAreaSigla,
      };

      if (activeSubTab === 'saldo') {
        const res = await fetch(`/api/relatorios-outras-areas/${selectedTargetSigla}/saldo`, { headers });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Não foi possível consultar os saldos da área solicitada.');
        }
        const data = await res.json();
        setSaldoData(data);
      } else if (activeSubTab === 'movimentacoes') {
        const res = await fetch(`/api/relatorios-outras-areas/${selectedTargetSigla}/movimentacoes`, { headers });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Não foi possível consultar movimentações da área solicitada.');
        }
        const data = await res.json();
        setMovimentacoesData(data);
      } else if (activeSubTab === 'validades') {
        const res = await fetch(`/api/relatorios-outras-areas/${selectedTargetSigla}/validades`, { headers });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Não foi possível consultar lotes/validades da área solicitada.');
        }
        const data = await res.json();
        setValidadesData(data);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao carregar relatório da outra área.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTargetData();
  }, [selectedTargetSigla, activeSubTab, activeAreaSigla]);

  const targetAreaObj = permittedAreas.find((a) => a.sigla === selectedTargetSigla);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Topo do Módulo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-blue-50 text-blue-800 rounded-lg">
              <FileBarChart className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              Relatórios de Outras Áreas
            </h1>
            <span className="text-[11px] font-bold uppercase tracking-wider bg-amber-50 text-amber-800 px-2 py-0.5 rounded border border-amber-200 flex items-center gap-1">
              <Lock className="w-3 h-3" />
              Somente Leitura (Query Only)
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Permite à área da sua sessão ({activeAreaSigla} — {activeAreaNome}) consultar relatórios e estoque de outras áreas autorizadas.
          </p>
        </div>

        {/* Seletor da Área Alvo a Consultar */}
        <div className="flex items-center gap-3">
          <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">
            Consultar Área:
          </label>
          <select
            value={selectedTargetSigla}
            onChange={(e) => setSelectedTargetSigla(e.target.value)}
            className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:border-[#00237D]"
          >
            {permittedAreas.map((a) => (
              <option key={a.id} value={a.sigla}>
                {a.sigla} — {a.nome}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={fetchTargetData}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors cursor-pointer"
            title="Recarregar dados"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Banner de Aviso: MODO CONSULTA */}
      <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl text-blue-900 text-xs flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="w-5 h-5 text-blue-700 shrink-0" />
          <span>
            <strong>MODO CONSULTA ATIVO:</strong> Exibindo dados de estoque da área{' '}
            <strong className="underline">
              {targetAreaObj ? `${targetAreaObj.nome} (${targetAreaObj.sigla})` : selectedTargetSigla}
            </strong>. Nenhuma alteração ou movimentação é permitida nesta base.
          </span>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Abas de Navegação dos Relatórios */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveSubTab('saldo')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            activeSubTab === 'saldo'
              ? 'bg-[#00237D] text-white shadow-2xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Posição de Saldo em Estoque
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('movimentacoes')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            activeSubTab === 'movimentacoes'
              ? 'bg-[#00237D] text-white shadow-2xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Histórico de Movimentações
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('validades')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
            activeSubTab === 'validades'
              ? 'bg-[#00237D] text-white shadow-2xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Controle de Lotes e Validades
        </button>
      </div>

      {/* Barra de Busca rápida */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Filtrar dados da tabela..."
          className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-[#00237D]"
        />
      </div>

      {/* Conteúdo da Aba 1: Saldo de Estoque */}
      {activeSubTab === 'saldo' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Produto / Material</th>
                <th className="px-4 py-3">Grupo</th>
                <th className="px-4 py-3 text-right">Estoque Mínimo</th>
                <th className="px-4 py-3 text-right">Saldo Atual</th>
                <th className="px-4 py-3 text-right">Valor Unitário</th>
                <th className="px-4 py-3 text-right">Total em Estoque</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {saldoData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    {loading ? 'Carregando saldos da outra área...' : 'Nenhum produto cadastrado na área consultada.'}
                  </td>
                </tr>
              ) : (
                saldoData
                  .filter((p) =>
                    !searchTerm ||
                    p.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    p.codigo?.toLowerCase().includes(searchTerm.toLowerCase())
                  )
                  .map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-2.5 font-mono font-bold text-slate-900">{p.codigo}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-900">{p.nome}</td>
                      <td className="px-4 py-2.5 text-slate-500">{p.grupo_nome || '—'}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-slate-500">{p.estoque_minimo}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-slate-900">
                        {p.quantidade_atual} {p.unidade_medida}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-slate-600">
                        R$ {Number(p.valor_unitario || 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900">
                        R$ {(Number(p.quantidade_atual || 0) * Number(p.valor_unitario || 0)).toFixed(2)}
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Conteúdo da Aba 2: Movimentações */}
      {activeSubTab === 'movimentacoes' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                <th className="px-4 py-3">Data/Hora</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Motivo / Operação</th>
                <th className="px-4 py-3">Produto</th>
                <th className="px-4 py-3">Lote</th>
                <th className="px-4 py-3 text-right">Quantidade</th>
                <th className="px-4 py-3">Operador</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {movimentacoesData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    {loading ? 'Carregando movimentações...' : 'Nenhuma movimentação registrada na área.'}
                  </td>
                </tr>
              ) : (
                movimentacoesData
                  .filter((m) =>
                    !searchTerm ||
                    m.produto_nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    m.motivo_diverso?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    m.tipo?.toLowerCase().includes(searchTerm.toLowerCase())
                  )
                  .map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-2.5 text-slate-500">
                        {new Date(m.data_movimentacao).toLocaleString('pt-BR')}
                      </td>
                      <td className="px-4 py-2.5 font-bold uppercase text-[11px]">
                        <span
                          className={`px-1.5 py-0.5 rounded ${
                            m.tipo === 'entrada'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-rose-50 text-rose-700'
                          }`}
                        >
                          {m.tipo}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-medium text-slate-800">{m.motivo_diverso || '—'}</td>
                      <td className="px-4 py-2.5 text-slate-900">{m.produto_nome}</td>
                      <td className="px-4 py-2.5 font-mono text-[11px]">{m.numero_lote || 'SEM LOTE'}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-slate-900">{m.quantidade}</td>
                      <td className="px-4 py-2.5 text-slate-600">{m.responsavel_nome || '—'}</td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Conteúdo da Aba 3: Validades */}
      {activeSubTab === 'validades' && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                <th className="px-4 py-3">Produto</th>
                <th className="px-4 py-3">Número do Lote</th>
                <th className="px-4 py-3">Data de Validade</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Saldo do Lote</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {validadesData.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    {loading ? 'Carregando lotes da área...' : 'Nenhum lote com validade registrado na área.'}
                  </td>
                </tr>
              ) : (
                validadesData
                  .filter((v) =>
                    !searchTerm ||
                    v.produto_nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    v.numero_lote?.toLowerCase().includes(searchTerm.toLowerCase())
                  )
                  .map((v) => (
                    <tr key={v.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-2.5 font-medium text-slate-900">{v.produto_nome}</td>
                      <td className="px-4 py-2.5 font-mono font-bold text-slate-800">{v.numero_lote}</td>
                      <td className="px-4 py-2.5 font-mono">{v.data_validade || 'S/V'}</td>
                      <td className="px-4 py-2.5">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                          {v.status_validade || 'Regular'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold text-slate-900">{v.quantidade_atual}</td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
