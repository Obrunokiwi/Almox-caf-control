import React from 'react';
import { Printer, Download, X, FileText, CheckCircle2 } from 'lucide-react';
import { triggerDirectIframePrint, type PdfGeneratedDocument } from '../utils/pdfGenerator.ts';

interface PdfPrintModalProps {
  pdfDoc: PdfGeneratedDocument | null;
  onClose: () => void;
}

export const PdfPrintModal: React.FC<PdfPrintModalProps> = ({ pdfDoc, onClose }) => {
  if (!pdfDoc) return null;

  const handlePrintAgain = () => {
    triggerDirectIframePrint(pdfDoc.blobUrl);
  };

  const handleDownload = () => {
    pdfDoc.doc.save(pdfDoc.filename);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4 animate-fadeIn">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden">
        {/* Cabeçalho do Visualizador / Impressão Direta */}
        <div className="px-5 py-3.5 bg-[#00237D] text-white flex flex-wrap items-center justify-between gap-3">
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
              className="p-1.5 text-blue-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
              title="Fechar visualização"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Corpo com o PDF renderizado */}
        <div className="flex-1 bg-slate-800 p-3 overflow-hidden">
          <iframe
            src={pdfDoc.blobUrl}
            title={pdfDoc.title}
            className="w-full h-full rounded-lg border border-slate-700 bg-white"
          />
        </div>
      </div>
    </div>
  );
};
