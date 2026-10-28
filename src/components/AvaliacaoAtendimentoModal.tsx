import React, { useState, useEffect } from 'react';
import { Star, MessageSquare, AlertCircle, CheckCircle2, ShieldCheck, X } from 'lucide-react';
import { useToast } from '../context/ToastContext.tsx';
import { getAuthHeaders } from '../utils/apiUtils.ts';

interface AvaliacaoAtendimentoModalProps {
  isOpen: boolean;
  requisicao: {
    id: number;
    numero_requisicao: string;
    centro_custo_nome?: string;
    data_atendimento?: string | null;
  } | null;
  onClose: () => void;
  onAvaliacaoConcluida: () => void;
}

export const AvaliacaoAtendimentoModal: React.FC<AvaliacaoAtendimentoModalProps> = ({
  isOpen,
  requisicao,
  onClose,
  onAvaliacaoConcluida,
}) => {
  const { toast } = useToast();

  const [agilidade, setAgilidade] = useState<number>(5);
  const [qualidade, setQualidade] = useState<number>(5);
  const [entrega, setEntrega] = useState<number>(5);
  const [sugestao, setSugestao] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setAgilidade(5);
      setQualidade(5);
      setEntrega(5);
      setSugestao('');
      setErrorMsg(null);
    }
  }, [isOpen, requisicao]);

  if (!isOpen || !requisicao) return null;

  const possuiNotaBaixa = agilidade < 5 || qualidade < 5 || entrega < 5;
  const media = parseFloat(((agilidade + qualidade + entrega) / 3).toFixed(1));

  const renderStars = (
    value: number,
    onChange: (val: number) => void,
    label: string,
    description: string
  ) => {
    return (
      <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-800">{label}</span>
            <p className="text-[11px] text-slate-500">{description}</p>
          </div>
          <span className="font-mono text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
            {value} de 5 ⭐
          </span>
        </div>

        <div className="flex items-center gap-2 pt-1">
          {[1, 2, 3, 4, 5].map((star) => {
            const isFilled = star <= value;
            return (
              <button
                key={star}
                type="button"
                onClick={() => onChange(star)}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  isFilled
                    ? 'text-amber-400 hover:scale-110'
                    : 'text-slate-300 hover:text-amber-200'
                }`}
                title={`Nota ${star} de 5`}
              >
                <Star className={`w-6 h-6 ${isFilled ? 'fill-amber-400' : 'fill-slate-100'}`} />
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

    if (possuiNotaBaixa && (!sugestao.trim() || sugestao.trim().length < 3)) {
      const msg = 'Por favor, informe no campo "O que podemos melhorar?" o motivo da nota e sua sugestão.';
      setErrorMsg(msg);
      toast.warning('Campo Obrigatório', msg);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/requisicoes/${requisicao.id}/avaliar`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          agilidade,
          qualidade,
          entrega,
          sugestao: sugestao.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao registrar avaliação.');
      }

      toast.success(
        'Avaliação Registrada',
        data.message || 'Obrigado por contribuir para a melhoria contínua do atendimento!'
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
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
        {/* Cabeçalho */}
        <div className="bg-gradient-to-r from-[#00237D] to-[#001858] text-white p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-amber-300">
              <Star className="w-6 h-6 fill-amber-300" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300 bg-amber-400/20 px-2 py-0.5 rounded">
                Indicadores de Performance
              </span>
              <h3 className="text-base font-bold tracking-tight mt-0.5">
                Avaliação do Atendimento Anterior
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
              <span>Requisição: <strong className="text-[#00237D] font-mono">{requisicao.numero_requisicao}</strong></span>
              <span className="text-[11px] text-slate-500 font-normal">
                {requisicao.centro_custo_nome || 'Setor Solicitante'}
              </span>
            </div>
            <p className="text-[11px] text-slate-600">
              Para prosseguir e registrar uma nova solicitação, por favor avalie o desempenho do atendimento prestado.
            </p>
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center gap-2 animate-shake">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* 1. Agilidade */}
          {renderStars(
            agilidade,
            setAgilidade,
            '1. Agilidade no Atendimento',
            'Velocidade no tempo de resposta e separação dos insumos'
          )}

          {/* 2. Qualidade */}
          {renderStars(
            qualidade,
            setQualidade,
            '2. Qualidade dos Materiais e Separação',
            'Conferência física, integridade da embalagem e ausência de divergências'
          )}

          {/* 3. Entrega */}
          {renderStars(
            entrega,
            setEntrega,
            '3. Entrega e Cumprimento do Prazo',
            'Pontualidade na entrega no setor e atendimento da janela'
          )}

          {/* Campo Condicional "O que podemos melhorar?" */}
          <div className="space-y-1 pt-1">
            <label className="block text-xs font-bold text-slate-800 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-[#00237D]" />
                O que podemos melhorar?
                {possuiNotaBaixa ? (
                  <span className="text-rose-600 font-bold">* (Obrigatório)</span>
                ) : (
                  <span className="text-slate-400 font-normal">(Opcional / Elogios)</span>
                )}
              </span>
              <span className="font-mono text-[10px] text-slate-400">
                Média Geral: {media} / 5.0
              </span>
            </label>

            <textarea
              required={possuiNotaBaixa}
              rows={3}
              value={sugestao}
              onChange={(e) => setSugestao(e.target.value)}
              placeholder={
                possuiNotaBaixa
                  ? 'Descreva o que ocorreu de errado ou como nossa equipe do Almoxarifado/CAF pode melhorar o atendimento...'
                  : 'Deixe um comentário, elogio ou sugestão de melhoria técnica (opcional)...'
              }
              className={`w-full p-3 rounded-xl border text-xs text-slate-800 focus:outline-none transition-all ${
                possuiNotaBaixa
                  ? 'border-rose-300 focus:border-rose-600 bg-rose-50/20'
                  : 'border-slate-300 focus:border-[#00237D]'
              }`}
            />
          </div>

          {/* Botão de Envio */}
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
              <ShieldCheck className="w-4 h-4 text-amber-300" />
              <span>{isSubmitting ? 'Gravando...' : 'Confirmar Avaliação e Prosseguir'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
