import React, { useState, useEffect, useMemo } from 'react';
import { Star, RefreshCw, MessageSquare, Award, ThumbsUp, AlertCircle, Filter, Search, ShieldCheck } from 'lucide-react';
import { getAuthHeaders } from '../utils/apiUtils.ts';

interface IndicadoresPerformanceViewProps {
  currentUser?: any;
}

export const IndicadoresPerformanceView: React.FC<IndicadoresPerformanceViewProps> = () => {
  const [data, setData] = useState<{
    stats: {
      total_avaliacoes: number;
      media_agilidade: number;
      media_qualidade: number;
      media_entrega: number;
      media_geral: number;
      total_excelentes: number;
      total_com_sugestao: number;
      percentual_excelencia: number;
    };
    avaliacoes: Array<{
      id: number;
      numero_requisicao: string;
      centro_custo_nome: string;
      solicitante_nome: string;
      data_atendimento: string;
      avaliacao_agilidade: number;
      avaliacao_qualidade: number;
      avaliacao_entrega: number;
      avaliacao_media: number;
      avaliacao_sugestao: string | null;
      avaliacao_data: string;
    }>;
  } | null>(null);

  const [loading, setLoading] = useState(true);
  const [filtroTexto, setFiltroTexto] = useState('');
  const [filtroApenasSugestao, setFiltroApenasSugestao] = useState(false);

  const fetchIndicadores = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/relatorios/indicadores-performance', {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Erro ao buscar indicadores de performance:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIndicadores();
  }, []);

  const avaliacoesFiltradas = useMemo(() => {
    if (!data?.avaliacoes) return [];
    return data.avaliacoes.filter((a) => {
      if (filtroApenasSugestao && (!a.avaliacao_sugestao || !a.avaliacao_sugestao.trim())) {
        return false;
      }
      if (filtroTexto.trim()) {
        const term = filtroTexto.trim().toLowerCase();
        const matchReq = a.numero_requisicao.toLowerCase().includes(term);
        const matchSetor = (a.centro_custo_nome || '').toLowerCase().includes(term);
        const matchUser = (a.solicitante_nome || '').toLowerCase().includes(term);
        const matchSug = (a.avaliacao_sugestao || '').toLowerCase().includes(term);
        if (!matchReq && !matchSetor && !matchUser && !matchSug) return false;
      }
      return true;
    });
  }, [data?.avaliacoes, filtroTexto, filtroApenasSugestao]);

  const renderStarsBadge = (rating: number) => {
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold font-mono ${
        rating >= 4.5
          ? 'bg-amber-100 text-amber-900 border border-amber-300'
          : rating >= 3.5
          ? 'bg-blue-100 text-blue-900 border border-blue-300'
          : 'bg-rose-100 text-rose-900 border border-rose-300'
      }`}>
        <Star className="w-3 h-3 fill-amber-400 text-amber-500" />
        <span>{rating ? rating.toFixed(1) : '—'}</span>
      </span>
    );
  };

  const stats = data?.stats || {
    total_avaliacoes: 0,
    media_agilidade: 0,
    media_qualidade: 0,
    media_entrega: 0,
    media_geral: 0,
    total_excelentes: 0,
    total_com_sugestao: 0,
    percentual_excelencia: 0,
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-500" />
            <h2 className="text-base font-bold text-slate-800">
              Indicadores de Avaliação de Performance do Atendimento
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Métricas de satisfação dos requisitantes sobre Agilidade, Qualidade e Cumprimento de Prazos de Entrega
          </p>
        </div>

        <button
          type="button"
          onClick={fetchIndicadores}
          disabled={loading}
          className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs flex items-center gap-2 transition-all cursor-pointer shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-600' : ''}`} />
          <span>Atualizar Indicadores</span>
        </button>
      </div>

      {/* KPI Cards de Performance */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Agilidade */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Agilidade</span>
            <Star className="w-4 h-4 text-amber-500 fill-amber-400" />
          </div>
          <div className="font-mono text-2xl font-bold text-slate-800">
            {stats.media_agilidade ? stats.media_agilidade.toFixed(1) : '—'} <span className="text-xs font-normal text-slate-400">/ 5.0</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Tempo de separação e resposta</p>
        </div>

        {/* Qualidade */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Qualidade</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="font-mono text-2xl font-bold text-slate-800">
            {stats.media_qualidade ? stats.media_qualidade.toFixed(1) : '—'} <span className="text-xs font-normal text-slate-400">/ 5.0</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Conferência e embalagem dos itens</p>
        </div>

        {/* Entrega */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Entrega & Prazos</span>
            <Award className="w-4 h-4 text-blue-600" />
          </div>
          <div className="font-mono text-2xl font-bold text-slate-800">
            {stats.media_entrega ? stats.media_entrega.toFixed(1) : '—'} <span className="text-xs font-normal text-slate-400">/ 5.0</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Pontualidade no setor requisitante</p>
        </div>

        {/* Média Geral */}
        <div className="bg-white p-4 rounded-xl border border-amber-300 bg-amber-50/30 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-amber-900 uppercase tracking-wider">Média Geral (NPS)</span>
            <ThumbsUp className="w-4 h-4 text-amber-600" />
          </div>
          <div className="font-mono text-2xl font-bold text-amber-950">
            {stats.media_geral ? stats.media_geral.toFixed(1) : '—'} ⭐
          </div>
          <p className="text-[11px] text-amber-800 mt-1">
            Index: <strong className="text-amber-900">{stats.percentual_excelencia}% 5 Estrelas</strong>
          </p>
        </div>

        {/* Total de Avaliações */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Avaliadas</span>
            <MessageSquare className="w-4 h-4 text-purple-600" />
          </div>
          <div className="font-mono text-2xl font-bold text-slate-800">
            {stats.total_avaliacoes}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {stats.total_com_sugestao} com sugestões de melhoria
          </p>
        </div>
      </div>

      {/* Lista de Avaliações e Sugestões "O que podemos melhorar?" */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-[#00237D]" />
              Sugestões & Oportunidades de Melhoria (&ldquo;O que podemos melhorar?&rdquo;)
            </h3>
            <p className="text-xs text-slate-500">
              Registros individuais de avaliação deixados pelos requisitantes no encerramento de seus pedidos
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={filtroTexto}
                onChange={(e) => setFiltroTexto(e.target.value)}
                placeholder="Buscar solicitação, setor..."
                className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-[#00237D]"
              />
            </div>

            <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer select-none shrink-0 font-medium">
              <input
                type="checkbox"
                checked={filtroApenasSugestao}
                onChange={(e) => setFiltroApenasSugestao(e.target.checked)}
                className="rounded text-[#00237D] focus:ring-[#00237D]"
              />
              <span>Apenas com Comentário</span>
            </label>
          </div>
        </div>

        {/* Tabela de Avaliações */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 uppercase font-bold tracking-wider">
                <th className="py-2.5 px-3">Data / Hora</th>
                <th className="py-2.5 px-3">Requisição</th>
                <th className="py-2.5 px-3">Setor / Solicitante</th>
                <th className="py-2.5 px-3 text-center">Agilidade</th>
                <th className="py-2.5 px-3 text-center">Qualidade</th>
                <th className="py-2.5 px-3 text-center">Entrega</th>
                <th className="py-2.5 px-3 text-center">Média Geral</th>
                <th className="py-2.5 px-3">O que podemos melhorar? / Feedback</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {avaliacoesFiltradas.length > 0 ? (
                avaliacoesFiltradas.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                      {a.avaliacao_data ? new Date(a.avaliacao_data).toLocaleString('pt-BR') : '—'}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-[#00237D] whitespace-nowrap">
                      {a.numero_requisicao}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-slate-800">{a.centro_custo_nome || '—'}</div>
                      <div className="text-[11px] text-slate-500">{a.solicitante_nome}</div>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {renderStarsBadge(a.avaliacao_agilidade)}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {renderStarsBadge(a.avaliacao_qualidade)}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {renderStarsBadge(a.avaliacao_entrega)}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="font-mono font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                        {a.avaliacao_media ? a.avaliacao_media.toFixed(1) : '5.0'} ⭐
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-700 italic">
                      {a.avaliacao_sugestao ? (
                        <div className="p-2 bg-amber-50/60 rounded border border-amber-200/80 text-amber-900 not-italic text-[11px] font-medium leading-relaxed">
                          &ldquo;{a.avaliacao_sugestao}&rdquo;
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[11px] not-italic">— Avaliado com 5 estrelas sem ressalvas —</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    {loading
                      ? 'Carregando indicadores de avaliação...'
                      : 'Nenhuma avaliação encontrada com os filtros selecionados.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
