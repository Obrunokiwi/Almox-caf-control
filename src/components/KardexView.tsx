import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  BookOpen, 
  Search, 
  Printer, 
  FileText, 
  Calendar, 
  ArrowLeft, 
  Package, 
  RefreshCw,
  Layers,
  ArrowUpRight,
  ArrowDownLeft,
  Info,
  AlertTriangle,
  RotateCcw
} from 'lucide-react';
import type { Usuario, Produto } from '../types/index.ts';
import { AutocompleteSelect, type AutocompleteOption } from './AutocompleteSelect.tsx';

interface KardexViewProps {
  produtos: Produto[];
  currentUser: Usuario | null;
  onVoltar: () => void;
  onNavigate?: (tab: string) => void;
}

// Formata data e hora no horário brasileiro com segundos (dd/mm/aaaa HH:mm:ss)
export function formatDataHoraBrasilia(dataStr: string): string {
  if (!dataStr) return '-';
  try {
    const cleaned = dataStr.includes('T') ? dataStr : dataStr.replace(' ', 'T');
    const d = new Date(cleaned);
    if (isNaN(d.getTime())) return dataStr;
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const ano = d.getFullYear();
    const hora = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const seg = String(d.getSeconds()).padStart(2, '0');
    return `${dia}/${mes}/${ano} ${hora}:${min}:${seg}`;
  } catch {
    return dataStr;
  }
}

export const KardexView: React.FC<KardexViewProps> = ({
  produtos = [],
  currentUser,
  onVoltar,
}) => {
  const get30DaysAgo = () => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    const ano = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
  };

  const getToday = () => {
    const d = new Date();
    const ano = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
  };

  const [selectedProdutoId, setSelectedProdutoId] = useState<number | null>(
    produtos[0]?.id || null
  );
  const [dataInicio, setDataInicio] = useState<string>(get30DaysAgo());
  const [dataFim, setDataFim] = useState<string>(getToday());
  
  const [kardexData, setKardexData] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Consulta ao endpoint do Kardex no backend para a área ativa
  const fetchKardex = useCallback(async () => {
    if (!selectedProdutoId) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      const token = localStorage.getItem('multi_almox_token');
      const areaSigla = localStorage.getItem('multi_almox_area_sigla') || currentUser?.area_sigla || 'ALM';

      const queryParams = new URLSearchParams({
        produto_id: String(selectedProdutoId),
        data_inicio: dataInicio,
        data_fim: dataFim,
      });

      const res = await fetch(`/api/kardex?${queryParams.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Area-Sigla': areaSigla,
        },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao carregar Kardex do produto.');
      }

      setKardexData(data);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao carregar dados do Kardex.');
      setKardexData(null);
    } finally {
      setLoading(false);
    }
  }, [selectedProdutoId, dataInicio, dataFim, currentUser?.area_sigla]);

  // Carrega automaticamente o primeiro produto ao abrir a tela
  useEffect(() => {
    if (selectedProdutoId) {
      fetchKardex();
    }
  }, [selectedProdutoId, fetchKardex]);

  // Prepara as opções de produtos com suporte a autocomplete completo
  const produtoOptions: AutocompleteOption[] = useMemo(() => {
    return produtos.map((p) => ({
      value: p.id,
      label: `${p.codigo} — ${p.nome}`,
      secondaryLabel: `UND: ${p.unidade_medida} · Saldo em Estoque: ${p.quantidade_atual}`,
      badge: p.quantidade_atual <= 0 ? 'Sem Saldo' : `Saldo: ${p.quantidade_atual}`,
      badgeVariant: p.quantidade_atual <= 0 ? 'danger' : 'regular',
      keywords: `${p.codigo} ${p.nome} ${p.unidade_medida}`,
    }));
  }, [produtos]);

  // Exportar Kardex para arquivo CSV
  const handleExportCSV = () => {
    if (!kardexData || !kardexData.movimentacoes) return;

    const prod = kardexData.produto;
    const lines = [
      `KARDEX INDIVIDUAL DO PRODUTO`,
      `Área:;${currentUser?.area_sigla || 'ALM'}`,
      `Produto:;${prod.codigo} - ${prod.nome}`,
      `Unidade de Medida:;${prod.unidade_medida}`,
      `Período Analisado:;${kardexData.periodo.data_inicio.split('-').reverse().join('/')} até ${kardexData.periodo.data_fim.split('-').reverse().join('/')}`,
      `Saldo Anterior ao Período:;${kardexData.saldo_inicial ?? 0}`,
      `Saldo Atual em Estoque:;${prod.quantidade_atual ?? 0}`,
      `Total Entradas no Período:;${kardexData.total_entradas ?? 0}`,
      `Total Saídas no Período:;${kardexData.total_saidas ?? 0}`,
      `Saldo Final do Período:;${kardexData.saldo_final ?? 0}`,
      ``,
      `Data/Hora;Tipo / Operação;Documento;Lote;Validade;Entrada;Saída;Saldo Pós-Movimentação;Operador;Setor/Fornecedor`,
    ];

    kardexData.movimentacoes.forEach((m: any) => {
      const dataHora = formatDataHoraBrasilia(m.data_movimentacao);
      const valStr = m.data_validade ? m.data_validade.split('-').reverse().join('/') : '-';
      const operador = m.usuario_nome || '-';
      const setorOuForn = m.centro_custo_nome || m.fornecedor_nome || '-';

      lines.push(
        `"${dataHora}";"${m.motivo_diverso || m.tipo}";"${m.documento_referencia || '-'}";"${m.numero_lote || 'S/LOTE'}";"${valStr}";${m.entrada || 0};${m.saida || 0};${m.saldo_apos};"${operador}";"${setorOuForn}"`
      );
    });

    lines.push(``);
    lines.push(`Desenvolvido por Bruno Rocha - DPO`);

    const csvContent = '\uFEFF' + lines.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `kardex_${prod.codigo}_${getToday()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  const activeProd = kardexData?.produto || produtos.find((p) => p.id === selectedProdutoId);

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Cabeçalho da Tela */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs print:hidden">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onVoltar}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            title="Voltar ao Painel"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="p-2.5 bg-indigo-50 text-indigo-700 rounded-xl border border-indigo-100">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900">Kardex do Produto</h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-indigo-100 text-indigo-800 border border-indigo-200">
                Somente Leitura
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-teal-100 text-teal-800 border border-teal-200">
                Área: {currentUser?.area_sigla || 'ALM'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Extrato cronológico completo, auditável e evolução de saldo físico/financeiro
            </p>
          </div>
        </div>

        {/* Ações de Impressão e Exportação */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            type="button"
            onClick={handleExportCSV}
            disabled={!kardexData || kardexData.movimentacoes.length === 0}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-xs rounded-xl transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer"
            title="Exportar dados do Kardex para CSV"
          >
            <FileText className="w-4 h-4" />
            <span>Exportar CSV</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            disabled={!kardexData}
            className="px-3.5 py-2 bg-[#00237D] hover:bg-[#001858] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-xs rounded-xl transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer"
            title="Imprimir relatório analítico do Kardex"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir</span>
          </button>
        </div>
      </div>

      {/* 1. PAINEL DE SELEÇÃO E FILTROS */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4 print:hidden">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          {/* Seletor de Produto */}
          <div className="md:col-span-5 space-y-1">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-indigo-600" />
              <span>Produto do Catálogo ({currentUser?.area_sigla || 'ALM'}) *</span>
            </label>
            <AutocompleteSelect
              options={produtoOptions}
              value={selectedProdutoId}
              onChange={(val) => {
                const nextId = val ? Number(val) : null;
                setSelectedProdutoId(nextId);
              }}
              placeholder="Digite código ou qualquer parte da descrição..."
              emptyCatalogMessage="Nenhum produto cadastrado no catálogo desta área."
              emptyMessage="Nenhum produto encontrado com esse código ou descrição."
            />
          </div>

          {/* Data Início */}
          <div className="md:col-span-2 space-y-1">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <span>Data Início *</span>
            </label>
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 shadow-2xs"
            />
          </div>

          {/* Data Fim */}
          <div className="md:col-span-2 space-y-1">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <span>Data Fim *</span>
            </label>
            <input
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:bg-white focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 shadow-2xs"
            />
          </div>

          {/* Botão Consultar Kardex */}
          <div className="md:col-span-3 flex items-end">
            <button
              type="button"
              onClick={fetchKardex}
              disabled={loading || !selectedProdutoId}
              className="w-full py-2.5 px-4 bg-[#00237D] hover:bg-[#001c66] disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer min-h-[42px]"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? 'Consultando...' : 'Consultar Kardex'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Mensagem de Erro se houver falha */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* 2. CABEÇALHO DO PRODUTO (CARD DE RESUMO) & 3. TABELA CRONOLÓGICA */}
      {activeProd && kardexData && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6 print:shadow-none print:border-none print:p-0">
          {/* Cabeçalho Oficial do Documento Impresso */}
          <div className="border-b border-slate-200 pb-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-white p-1 border border-slate-200 flex items-center justify-center shrink-0">
                <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 uppercase tracking-tight">
                  KARDEX INDIVIDUAL DE MOVIMENTAÇÃO DE ESTOQUE
                </h2>
                <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                  <span>Área Operacional: <strong>{currentUser?.area_sigla || 'ALM'}</strong></span>
                  <span>·</span>
                  <span>Período: {kardexData.periodo.data_inicio.split('-').reverse().join('/')} a {kardexData.periodo.data_fim.split('-').reverse().join('/')}</span>
                </div>
              </div>
            </div>

            <div className="text-right text-xs text-slate-500">
              <div>Emissão: <strong>{new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</strong></div>
              <div>Usuário: <strong>{currentUser?.nome || 'Operador'}</strong></div>
            </div>
          </div>

          {/* 2. CARD DE RESUMO DO PRODUTO */}
          <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
              <div className="space-y-1.5 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded text-[11px] font-mono font-bold bg-indigo-100 text-indigo-900 border border-indigo-200">
                    CÓDIGO: {activeProd.codigo}
                  </span>
                  <span className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-slate-200 text-slate-800">
                    UNIDADE: {activeProd.unidade_medida}
                  </span>
                  {activeProd.tipo && (
                    <span className="px-2.5 py-0.5 rounded text-[11px] font-semibold bg-teal-100 text-teal-800">
                      {activeProd.tipo === 'consumivel' ? 'Consumível' : 'Não Consumível'}
                    </span>
                  )}
                </div>
                {/* Código e Descrição Completa do Produto (sem truncar) */}
                <h3 className="text-base font-bold text-slate-900 break-words whitespace-normal leading-relaxed">
                  {activeProd.nome}
                </h3>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {/* Saldo Atual em Estoque */}
                <div className="px-4 py-3 rounded-xl bg-teal-50 border border-teal-200 text-right">
                  <span className="text-[10px] font-bold text-teal-800 uppercase tracking-wider block">
                    Saldo Atual em Estoque
                  </span>
                  <span className="text-xl font-extrabold text-teal-950 font-mono">
                    {activeProd.quantidade_atual} <span className="text-xs font-normal text-teal-700">{activeProd.unidade_medida}</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Métricas do Período */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Saldo Anterior ao Período */}
              <div className="p-3.5 rounded-xl bg-blue-50/80 border border-blue-200">
                <span className="text-[11px] font-bold text-blue-900 uppercase block">
                  Saldo Anterior ao Período
                </span>
                <span className="text-lg font-black text-blue-950 mt-1 block font-mono">
                  {kardexData.saldo_inicial ?? 0} <span className="text-xs font-normal text-blue-800">{activeProd.unidade_medida}</span>
                </span>
                <span className="text-[10px] text-blue-600 block mt-0.5">
                  Antes de {kardexData.periodo.data_inicio.split('-').reverse().join('/')}
                </span>
              </div>

              {/* Total de Entradas */}
              <div className="p-3.5 rounded-xl bg-emerald-50/80 border border-emerald-200">
                <span className="text-[11px] font-bold text-emerald-900 uppercase block flex items-center gap-1">
                  <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Entradas no Período</span>
                </span>
                <span className="text-lg font-black text-emerald-950 mt-1 block font-mono">
                  +{kardexData.total_entradas} <span className="text-xs font-normal text-emerald-800">{activeProd.unidade_medida}</span>
                </span>
                <span className="text-[10px] text-emerald-600 block mt-0.5">
                  Notas fiscais e devoluções
                </span>
              </div>

              {/* Total de Saídas */}
              <div className="p-3.5 rounded-xl bg-rose-50/80 border border-rose-200">
                <span className="text-[11px] font-bold text-rose-900 uppercase block flex items-center gap-1">
                  <ArrowUpRight className="w-3.5 h-3.5 text-rose-600" />
                  <span>Saídas no Período</span>
                </span>
                <span className="text-lg font-black text-rose-950 mt-1 block font-mono">
                  -{kardexData.total_saidas} <span className="text-xs font-normal text-rose-800">{activeProd.unidade_medida}</span>
                </span>
                <span className="text-[10px] text-rose-600 block mt-0.5">
                  Dispensações, consumos e perdas
                </span>
              </div>

              {/* Saldo Final do Período */}
              <div className="p-3.5 rounded-xl bg-indigo-50/80 border border-indigo-200">
                <span className="text-[11px] font-bold text-indigo-900 uppercase block">
                  Saldo Final do Período
                </span>
                <span className="text-lg font-black text-indigo-950 mt-1 block font-mono">
                  {kardexData.saldo_final} <span className="text-xs font-normal text-indigo-800">{activeProd.unidade_medida}</span>
                </span>
                <span className="text-[10px] text-indigo-600 block mt-0.5">
                  Posição em {kardexData.periodo.data_fim.split('-').reverse().join('/')}
                </span>
              </div>
            </div>
          </div>

          {/* 3. TABELA CRONOLÓGICA DE MOVIMENTAÇÕES */}
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100/90 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-2.5 px-3">Data / Hora</th>
                  <th className="py-2.5 px-3">Tipo / Operação</th>
                  <th className="py-2.5 px-3">Documento Ref.</th>
                  <th className="py-2.5 px-3">Lote & Validade</th>
                  <th className="py-2.5 px-3 text-right text-emerald-700">Entrada (+)</th>
                  <th className="py-2.5 px-3 text-right text-rose-700">Saída (-)</th>
                  <th className="py-2.5 px-3 text-right font-black text-slate-900">Saldo Pós-Movimentação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-800">
                {kardexData.movimentacoes.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400 italic">
                      Nenhuma movimentação registrada para este produto no período selecionado.
                    </td>
                  </tr>
                ) : (
                  kardexData.movimentacoes.map((m: any, idx: number) => {
                    const isEstorno = m.tipo?.startsWith('estorno_');
                    const dataHoraFormatada = formatDataHoraBrasilia(m.data_movimentacao);

                    return (
                      <tr
                        key={m.id || idx}
                        className={`hover:bg-slate-50/80 transition-colors ${
                          isEstorno ? 'bg-amber-50/70 border-l-4 border-l-amber-500' : ''
                        }`}
                      >
                        <td className="py-2.5 px-3 font-medium text-slate-700 whitespace-nowrap font-mono text-[11px]">
                          {dataHoraFormatada}
                        </td>
                        <td className="py-2.5 px-3 font-semibold">
                          <div className="flex items-center gap-1.5">
                            <span>{m.motivo_diverso || m.tipo}</span>
                            {isEstorno && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-amber-200 text-amber-900 border border-amber-300">
                                ESTORNO
                              </span>
                            )}
                          </div>
                          {(m.centro_custo_nome || m.fornecedor_nome) && (
                            <div className="text-[10px] text-slate-400 font-normal">
                              {m.centro_custo_nome ? `Setor: ${m.centro_custo_nome}` : `Fornecedor: ${m.fornecedor_nome}`}
                            </div>
                          )}
                          {m.observacao && (
                            <div className="text-[10px] text-slate-400 font-normal italic truncate max-w-xs">
                              {m.observacao}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-medium text-slate-600 whitespace-nowrap">
                          {m.documento_referencia || '-'}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className="font-semibold text-slate-800">{m.numero_lote || 'S/LOTE'}</span>
                          {m.data_validade && (
                            <span className="text-[10px] text-slate-400 block font-mono">
                              Val: {m.data_validade.split('-').reverse().join('/')}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-emerald-700 whitespace-nowrap font-mono">
                          {m.entrada > 0 ? `+${m.entrada}` : '-'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-rose-700 whitespace-nowrap font-mono">
                          {m.saida > 0 ? `-${m.saida}` : '-'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-black text-slate-900 whitespace-nowrap bg-slate-50/50 font-mono">
                          {m.saldo_apos} {activeProd.unidade_medida}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-extrabold text-slate-900 border-t-2 border-slate-300">
                  <td colSpan={4} className="py-3 px-3 uppercase text-right">
                    Totais do Período Analisado:
                  </td>
                  <td className="py-3 px-3 text-right text-emerald-700 font-mono text-sm">
                    +{kardexData.total_entradas}
                  </td>
                  <td className="py-3 px-3 text-right text-rose-700 font-mono text-sm">
                    -{kardexData.total_saidas}
                  </td>
                  <td className="py-3 px-3 text-right bg-slate-200/90 font-mono text-sm">
                    {kardexData.saldo_final} {activeProd.unidade_medida}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Rodapé Único e Obrigatório */}
          <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-400 gap-2">
            <div>
              AlmoxControl Multiárea — Extrato Oficial de Kardex Auditado
            </div>
            <div className="font-semibold text-slate-600">
              Desenvolvido por Bruno Rocha - DPO
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
