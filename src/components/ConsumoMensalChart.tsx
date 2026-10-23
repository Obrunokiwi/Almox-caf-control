import React, { useState, useEffect, useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { TrendingUp, RefreshCw } from 'lucide-react';
import type { CentroCusto, Produto, Movimentacao } from '../types/index.ts';
import { SearchableSelect, type SearchableOption } from './SearchableSelect.tsx';

interface ConsumoMensalChartProps {
  centrosCusto: CentroCusto[];
  produtos: Produto[];
  movimentacoes?: Movimentacao[];
}

interface SerieCentroCusto {
  id: number;
  codigo: string;
  nome: string;
  departamento?: string;
  key_qtd: string;
  key_valor: string;
  total_quantidade: number;
  total_valor: number;
}

interface ResumoConsumo {
  total_quantidade_periodo: number;
  total_valor_periodo: number;
  media_mensal_qtd: number;
  media_mensal_valor: number;
  mes_pico_label: string;
  mes_pico_qtd: number;
}

const LINE_PALETTE = [
  '#00237D', // Azul Royal Santa Casa
  '#059669', // Verde Esmeralda
  '#C2363A', // Vermelho Santa Casa
  '#0284c7', // Azul Celeste Escuro
  '#d97706', // Âmbar
  '#7c3aed', // Violeta
  '#0d9488', // Teal
  '#db2777', // Rosa Escuro
];

export const ConsumoMensalChart: React.FC<ConsumoMensalChartProps> = ({
  centrosCusto,
  produtos,
  movimentacoes = [],
}) => {
  const [selectedProdutoId, setSelectedProdutoId] = useState<string>('');
  const [selectedCcId, setSelectedCcId] = useState<string>('');
  const [periodoMeses, setPeriodoMeses] = useState<6 | 12>(6);
  const [metrica, setMetrica] = useState<'quantidade' | 'valor'>('quantidade');
  const [showTotalLine, setShowTotalLine] = useState<boolean>(true);
  const [hiddenSeriesIds, setHiddenSeriesIds] = useState<Record<number, boolean>>({});

  const produtoFilterOptions: SearchableOption[] = useMemo(() => {
    return [
      { value: '', label: 'Todos os Produtos Consumíveis' },
      ...produtos
        .filter((p) => p.ativo !== 0)
        .map((p) => ({
          value: String(p.id),
          label: `${p.codigo} - ${p.nome} (${p.unidade_medida})`,
        })),
    ];
  }, [produtos]);

  const centroCustoFilterOptions: SearchableOption[] = useMemo(() => {
    return [
      { value: '', label: 'Todos os Centros de Custo' },
      ...centrosCusto
        .filter((cc) => cc.ativo !== 0)
        .map((cc) => ({
          value: String(cc.id),
          label: `${cc.codigo} - ${cc.nome}`,
        })),
    ];
  }, [centrosCusto]);

  const [apiData, setApiData] = useState<{
    dados_mensais: Array<Record<string, any>>;
    series: SerieCentroCusto[];
    resumo: ResumoConsumo;
  } | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Cálculo local imediato (fallback / zero-latency) a partir das props
  const fallbackComputed = useMemo(() => {
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const now = new Date();
    const monthsList: Array<{ ano_mes: string; label: string }> = [];

    for (let i = periodoMeses - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yy = String(yyyy).slice(-2);
      monthsList.push({
        ano_mes: `${yyyy}-${mm}`,
        label: `${monthNames[d.getMonth()]}/${yy}`,
      });
    }

    const activeCentros = centrosCusto.filter((cc) => {
      if (cc.ativo === 0) return false;
      if (selectedCcId && String(cc.id) !== selectedCcId) return false;
      return true;
    });

    const prodMap = new Map<number, Produto>();
    for (const p of produtos) {
      prodMap.set(p.id, p);
    }

    const dataMap = new Map<string, { qtd: number; valor: number }>();

    for (const m of movimentacoes) {
      if (m.tipo !== 'saida' && m.tipo !== 'estorno_saida') continue;
      if (!m.centro_custo_id || !m.data_movimentacao) continue;
      if (selectedProdutoId && String(m.produto_id) !== selectedProdutoId) continue;
      if (selectedCcId && String(m.centro_custo_id) !== selectedCcId) continue;

      const dt = new Date(m.data_movimentacao);
      if (isNaN(dt.getTime())) continue;
      const anoMes = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
      const key = `${anoMes}_${m.centro_custo_id}`;

      const prod = prodMap.get(m.produto_id);
      const vUnit = Number(m.valor_unitario ?? prod?.valor_unitario ?? 0);
      const sign = m.tipo === 'saida' ? 1 : -1;
      const deltaQtd = sign * Number(m.quantidade || 0);
      const deltaValor = deltaQtd * vUnit;

      const prev = dataMap.get(key) || { qtd: 0, valor: 0 };
      dataMap.set(key, {
        qtd: Math.max(0, prev.qtd + deltaQtd),
        valor: Math.max(0, prev.valor + deltaValor),
      });
    }

    const seriesTotals = new Map<number, { qtd: number; valor: number }>();
    for (const cc of activeCentros) {
      seriesTotals.set(cc.id, { qtd: 0, valor: 0 });
    }

    let totalQuantidadePeriodo = 0;
    let totalValorPeriodo = 0;
    let mesPicoLabel = monthsList[monthsList.length - 1]?.label || '-';
    let mesPicoQtd = 0;

    const chartData = monthsList.map((m) => {
      const point: Record<string, any> = {
        ano_mes: m.ano_mes,
        mes_label: m.label,
        total_quantidade: 0,
        total_valor: 0,
      };

      for (const cc of activeCentros) {
        const found = dataMap.get(`${m.ano_mes}_${cc.id}`);
        const qtd = found ? Number(found.qtd.toFixed(2)) : 0;
        const valor = found ? Number(found.valor.toFixed(2)) : 0;

        point[`cc_${cc.id}_qtd`] = qtd;
        point[`cc_${cc.id}_valor`] = valor;
        point.total_quantidade = Number((point.total_quantidade + qtd).toFixed(2));
        point.total_valor = Number((point.total_valor + valor).toFixed(2));

        const acc = seriesTotals.get(cc.id)!;
        acc.qtd = Number((acc.qtd + qtd).toFixed(2));
        acc.valor = Number((acc.valor + valor).toFixed(2));
      }

      totalQuantidadePeriodo = Number((totalQuantidadePeriodo + point.total_quantidade).toFixed(2));
      totalValorPeriodo = Number((totalValorPeriodo + point.total_valor).toFixed(2));

      if (point.total_quantidade >= mesPicoQtd && point.total_quantidade > 0) {
        mesPicoQtd = point.total_quantidade;
        mesPicoLabel = m.label;
      }

      return point;
    });

    const series: SerieCentroCusto[] = activeCentros.map((cc) => {
      const totals = seriesTotals.get(cc.id) || { qtd: 0, valor: 0 };
      return {
        id: cc.id,
        codigo: cc.codigo,
        nome: cc.nome,
        departamento: cc.departamento,
        key_qtd: `cc_${cc.id}_qtd`,
        key_valor: `cc_${cc.id}_valor`,
        total_quantidade: totals.qtd,
        total_valor: totals.valor,
      };
    });

    return {
      dados_mensais: chartData,
      series,
      resumo: {
        total_quantidade_periodo: totalQuantidadePeriodo,
        total_valor_periodo: totalValorPeriodo,
        media_mensal_qtd: Number((totalQuantidadePeriodo / periodoMeses).toFixed(1)),
        media_mensal_valor: Number((totalValorPeriodo / periodoMeses).toFixed(2)),
        mes_pico_label: mesPicoLabel,
        mes_pico_qtd: mesPicoQtd,
      },
    };
  }, [centrosCusto, produtos, movimentacoes, selectedProdutoId, selectedCcId, periodoMeses]);

  const fetchConsumoMensal = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('meses', String(periodoMeses));
      if (selectedProdutoId) params.set('produto_id', selectedProdutoId);
      if (selectedCcId) params.set('centro_custo_id', selectedCcId);

      const res = await fetch(`/api/relatorios/consumo-mensal?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setApiData(json);
      }
    } catch {
      // Mantém cálculo local em caso de falha de rede
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConsumoMensal();
  }, [selectedProdutoId, selectedCcId, periodoMeses, movimentacoes.length, centrosCusto.length]);

  const effectiveData = apiData || fallbackComputed;
  const chartRows = effectiveData.dados_mensais;
  const seriesList = effectiveData.series;
  const resumo = effectiveData.resumo;

  const selectedProdutoObj = useMemo(
    () => produtos.find((p) => String(p.id) === selectedProdutoId) || null,
    [produtos, selectedProdutoId]
  );

  const toggleSeriesVisibility = (id: number) => {
    setHiddenSeriesIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const formatMetricValue = (val: number) => {
    if (metrica === 'valor') {
      return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }
    const un = selectedProdutoObj?.unidade_medida || 'un.';
    return `${val.toLocaleString('pt-BR')} ${un}`;
  };

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-6">
      {/* Cabeçalho e Filtros Interativos */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <TrendingUp className="w-4 h-4 text-[#00237D]" />
            <span>Análise Histórica de Dispensação</span>
            <span aria-hidden="true">·</span>
            <span>Últimos {periodoMeses} meses</span>
            {selectedProdutoObj && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-semibold text-slate-700">
                  {selectedProdutoObj.codigo} - {selectedProdutoObj.nome}
                </span>
              </>
            )}
          </div>
          <h2 className="text-base font-bold text-slate-900">
            Histórico de Consumo Mensal de Produtos por Centro de Custo
          </h2>
        </div>

        {/* Barra de Controles */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Filtro de Produto */}
          <div className="w-56">
            <SearchableSelect
              options={produtoFilterOptions}
              value={selectedProdutoId}
              onChange={(val) => setSelectedProdutoId(val ? String(val) : '')}
              placeholder="Todos os Produtos..."
              allowClear
            />
          </div>

          {/* Filtro de Centro de Custo */}
          <div className="w-56">
            <SearchableSelect
              options={centroCustoFilterOptions}
              value={selectedCcId}
              onChange={(val) => setSelectedCcId(val ? String(val) : '')}
              placeholder="Todos os Centros de Custo..."
              allowClear
            />
          </div>

          {/* Seletor de Métrica (Quantidade vs Valor) */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setMetrica('quantidade')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                metrica === 'quantidade'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Quantidade
            </button>
            <button
              type="button"
              onClick={() => setMetrica('valor')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                metrica === 'valor'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Valor (R$)
            </button>
          </div>

          {/* Seletor de Janela de Tempo (6M / 12M) */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setPeriodoMeses(6)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                periodoMeses === 6
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              6 Meses
            </button>
            <button
              type="button"
              onClick={() => setPeriodoMeses(12)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                periodoMeses === 12
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              12 Meses
            </button>
          </div>

          <button
            type="button"
            onClick={fetchConsumoMensal}
            disabled={loading}
            title="Atualizar dados do gráfico"
            className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#00237D]' : ''}`} />
          </button>
        </div>
      </div>

      {/* Faixa de Métricas Consolidadas do Período */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 py-2 border-b border-slate-100">
        <div>
          <span className="text-xs text-slate-500 block">Consumo Total no Período</span>
          <span className="text-lg font-semibold text-slate-900 font-mono tabular-nums">
            {metrica === 'valor'
              ? resumo.total_valor_periodo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
              : `${resumo.total_quantidade_periodo.toLocaleString('pt-BR')} ${selectedProdutoObj?.unidade_medida || 'un.'}`}
          </span>
        </div>

        <div>
          <span className="text-xs text-slate-500 block">Média Mensal de Saídas</span>
          <span className="text-lg font-semibold text-slate-900 font-mono tabular-nums">
            {metrica === 'valor'
              ? resumo.media_mensal_valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
              : `${resumo.media_mensal_qtd.toLocaleString('pt-BR')} ${selectedProdutoObj?.unidade_medida || 'un.'}/mês`}
          </span>
        </div>

        <div>
          <span className="text-xs text-slate-500 block">Mês de Maior Demanda</span>
          <span className="text-lg font-semibold text-[#00237D] font-mono tabular-nums">
            {resumo.mes_pico_qtd > 0 ? `${resumo.mes_pico_label} (${resumo.mes_pico_qtd} un.)` : 'Sem pico registrado'}
          </span>
        </div>

        <div>
          <span className="text-xs text-slate-500 block">Centros de Custo Monitorados</span>
          <span className="text-lg font-semibold text-slate-900 font-mono tabular-nums">
            {seriesList.length} setor(es)
          </span>
        </div>
      </div>

      {/* Seletores Rápidos de Séries (Linhas por Centro de Custo) */}
      {seriesList.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500 mr-1">Séries visíveis:</span>
          <button
            type="button"
            onClick={() => setShowTotalLine((prev) => !prev)}
            className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              showTotalLine
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-slate-400 inline-block" />
            <span>Total Consolidado</span>
          </button>

          {seriesList.map((s, idx) => {
            const color = LINE_PALETTE[idx % LINE_PALETTE.length];
            const isHidden = !!hiddenSeriesIds[s.id];
            const totalSerie = metrica === 'valor' ? s.total_valor : s.total_quantidade;

            return (
              <button
                key={s.id}
                type="button"
                onClick={() => toggleSeriesVisibility(s.id)}
                className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  !isHidden
                    ? 'bg-slate-50 text-slate-800 border-slate-300'
                    : 'bg-white text-slate-400 border-slate-200 opacity-60'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: isHidden ? '#cbd5e1' : color }}
                />
                <span>
                  {s.codigo} - {s.nome}
                </span>
                <span className="font-mono tabular-nums text-[11px] text-slate-500">
                  ({metrica === 'valor'
                    ? totalSerie.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                    : totalSerie.toLocaleString('pt-BR')})
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Área do Gráfico Recharts LineChart */}
      <div className="w-full h-80 pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartRows}
            margin={{ top: 10, right: 24, left: 8, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="mes_label"
              tick={{ fill: '#475569', fontSize: 12 }}
              axisLine={{ stroke: '#cbd5e1' }}
              tickLine={{ stroke: '#cbd5e1' }}
            />
            <YAxis
              tick={{ fill: '#475569', fontSize: 11 }}
              axisLine={{ stroke: '#cbd5e1' }}
              tickLine={{ stroke: '#cbd5e1' }}
              allowDecimals={metrica === 'valor'}
              tickFormatter={(value: number) =>
                metrica === 'valor'
                  ? `R$ ${Number(value).toLocaleString('pt-BR')}`
                  : Number(value).toLocaleString('pt-BR')
              }
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#ffffff',
                borderColor: '#cbd5e1',
                borderRadius: '8px',
                fontSize: '12px',
                boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
              }}
              formatter={(value: any, name: any) => [
                formatMetricValue(Number(value) || 0),
                String(name),
              ]}
              labelStyle={{ fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}
            />
            <Legend
              wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}
            />

            {/* Linha tracejada opcional do Total Consolidado */}
            {showTotalLine && (
              <Line
                type="monotone"
                dataKey={metrica === 'valor' ? 'total_valor' : 'total_quantidade'}
                name="Total Consolidado (Todos os Setores)"
                stroke="#334155"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={{ r: 3.5, fill: '#334155' }}
                activeDot={{ r: 5.5 }}
              />
            )}

            {/* Uma Linha para cada Centro de Custo */}
            {seriesList.map((serie, idx) => {
              if (hiddenSeriesIds[serie.id]) return null;
              const strokeColor = LINE_PALETTE[idx % LINE_PALETTE.length];
              const dataKey = metrica === 'valor' ? serie.key_valor : serie.key_qtd;

              return (
                <Line
                  key={serie.id}
                  type="monotone"
                  dataKey={dataKey}
                  name={`${serie.codigo} - ${serie.nome}`}
                  stroke={strokeColor}
                  strokeWidth={2.5}
                  dot={{ r: 4, strokeWidth: 1.5, fill: '#ffffff', stroke: strokeColor }}
                  activeDot={{ r: 6, strokeWidth: 0, fill: strokeColor }}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Nota informativa caso ainda não haja movimentações de saída no período */}
      {resumo.total_quantidade_periodo === 0 && (
        <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500">
          <span>
            Ainda não há baixas de saída registradas para os filtros selecionados neste período. Assim que requisições forem atendidas pelo almoxarifado, as curvas de consumo mensal por Centro de Custo serão exibidas acima.
          </span>
          {(selectedProdutoId || selectedCcId) && (
            <button
              type="button"
              onClick={() => {
                setSelectedProdutoId('');
                setSelectedCcId('');
              }}
              className="text-[#00237D] font-semibold hover:underline shrink-0 cursor-pointer"
            >
              Limpar filtros aplicados
            </button>
          )}
        </div>
      )}
    </section>
  );
};
