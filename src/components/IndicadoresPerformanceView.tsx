import React, { useState, useEffect, useMemo } from 'react';
import {
  Star,
  RefreshCw,
  MessageSquare,
  Award,
  ThumbsUp,
  Smile,
  Frown,
  Search,
  ShieldCheck,
  Clock,
  CheckCircle2,
  UserCheck,
} from 'lucide-react';
import { getAuthHeaders } from '../utils/apiUtils.ts';

interface IndicadoresPerformanceViewProps {
  currentUser?: any;
}

export const IndicadoresPerformanceView: React.FC<IndicadoresPerformanceViewProps> = ({ currentUser }) => {
  const isRequisitante = currentUser?.perfil === 'requisitante';

  const [data, setData] = useState<{
    stats: {
      total_avaliacoes: number;
      total_pendentes?: number;
      media_agilidade: number;
      media_qualidade: number;
      media_entrega: number;
      media_geral: number;
      total_excelentes: number;
      total_com_sugestao: number;
      percentual_excelencia: number;
      perguntas?: {
        horario_previsto: { otimo: number; bom: number; ruim: number };
        conforme_solicitado: { otimo: number; bom: number; ruim: number };
        funcionario_educado: { otimo: number; bom: number; ruim: number };
      };
    };
    avaliacoes: Array<{
      id: number;
      numero_requisicao: string;
      centro_custo_nome: string;
      solicitante_nome: string;
      status?: string;
      data_atendimento: string;
      avaliacao_agilidade: number;
      avaliacao_qualidade: number;
      avaliacao_entrega: number;
      avaliacao_media: number;
      avaliacao_sugestao: string | null;
      avaliacao_data: string;
      resp_horario_previsto?: string;
      resp_conforme_solicitado?: string;
      resp_funcionario_educado?: string;
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

  const classificarNota = (nota: number): { label: 'Ótimo' | 'Bom' | 'Ruim'; cls: string } => {
    const n = Number(nota || 0);
    if (n >= 4) {
      return {
        label: 'Ótimo',
        cls: 'bg-emerald-100 text-emerald-900 border border-emerald-300',
      };
    }
    if (n >= 2.5) {
      return {
        label: 'Bom',
        cls: 'bg-blue-100 text-blue-900 border border-blue-300',
      };
    }
    return {
      label: 'Ruim',
      cls: 'bg-rose-100 text-rose-900 border border-rose-300',
    };
  };

  const renderConceitoBadge = (nota: number) => {
    const c = classificarNota(nota);
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${c.cls}`}>
        <span>{c.label}</span>
      </span>
    );
  };

  const stats = data?.stats || {
    total_avaliacoes: 0,
    total_pendentes: 0,
    media_agilidade: 0,
    media_qualidade: 0,
    media_entrega: 0,
    media_geral: 0,
    total_excelentes: 0,
    total_com_sugestao: 0,
    percentual_excelencia: 0,
    perguntas: {
      horario_previsto: { otimo: 0, bom: 0, ruim: 0 },
      conforme_solicitado: { otimo: 0, bom: 0, ruim: 0 },
      funcionario_educado: { otimo: 0, bom: 0, ruim: 0 },
    },
  };

  const perguntasStats = stats.perguntas || {
    horario_previsto: { otimo: 0, bom: 0, ruim: 0 },
    conforme_solicitado: { otimo: 0, bom: 0, ruim: 0 },
    funcionario_educado: { otimo: 0, bom: 0, ruim: 0 },
  };

  const calcPct = (qtd: number) => {
    if (!stats.total_avaliacoes) return 0;
    return Math.round((qtd / stats.total_avaliacoes) * 100);
  };

  const renderCardPergunta = (
    titulo: string,
    subtitulo: string,
    icone: React.ReactNode,
    contagem: { otimo: number; bom: number; ruim: number },
    mediaNota: number
  ) => (
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-xs font-bold text-slate-900 block">{titulo}</span>
          <span className="text-[11px] text-slate-500">{subtitulo}</span>
        </div>
        <div className="p-2 rounded-lg bg-slate-100 text-slate-700 shrink-0">{icone}</div>
      </div>

      <div className="grid grid-cols-3 gap-2 pt-1">
        <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-center">
          <div className="text-[10px] font-bold uppercase text-emerald-800 flex items-center justify-center gap-1">
            <ThumbsUp className="w-3 h-3" /> Ótimo
          </div>
          <div className="text-base font-bold text-emerald-950 font-mono mt-0.5">{contagem.otimo}</div>
          <div className="text-[10px] text-emerald-700">{calcPct(contagem.otimo)}%</div>
        </div>

        <div className="p-2 rounded-lg bg-blue-50 border border-blue-200 text-center">
          <div className="text-[10px] font-bold uppercase text-blue-800 flex items-center justify-center gap-1">
            <Smile className="w-3 h-3" /> Bom
          </div>
          <div className="text-base font-bold text-blue-950 font-mono mt-0.5">{contagem.bom}</div>
          <div className="text-[10px] text-blue-700">{calcPct(contagem.bom)}%</div>
        </div>

        <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-center">
          <div className="text-[10px] font-bold uppercase text-rose-800 flex items-center justify-center gap-1">
            <Frown className="w-3 h-3" /> Ruim
          </div>
          <div className="text-base font-bold text-rose-950 font-mono mt-0.5">{contagem.ruim}</div>
          <div className="text-[10px] text-rose-700">{calcPct(contagem.ruim)}%</div>
        </div>
      </div>

      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
        <span>Nota Média Equivalente:</span>
        <strong className="font-mono text-slate-800">
          {mediaNota ? mediaNota.toFixed(1) : '—'} / 5.0
        </strong>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-500" />
            <h2 className="text-base font-bold text-slate-800">
              Indicadores de Qualidade — Avaliação no Encerramento das Requisições
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {isRequisitante
              ? 'Resumo exclusivo das avaliações registradas nas suas próprias requisições.'
              : 'Consolidado das respostas às 3 perguntas de qualidade no encerramento das requisições da área ativa.'}
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

      {/* Cards das 3 Perguntas Obrigatórias (Ótimo / Bom / Ruim) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {renderCardPergunta(
          '1. Foi entregue no horário previsto?',
          'Cumprimento do prazo previsto de entrega',
          <Clock className="w-4 h-4 text-blue-600" />,
          perguntasStats.horario_previsto,
          stats.media_entrega
        )}
        {renderCardPergunta(
          '2. O pedido foi entregue conforme solicitado?',
          'Conformidade dos itens e quantidades entregues',
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />,
          perguntasStats.conforme_solicitado,
          stats.media_qualidade
        )}
        {renderCardPergunta(
          '3. O funcionário foi educado?',
          'Cordialidade e postura no atendimento',
          <UserCheck className="w-4 h-4 text-indigo-600" />,
          perguntasStats.funcionario_educado,
          stats.media_agilidade
        )}
      </div>

      {/* Resumo Geral */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-amber-300 bg-amber-50/30 shadow-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold text-amber-900 uppercase tracking-wider">
              Índice Geral de Qualidade
            </span>
            <Star className="w-4 h-4 text-amber-500 fill-amber-400" />
          </div>
          <div className="font-mono text-2xl font-bold text-amber-950">
            {stats.media_geral ? stats.media_geral.toFixed(1) : '—'}{' '}
            <span className="text-xs font-normal text-amber-800">/ 5.0</span>
          </div>
          <p className="text-[11px] text-amber-800 mt-1">
            Índice Ótimo: <strong>{stats.percentual_excelencia}%</strong> das avaliações
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Requisições Avaliadas
            </span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="font-mono text-2xl font-bold text-slate-800">{stats.total_avaliacoes}</div>
          <p className="text-[11px] text-slate-500 mt-1">
            {stats.total_pendentes || 0} requisição(ões) aguardando avaliação
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Observações / Sugestões
            </span>
            <MessageSquare className="w-4 h-4 text-purple-600" />
          </div>
          <div className="font-mono text-2xl font-bold text-slate-800">{stats.total_com_sugestao}</div>
          <p className="text-[11px] text-slate-500 mt-1">Registros com comentários ou oportunidades de melhoria</p>
        </div>
      </div>

      {/* Lista de Avaliações Registradas */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-[#00237D]" />
              Histórico de Requisições Avaliadas
            </h3>
            <p className="text-xs text-slate-500">
              Respostas registradas no encerramento das requisições (preservando todo o histórico anterior)
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={filtroTexto}
                onChange={(e) => setFiltroTexto(e.target.value)}
                placeholder="Buscar requisição, setor..."
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
              <span>Apenas com Observação</span>
            </label>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 uppercase font-bold tracking-wider">
                <th className="py-2.5 px-3">Data / Hora</th>
                <th className="py-2.5 px-3">Requisição</th>
                <th className="py-2.5 px-3">Setor / Solicitante</th>
                <th className="py-2.5 px-3 text-center">1. Horário Previsto?</th>
                <th className="py-2.5 px-3 text-center">2. Conforme Solicitado?</th>
                <th className="py-2.5 px-3 text-center">3. Funcionário Educado?</th>
                <th className="py-2.5 px-3">Observações / Feedback</th>
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
                    <td className="py-2.5 px-3 text-center">{renderConceitoBadge(a.avaliacao_entrega)}</td>
                    <td className="py-2.5 px-3 text-center">{renderConceitoBadge(a.avaliacao_qualidade)}</td>
                    <td className="py-2.5 px-3 text-center">{renderConceitoBadge(a.avaliacao_agilidade)}</td>
                    <td className="py-2.5 px-3 text-slate-700">
                      {a.avaliacao_sugestao ? (
                        <div className="p-2 bg-amber-50/60 rounded border border-amber-200/80 text-amber-900 text-[11px] font-medium leading-relaxed">
                          &ldquo;{a.avaliacao_sugestao}&rdquo;
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[11px]">Sem observações adicionais</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    {loading
                      ? 'Carregando indicadores de qualidade...'
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
