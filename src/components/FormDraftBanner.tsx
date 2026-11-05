import React from 'react';
import { Cloud, CloudCheck, AlertTriangle, Trash2, ArrowUpRight, RotateCcw, Save, Loader2 } from 'lucide-react';
import type { DraftStatus } from '../hooks/useFormDraft.ts';
import { formatDateTimeBrasilia } from '../utils/dateUtils.ts';

interface FormDraftResumeBannerProps {
  hasDraft: boolean;
  draftDate?: string | null;
  onApply: () => void;
  onDiscard: () => void;
  formTitle?: string;
}

export const FormDraftResumeBanner: React.FC<FormDraftResumeBannerProps> = ({
  hasDraft,
  draftDate,
  onApply,
  onDiscard,
  formTitle = 'formulário',
}) => {
  if (!hasDraft) return null;

  return (
    <div className="p-3.5 mb-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 shadow-xs animate-fadeIn flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
      <div className="flex items-start gap-2.5">
        <div className="p-1.5 bg-amber-200/80 text-amber-800 rounded-lg shrink-0 mt-0.5 sm:mt-0">
          <Cloud className="w-4 h-4" />
        </div>
        <div className="text-xs">
          <p className="font-bold text-amber-900">
            Rascunho não finalizado encontrado no sistema
          </p>
          <p className="text-amber-800 text-[11px] mt-0.5">
            Você possui dados previamente salvos neste {formTitle}
            {draftDate ? ` (${formatDateTimeBrasilia(draftDate)})` : ''}. Deseja retomar o preenchimento ou começar um novo?
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
        <button
          type="button"
          onClick={onDiscard}
          className="px-3 py-1.5 rounded-lg border border-amber-300 bg-white hover:bg-rose-50 hover:border-rose-300 text-amber-900 hover:text-rose-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          title="Descartar rascunho anterior e iniciar em branco"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Descartar</span>
        </button>

        <button
          type="button"
          onClick={onApply}
          className="px-3.5 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 active:bg-amber-900 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer uppercase tracking-wider"
          title="Restaurar dados e itens salvos no rascunho"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Retomar Preenchimento</span>
        </button>
      </div>
    </div>
  );
};

interface FormDraftStatusIndicatorProps {
  status: DraftStatus;
  lastSavedFormatted?: string | null;
  errorMessage?: string | null;
}

export const FormDraftStatusIndicator: React.FC<FormDraftStatusIndicatorProps> = ({
  status,
  lastSavedFormatted,
  errorMessage,
}) => {
  if (status === 'idle' && !lastSavedFormatted) return null;

  if (status === 'salvando') {
    return (
      <span className="inline-flex items-center gap-1.5 text-slate-500 font-medium text-[11px] bg-slate-100 px-2.5 py-1 rounded-md animate-pulse">
        <Loader2 className="w-3.5 h-3.5 text-teal-600 animate-spin" />
        <span>Salvando rascunho…</span>
      </span>
    );
  }

  if (status === 'erro') {
    return (
      <span
        title={errorMessage || 'Falha ao salvar rascunho'}
        className="inline-flex items-center gap-1.5 text-rose-700 font-semibold text-[11px] bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-md"
      >
        <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
        <span>Falha ao salvar rascunho</span>
      </span>
    );
  }

  if (lastSavedFormatted) {
    return (
      <span className="inline-flex items-center gap-1.5 text-teal-800 font-medium text-[11px] bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-md">
        <CloudCheck className="w-3.5 h-3.5 text-teal-600" />
        <span>Rascunho salvo às {lastSavedFormatted}</span>
      </span>
    );
  }

  return null;
};

interface FormDraftSaveButtonProps {
  onSaveManual: () => void;
  isSaving?: boolean;
  disabled?: boolean;
}

export const FormDraftSaveButton: React.FC<FormDraftSaveButtonProps> = ({
  onSaveManual,
  isSaving = false,
  disabled = false,
}) => {
  return (
    <button
      type="button"
      onClick={onSaveManual}
      disabled={disabled || isSaving}
      className="bg-slate-700 hover:bg-slate-800 active:bg-slate-900 text-white font-medium px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 transition-all shadow-sm uppercase tracking-wide cursor-pointer disabled:opacity-50"
      title="Salvar rascunho manualmente para continuar o preenchimento mais tarde"
    >
      {isSaving ? (
        <Loader2 className="w-4 h-4 animate-spin text-slate-300" />
      ) : (
        <Save className="w-4 h-4 text-slate-300" />
      )}
      <span>SALVAR RASCUNHO</span>
    </button>
  );
};
