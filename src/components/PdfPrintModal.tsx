import React, { useEffect } from 'react';
import { Printer, Download, X, FileText, CheckCircle2 } from 'lucide-react';
import { triggerDirectIframePrint, type PdfGeneratedDocument } from '../utils/pdfGenerator.ts';

interface PdfPrintModalProps {
  pdfDoc: PdfGeneratedDocument | null;
  onClose: () => void;
}

export const PdfPrintModal: React.FC<PdfPrintModalProps> = ({ pdfDoc, onClose }) => {
  useEffect(() => {
    if (!pdfDoc) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pdfDoc, onClose]);

  if (!pdfDoc) return null;

  const handlePrintAgain = () => {
    triggerDirectIframePrint(pdfDoc.blobUrl);
  };

  const handleDownload = () => {
    pdfDoc.doc.save(pdfDoc.filename);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-xs p-3 md:p-6 animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      {/* Botão flutuante externo de fechar para NUNCA ficar inacessível ou oculto */}
      <button
        type="button"
        onClick={onClose}
        className="fixed top-4 right-4 z-[9999] bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs uppercase px-4 py-2.5 rounded-full shadow-2xl flex items-center gap-2 cursor-pointer transition-transform hover:scale-105"
        title="Fechar visualização (ESC)"
      >
        <X className="w-4 h-4 stroke-[2.5]" />
        <span>FECHAR (ESC)</span>
      </button>

      <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-5xl max-h-[88vh] flex flex-col overflow-hidden relative">
        {/* Cabeçalho do Visualizador */}
        <div className="px-5 py-3.5 bg-[#00237D] text-white flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/10 rounded-lg">
              <FileText className="w-5 h-5 text-teal-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold tracking-tight">{pdfDoc.title}</h3>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 px-2 py-0.5 rounded">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Documento PDF Gerado</span>
                </span>
              </div>
              <p className="text-[11px] text-blue-200">
                Visualização pronta para impressão direta ou download do arquivo PDF ({pdfDoc.filename})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrintAgain}
              className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold uppercase tracking-wider rounded-lg flex items-center gap-1.5 shadow cursor-pointer transition-colors"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir Direto</span>
            </button>

            <button
              type="button"
              onClick={handleDownload}
              className="px-3.5 py-1.5 bg-white text-[#00237D] hover:bg-blue-50 text-xs font-bold uppercase tracking-wider rounded-lg flex items-center gap-1.5 shadow cursor-pointer transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Baixar PDF</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 bg-white/10 hover:bg-rose-600 text-white rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-xs px-2.5 font-bold"
              title="Fechar visualização"
            >
              <X className="w-4 h-4" />
              <span>Fechar</span>
            </button>
          </div>
        </div>

        {/* Corpo com o PDF renderizado */}
        <div className="flex-1 bg-slate-800 p-2 overflow-hidden min-h-[350px]">
          <iframe
            src={pdfDoc.blobUrl}
            title={pdfDoc.title}
            className="w-full h-full rounded border border-slate-700 bg-white"
          />
        </div>

        {/* Barra inferior auxiliar de fechamento */}
        <div className="px-4 py-2 bg-slate-100 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span>Pressione <kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded font-mono text-[10px] text-slate-700">ESC</kbd> ou clique fora da janela para fechar.</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded cursor-pointer transition-colors"
          >
            Fechar Janela
          </button>
        </div>
      </div>
    </div>
  );
};
