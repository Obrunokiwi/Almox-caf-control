import React, { useState } from 'react';
import {
  HelpCircle,
  X,
  Truck,
  Package,
  PackagePlus,
  CheckCircle2,
  ArrowRight,
  Info,
  ShieldAlert,
  Handshake,
} from 'lucide-react';

export interface HelpSectionItem {
  title: string;
  description: string;
  badge?: string;
  tone?: 'teal' | 'blue' | 'amber' | 'rose' | 'indigo';
}

interface HelpFloatingModalProps {
  title: string;
  subtitle?: string;
  buttonLabel?: string;
  currentStep?: 1 | 2 | 3;
  onNavigate?: (tab: string) => void;
  sections: HelpSectionItem[];
}

export const HelpFloatingModal: React.FC<HelpFloatingModalProps> = ({
  title,
  subtitle = 'Orientações operacionais, regras de negócio e atalhos de fluxo',
  buttonLabel = 'Ajuda',
  currentStep,
  onNavigate,
  sections,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const getToneClasses = (tone?: HelpSectionItem['tone']) => {
    switch (tone) {
      case 'amber':
        return 'bg-amber-50/80 border-amber-200 text-amber-950';
      case 'rose':
        return 'bg-rose-50/80 border-rose-200 text-rose-950';
      case 'indigo':
        return 'bg-indigo-50/80 border-indigo-200 text-indigo-950';
      case 'blue':
        return 'bg-blue-50/80 border-blue-200 text-blue-950';
      default:
        return 'bg-teal-50/80 border-teal-200 text-teal-950';
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="bg-slate-100 hover:bg-teal-50 text-slate-700 hover:text-teal-800 border border-slate-300 hover:border-teal-300 font-semibold px-3 py-2 rounded text-xs flex items-center gap-1.5 transition-all shadow-2xs uppercase tracking-wide cursor-pointer shrink-0"
        title="Abrir janela flutuante de ajuda, regras e fluxo do almoxarifado"
      >
        <HelpCircle className="w-4 h-4 text-teal-600" />
        <span>{buttonLabel}</span>
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden animate-scaleIn"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabeçalho da Janela Flutuante */}
            <div className="px-5 py-4 bg-gradient-to-r from-[#00237D] via-[#102456] to-[#192641] text-white flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-white/10 border border-white/15 text-[#6EC1E4]">
                  <HelpCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-white leading-tight">
                    {title}
                  </h3>
                  <p className="text-[11px] text-blue-100/80">{subtitle}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
                title="Fechar ajuda"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Corpo da Janela Flutuante */}
            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Fluxo de 3 Passos do Almoxarifado (quando aplicável) */}
              {(currentStep || onNavigate) && (
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 text-teal-600" />
                      <span>Fluxo Padrão de Cadastro e Recebimento</span>
                    </span>
                    {currentStep && (
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-teal-100 text-teal-800 px-2 py-0.5 rounded">
                        Você está na Etapa {currentStep} de 3
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      disabled={!onNavigate || currentStep === 1}
                      onClick={() => {
                        if (onNavigate) {
                          setIsOpen(false);
                          onNavigate('fornecedores');
                        }
                      }}
                      className={`p-2.5 rounded-lg border text-left transition-all flex items-center justify-between gap-2 ${
                        currentStep === 1
                          ? 'bg-teal-600 text-white border-teal-700 shadow-xs font-bold'
                          : 'bg-white hover:bg-teal-50/60 text-slate-700 border-slate-200 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Truck className={`w-4 h-4 shrink-0 ${currentStep === 1 ? 'text-white' : 'text-teal-700'}`} />
                        <div className="truncate">
                          <div className="text-[10px] uppercase opacity-80">Passo 1</div>
                          <div className="text-xs font-semibold truncate">Fornecedores</div>
                        </div>
                      </div>
                      {currentStep === 1 ? (
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      ) : (
                        <ArrowRight className="w-3.5 h-3.5 opacity-60 shrink-0" />
                      )}
                    </button>

                    <button
                      type="button"
                      disabled={!onNavigate || currentStep === 2}
                      onClick={() => {
                        if (onNavigate) {
                          setIsOpen(false);
                          onNavigate('produtos');
                        }
                      }}
                      className={`p-2.5 rounded-lg border text-left transition-all flex items-center justify-between gap-2 ${
                        currentStep === 2
                          ? 'bg-teal-600 text-white border-teal-700 shadow-xs font-bold'
                          : 'bg-white hover:bg-teal-50/60 text-slate-700 border-slate-200 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Package className={`w-4 h-4 shrink-0 ${currentStep === 2 ? 'text-white' : 'text-[#00237D]'}`} />
                        <div className="truncate">
                          <div className="text-[10px] uppercase opacity-80">Passo 2</div>
                          <div className="text-xs font-semibold truncate">Produtos (Cód. Único)</div>
                        </div>
                      </div>
                      {currentStep === 2 ? (
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      ) : (
                        <ArrowRight className="w-3.5 h-3.5 opacity-60 shrink-0" />
                      )}
                    </button>

                    <button
                      type="button"
                      disabled={!onNavigate || currentStep === 3}
                      onClick={() => {
                        if (onNavigate) {
                          setIsOpen(false);
                          onNavigate('entradas');
                        }
                      }}
                      className={`p-2.5 rounded-lg border text-left transition-all flex items-center justify-between gap-2 ${
                        currentStep === 3
                          ? 'bg-teal-600 text-white border-teal-700 shadow-xs font-bold'
                          : 'bg-white hover:bg-teal-50/60 text-slate-700 border-slate-200 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <PackagePlus className={`w-4 h-4 shrink-0 ${currentStep === 3 ? 'text-white' : 'text-emerald-700'}`} />
                        <div className="truncate">
                          <div className="text-[10px] uppercase opacity-80">Passo 3</div>
                          <div className="text-xs font-semibold truncate">Entrada por Nota</div>
                        </div>
                      </div>
                      {currentStep === 3 ? (
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      ) : (
                        <ArrowRight className="w-3.5 h-3.5 opacity-60 shrink-0" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Seções de Regras e Ajuda */}
              <div className="space-y-3">
                {sections.map((sec, idx) => (
                  <div
                    key={idx}
                    className={`p-3.5 rounded-xl border text-xs leading-relaxed ${getToneClasses(sec.tone)}`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-bold text-xs flex items-center gap-1.5">
                        {sec.tone === 'rose' ? (
                          <ShieldAlert className="w-4 h-4 text-rose-700 shrink-0" />
                        ) : sec.tone === 'indigo' ? (
                          <Handshake className="w-4 h-4 text-indigo-700 shrink-0" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0" />
                        )}
                        <span>{sec.title}</span>
                      </span>
                      {sec.badge && (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-white/80 border border-current/15 shrink-0">
                          {sec.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-xs opacity-90 pl-5.5">{sec.description}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Rodapé */}
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
              <span>Dica: Pressione fora da janela ou clique em Fechar para voltar à tela.</span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-4 py-1.5 rounded-lg bg-[#00237D] hover:bg-[#001a5e] text-white font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
              >
                Entendi / Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
