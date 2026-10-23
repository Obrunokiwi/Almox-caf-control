import React from 'react';
import { AlertCircle, Plus, Building2 } from 'lucide-react';

interface CentroCustoAlertBannerProps {
  onCadastrarCentroCusto?: () => void;
  isAdmin?: boolean;
  mensagemPersonalizada?: string;
}

export const CentroCustoAlertBanner: React.FC<CentroCustoAlertBannerProps> = ({
  onCadastrarCentroCusto,
  isAdmin = false,
  mensagemPersonalizada,
}) => {
  if (!isAdmin) {
    return null;
  }

  return (
    <div className="p-4 rounded-xl bg-amber-50 border-2 border-amber-300 text-amber-900 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fadeIn">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-amber-200 text-amber-900 rounded-lg shrink-0">
          <Building2 className="w-5 h-5" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-amber-950 flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
            <span>Nenhum Centro de Custo ativo cadastrado</span>
          </h4>
          <p className="text-xs text-amber-800 mt-0.5">
            {mensagemPersonalizada || 'O sistema inicia vazio. Cadastre ao menos um Centro de Custo para começar a movimentar o estoque e vincular usuários/setores.'}
          </p>
        </div>
      </div>

      {onCadastrarCentroCusto && (
        <button
          type="button"
          onClick={onCadastrarCentroCusto}
          className="px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-semibold text-xs flex items-center gap-2 shadow transition-colors cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Cadastre ao menos um Centro de Custo para começar</span>
        </button>
      )}
    </div>
  );
};
