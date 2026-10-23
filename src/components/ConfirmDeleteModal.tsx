import React from 'react';
import { Trash2, AlertTriangle, X } from 'lucide-react';

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  title: string;
  entityName: string;
  entityCode?: string;
  description?: string;
  isProcessing?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
  isOpen,
  title,
  entityName,
  entityCode,
  description,
  isProcessing = false,
  onConfirm,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-scaleUp">
        {/* Cabeçalho */}
        <div className="bg-rose-600 px-5 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-white/15">
              <Trash2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wide">{title}</h3>
              <p className="text-[11px] text-rose-100">Confirmação de exclusão permanente</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo */}
        <div className="p-6 space-y-4">
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="text-xs text-rose-900 space-y-1">
              <p className="font-bold">Deseja realmente excluir este registro?</p>
              <p className="text-rose-800 leading-relaxed">
                {entityCode ? (
                  <>
                    Registro selecionado: <strong className="font-mono">{entityCode}</strong> — <strong>{entityName}</strong>
                  </>
                ) : (
                  <>
                    Registro selecionado: <strong>{entityName}</strong>
                  </>
                )}
              </p>
            </div>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            {description ||
              'Esta operação removerá o registro do banco de dados. Caso existam pendências ativas vinculadas, o sistema impedirá a exclusão para preservar a integridade contábil.'}
          </p>

          {/* Ações */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={onConfirm}
              disabled={isProcessing}
              className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              <span>{isProcessing ? 'Excluindo...' : 'Confirmar Exclusão'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
