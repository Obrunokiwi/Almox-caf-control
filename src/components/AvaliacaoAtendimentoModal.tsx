import React, { useState, useEffect } from 'react';
import { Star, MessageSquare, AlertCircle, CheckCircle2, ShieldCheck, X, ThumbsUp, Smile, Frown } from 'lucide-react';
import { useToast } from '../context/ToastContext.tsx';
import { getAuthHeaders } from '../utils/apiUtils.ts';

export type OpcaoAvaliacao = 'otimo' | 'bom' | 'ruim';

interface AvaliacaoAtendimentoModalProps {
  isOpen: boolean;
  requisicao: {
    id: number;
    numero_requisicao: string;
    centro_custo_nome?: string;
    solicitante_nome?: string;
    status?: string;
    data_atendimento?: string | null;
    avaliacao_status?: string | null;
    avaliacao_agilidade?: number | null;
    avaliacao_qualidade?: number | null;
    avaliacao_entrega?: number | null;
    avaliacao_sugestao?: string | null;
  } | null;
  encerrarRequisicao?: boolean;
  onClose: () => void;
  onAvaliacaoConcluida: () => void;
}

const converterNotaParaOpcao = (nota?: number | null): OpcaoAvaliacao => {
  if (nota === null || nota === undefined) return 'otimo';
  const n = Number(nota);
  if (n >= 4) return 'otimo';
  if (n >= 2.5) return 'bom';
  return 'ruim';
};

const converterOpcaoParaNota = (opcao: OpcaoAvaliacao): number => {
  if (opcao === 'otimo') return 5;
  if (opcao === 'bom') return 3;
  return 1;
};

export const AvaliacaoAtendimentoModal: React.FC<AvaliacaoAtendimentoModalProps> = ({
  isOpen,
  requisicao,
  encerrarRequisicao = false,
  onClose,
  onAvaliacaoConcluida,
}) => {
  const { toast } = useToast();

  // 1. Foi entregue no horário previsto? -> coluna avaliacao_entrega
  const [perguntaHorario, setPerguntaHorario] = useState<OpcaoAvaliacao>('otimo');
  // 2. O pedido foi entregue conforme solicitado? -> coluna avaliacao_qualidade
  const [perguntaConforme, setPerguntaConforme] = useState<OpcaoAvaliacao>('otimo');
  // 3. O funcionário foi educado? -> coluna avaliacao_agilidade
  const [perguntaEducado, setPerguntaEducado] = useState<OpcaoAvaliacao>('otimo');

  const [sugestao, setSugestao] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && requisicao) {
      setPerguntaHorario(converterNotaParaOpcao(requisicao.avaliacao_entrega));
      setPerguntaConforme(converterNotaParaOpcao(requisicao.avaliacao_qualidade));
      setPerguntaEducado(converterNotaParaOpcao(requisicao.avaliacao_agilidade));
      setSugestao(requisicao.avaliacao_sugestao || '');
      setErrorMsg(null);
    }
  }, [isOpen, requisicao]);

  if (!isOpen || !requisicao) return null;

  const notaHorario = converterOpcaoParaNota(perguntaHorario);
  const notaConforme = converterOpcaoParaNota(perguntaConforme);
  const notaEducado = converterOpcaoParaNota(perguntaEducado);

  const possuiRuim =
    perguntaHorario === 'ruim' || perguntaConforme === 'ruim' || perguntaEducado === 'ruim';
  const media = Number(((notaHorario + notaConforme + notaEducado) / 3).toFixed(2));

  const renderPerguntaOpcoes = (
    numero: number,
    pergunta: string,
    subtitulo: string,
    valorAtual: OpcaoAvaliacao,
    onChange: (val: OpcaoAvaliacao) => void
  ) => {
    const opcoes: Array<{
      id: OpcaoAvaliacao;
      label: string;
      activeClass: string;
      idleClass: string;
      icon: React.ReactNode;
    }> = [
      {
        id: 'otimo',
        label: 'Ótimo',
        activeClass: 'bg-emerald-600 text-white border-emerald-700 shadow-sm ring-2 ring-emerald-200',
        idleClass: 'bg-white text-emerald-800 border-emerald-200 hover:bg-emerald-50',
        icon: <ThumbsUp className="w-4 h-4" />,
      },
      {
        id: 'bom',
        label: 'Bom',
        activeClass: 'bg-blue-600 text-white border-blue-700 shadow-sm ring-2 ring-blue-200',
        idleClass: 'bg-white text-blue-800 border-blue-200 hover:bg-blue-50',
        icon: <Smile className="w-4 h-4" />,
      },
      {
        id: 'ruim',
        label: 'Ruim',
        activeClass: 'bg-rose-600 text-white border-rose-700 shadow-sm ring-2 ring-rose-200',
        idleClass: 'bg-white text-rose-800 border-rose-200 hover:bg-rose-50',
        icon: <Frown className="w-4 h-4" />,
      },
    ];

    return (
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/90 space-y-2.5">
        <div>
          <span className="text-xs font-bold text-slate-900">
            {numero}. {pergunta}
          </span>
          <p className="text-[11px] text-slate-500 mt-0.5">{subtitulo}</p>
        </div>

        <div className="grid grid-cols-3 gap-2.5 pt-1">
          {opcoes.map((op) => {
            const selecionado = valorAtual === op.id;
            return (
              <button
                key={op.id}
                type="button"
                onClick={() => onChange(op.id)}
                className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  selecionado ? op.activeClass : op.idleClass
                }`}
              >
                {op.icon}
                <span>{op.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (possuiRuim && (!sugestao.trim() || sugestao.trim().length < 3)) {
      const msg =
        'Quando alguma resposta for "Ruim", informe uma breve observação no campo "Observações / O que podemos melhorar?".';
      setErrorMsg(msg);
      toast.warning('Observação Obrigatória', msg);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/requisicoes/${requisicao.id}/avaliar`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          pergunta_horario: perguntaHorario,
          pergunta_conforme: perguntaConforme,
          pergunta_educado: perguntaEducado,
          entrega: notaHorario,
          qualidade: notaConforme,
          agilidade: notaEducado,
          sugestao: sugestao.trim(),
          encerrar_requisicao: encerrarRequisicao,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao registrar avaliação.');
      }

      toast.success(
        encerrarRequisicao ? 'Requisição Encerrada e Avaliada' : 'Avaliação Registrada',
        data.message || 'Avaliação gravada com sucesso nos indicadores de qualidade!'
      );
      onAvaliacaoConcluida();
      onClose();
    } catch (err: any) {
      const msg = err.message || 'Falha ao salvar avaliação.';
      setErrorMsg(msg);
      toast.error('Erro na Avaliação', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn select-none">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 flex flex-col max-h-[92vh]">
        {/* Cabeçalho */}
        <div className="bg-gradient-to-r from-[#00237D] to-[#001858] text-white p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-amber-300">
              <Star className="w-6 h-6 fill-amber-300" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300 bg-amber-400/20 px-2 py-0.5 rounded">
                Indicadores de Qualidade do Atendimento
              </span>
              <h3 className="text-base font-bold tracking-tight mt-0.5">
                {encerrarRequisicao
                  ? 'Encerramento e Avaliação da Requisição'
                  : 'Avaliação de Qualidade da Requisição'}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
            title="Fechar Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Informações da Requisição Avaliada */}
          <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-200 text-xs space-y-1">
            <div className="flex items-center justify-between font-bold text-slate-800">
              <span>
                Requisição:{' '}
                <strong className="text-[#00237D] font-mono">{requisicao.numero_requisicao}</strong>
              </span>
              <span className="text-[11px] text-slate-600 font-semibold">
                {requisicao.centro_custo_nome || 'Setor Solicitante'}
              </span>
            </div>
            <p className="text-[11px] text-slate-600">
              {encerrarRequisicao
                ? 'Para concluir e encerrar a requisição, responda às 3 perguntas de avaliação do atendimento abaixo.'
                : 'Responda às 3 perguntas abaixo para registrar a avaliação e alimentar os indicadores de qualidade.'}
            </p>
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Pergunta 1 */}
          {renderPerguntaOpcoes(
            1,
            'Foi entregue no horário previsto?',
            'Pontualidade e cumprimento do prazo previsto de entrega ao setor',
            perguntaHorario,
            setPerguntaHorario
          )}

          {/* Pergunta 2 */}
          {renderPerguntaOpcoes(
            2,
            'O pedido foi entregue conforme solicitado?',
            'Conformidade dos materiais, quantidades atendidas e integridade física',
            perguntaConforme,
            setPerguntaConforme
          )}

          {/* Pergunta 3 */}
          {renderPerguntaOpcoes(
            3,
            'O funcionário foi educado?',
            'Cordialidade, postura profissional e presteza no atendimento',
            perguntaEducado,
            setPerguntaEducado
          )}

          {/* Campo de Observações / Sugestões */}
          <div className="space-y-1 pt-1">
            <label className="block text-xs font-bold text-slate-800 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-[#00237D]" />
                Observações / O que podemos melhorar?
                {possuiRuim ? (
                  <span className="text-rose-600 font-bold">* (Obrigatório para opção Ruim)</span>
                ) : (
                  <span className="text-slate-400 font-normal">(Opcional)</span>
                )}
              </span>
              <span className="font-mono text-[10px] text-slate-500">
                Índice: {media.toFixed(1)} / 5.0
              </span>
            </label>

            <textarea
              required={possuiRuim}
              rows={2}
              value={sugestao}
              onChange={(e) => setSugestao(e.target.value)}
              placeholder={
                possuiRuim
                  ? 'Descreva o motivo da avaliação Ruim para registro nos indicadores de melhoria...'
                  : 'Comentário, elogio ou observação adicional sobre o atendimento (opcional)...'
              }
              className={`w-full p-3 rounded-xl border text-xs text-slate-800 focus:outline-none transition-all ${
                possuiRuim
                  ? 'border-rose-300 focus:border-rose-600 bg-rose-50/20'
                  : 'border-slate-300 focus:border-[#00237D]'
              }`}
            />
          </div>

          {/* Botões de Ação */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-[#00237D] hover:bg-[#001c66] active:bg-[#00144d] text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4 text-amber-300" />
              <span>
                {isSubmitting
                  ? 'Gravando...'
                  : encerrarRequisicao
                  ? 'Concluir Avaliação e Encerrar Requisição'
                  : 'Confirmar Avaliação'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
