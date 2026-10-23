import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Bell,
  AlertTriangle,
  ClipboardList,
  CheckCircle2,
  ArrowRight,
  Package,
  Clock,
  Flame,
  X,
  CheckCheck,
  RotateCcw
} from 'lucide-react';
import type { Produto, Requisicao, Usuario } from '../types/index.ts';

interface NotificationsDropdownProps {
  produtos: Produto[];
  requisicoes: Requisicao[];
  currentUser: Usuario | null;
  onNavigate: (tab: string) => void;
  variant?: 'light' | 'dark';
}

type FilterTab = 'todos' | 'estoque' | 'requisicoes';

export const NotificationsDropdown: React.FC<NotificationsDropdownProps> = ({
  produtos,
  requisicoes,
  currentUser,
  onNavigate,
  variant = 'light',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('todos');
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fecha o painel ao clicar fora ou pressionar ESC
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Produtos ativos com estoque baixo ou zerado
  const lowStockProducts = useMemo(() => {
    return produtos
      .filter((p) => p.ativo !== 0 && p.quantidade_atual <= p.estoque_minimo)
      .sort((a, b) => {
        const ratioA = a.estoque_minimo > 0 ? a.quantidade_atual / a.estoque_minimo : a.quantidade_atual;
        const ratioB = b.estoque_minimo > 0 ? b.quantidade_atual / b.estoque_minimo : b.quantidade_atual;
        return ratioA - ratioB;
      });
  }, [produtos]);

  // Requisições pendentes (ordenadas por urgência e data mais recente)
  const pendingRequisitions = useMemo(() => {
    return requisicoes
      .filter((r) => r.status === 'pendente')
      .sort((a, b) => {
        if (a.prioridade === 'urgente' && b.prioridade !== 'urgente') return -1;
        if (a.prioridade !== 'urgente' && b.prioridade === 'urgente') return 1;
        return new Date(b.data_solicitacao).getTime() - new Date(a.data_solicitacao).getTime();
      });
  }, [requisicoes]);

  // Filtra os avisos que ainda não foram dispensados na sessão
  const visibleLowStock = useMemo(
    () => lowStockProducts.filter((p) => !dismissedIds.has(`prod-${p.id}`)),
    [lowStockProducts, dismissedIds]
  );

  const visiblePendingReqs = useMemo(
    () => pendingRequisitions.filter((r) => !dismissedIds.has(`req-${r.id}`)),
    [pendingRequisitions, dismissedIds]
  );

  const totalActiveCount = visibleLowStock.length + visiblePendingReqs.length;
  const totalRawCount = lowStockProducts.length + pendingRequisitions.length;
  const hasUrgentReqs = visiblePendingReqs.some((r) => r.prioridade === 'urgente');
  const hasZeroStock = visibleLowStock.some((p) => p.quantidade_atual <= 0);

  const handleDismiss = (e: React.MouseEvent, key: string) => {
    e.stopPropagation();
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  };

  const handleDismissAll = () => {
    const allKeys = new Set<string>(dismissedIds);
    lowStockProducts.forEach((p) => allKeys.add(`prod-${p.id}`));
    pendingRequisitions.forEach((r) => allKeys.add(`req-${r.id}`));
    setDismissedIds(allKeys);
  };

  const handleRestoreAll = () => {
    setDismissedIds(new Set());
  };

  const handleSelectRequisicao = () => {
    const targetTab =
      currentUser?.perfil === 'admin' || currentUser?.perfil === 'almoxarife'
        ? 'aprovacao-requisicoes'
        : 'requisicoes';
    onNavigate(targetTab);
    setIsOpen(false);
  };

  const handleSelectProduto = () => {
    onNavigate('produtos');
    setIsOpen(false);
  };

  const formatDateShort = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="relative z-50" ref={dropdownRef}>
      {/* Botão do Sino com Contador Visual */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        title={
          totalActiveCount > 0
            ? `${totalActiveCount} aviso(s): ${visiblePendingReqs.length} requisição(ões) pendente(s) e ${visibleLowStock.length} item(ns) em estoque baixo`
            : 'Sem novos alertas no momento'
        }
        aria-label="Abrir painel de notificações"
        aria-expanded={isOpen}
        className={`relative p-2 rounded-lg transition-all cursor-pointer flex items-center justify-center ${
          variant === 'dark'
            ? isOpen
              ? 'bg-white/15 text-white'
              : 'text-white/75 hover:text-white hover:bg-white/10'
            : isOpen
            ? 'bg-slate-100 text-slate-900'
            : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/80'
        }`}
      >
        <Bell className="w-4 h-4" />

        {/* Contador Visual Minimalista */}
        {totalActiveCount > 0 && (
          <span
            className={`absolute top-1 right-1 min-w-[16px] h-[16px] px-1 rounded-full text-[9px] font-bold font-mono tabular-nums flex items-center justify-center text-white ring-2 ${
              variant === 'dark' ? 'ring-[#0c1a3e]' : 'ring-white'
            } ${
              hasUrgentReqs || hasZeroStock ? 'bg-rose-600' : 'bg-amber-500 text-slate-950'
            }`}
          >
            {totalActiveCount > 99 ? '99+' : totalActiveCount}
          </span>
        )}
      </button>

      {/* Painel Suspenso de Avisos */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-2xl border border-slate-200 z-[99999] overflow-hidden text-slate-800 select-none">
          {/* Cabeçalho do Painel */}
          <div className="bg-[#00237D] text-white px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#6EC1E4]" />
              <div>
                <h3 className="text-xs font-bold tracking-wide uppercase">Painel de Avisos</h3>
                <p className="text-[11px] text-blue-100/80">
                  {totalActiveCount > 0
                    ? `${totalActiveCount} alerta(s) operacional(is) ativo(s)`
                    : 'Todos os indicadores regulares'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {totalActiveCount > 0 && (
                <button
                  type="button"
                  onClick={handleDismissAll}
                  title="Marcar todos como lidos nesta sessão"
                  className="p-1.5 rounded-lg text-blue-100/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer text-[11px] flex items-center gap-1"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Limpar</span>
                </button>
              )}
              {dismissedIds.size > 0 && totalActiveCount < totalRawCount && (
                <button
                  type="button"
                  onClick={handleRestoreAll}
                  title="Restaurar alertas ocultos"
                  className="p-1.5 rounded-lg text-blue-100/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer text-[11px] flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="Fechar painel"
                className="p-1 rounded-lg text-blue-100/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Abas de Filtro (Segmented Control) */}
          <div className="p-2 bg-slate-50 border-b border-slate-200 flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveFilter('todos')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeFilter === 'todos'
                  ? 'bg-white text-[#00237D] shadow-2xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              <span>Todos</span>
              <span className="font-mono text-[10px] opacity-80">({totalActiveCount})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter('requisicoes')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeFilter === 'requisicoes'
                  ? 'bg-white text-[#00237D] shadow-2xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              <span>Requisições</span>
              <span className="font-mono text-[10px] opacity-80">({visiblePendingReqs.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter('estoque')}
              className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                activeFilter === 'estoque'
                  ? 'bg-white text-[#00237D] shadow-2xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              <span>Estoque Baixo</span>
              <span className="font-mono text-[10px] opacity-80">({visibleLowStock.length})</span>
            </button>
          </div>

          {/* Lista de Alertas */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
            {/* SEÇÃO 1: REQUISIÇÕES PENDENTES */}
            {(activeFilter === 'todos' || activeFilter === 'requisicoes') &&
              visiblePendingReqs.map((req) => {
                const isUrgent = req.prioridade === 'urgente';
                return (
                  <div
                    key={`req-${req.id}`}
                    onClick={handleSelectRequisicao}
                    className={`p-3.5 hover:bg-slate-50 transition-colors cursor-pointer flex items-start justify-between gap-3 ${
                      isUrgent ? 'bg-red-50/40' : ''
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                          isUrgent
                            ? 'bg-red-100 text-[#C2363A]'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {isUrgent ? (
                          <Flame className="w-4 h-4" />
                        ) : (
                          <ClipboardList className="w-4 h-4" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                          <span className="font-mono">{req.numero_requisicao}</span>
                          <span aria-hidden="true" className="text-slate-300">·</span>
                          <span className={isUrgent ? 'text-[#C2363A]' : 'text-amber-700'}>
                            {isUrgent ? 'Requisição Urgente' : 'Aguardando Aprovação'}
                          </span>
                        </div>

                        <p className="text-xs text-slate-600 truncate mt-0.5">
                          Setor: <strong className="text-slate-800">{req.centro_custo_nome || 'Centro de Custo'}</strong>
                        </p>

                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-1">
                          <span>Por {req.solicitante_nome || 'Operador'}</span>
                          {req.data_solicitacao && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="flex items-center gap-0.5">
                                <Clock className="w-3 h-3" />
                                {formatDateShort(req.data_solicitacao)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => handleDismiss(e, `req-${req.id}`)}
                      title="Ocultar este aviso"
                      className="p-1 rounded text-slate-300 hover:text-slate-500 hover:bg-slate-200/60 transition-colors shrink-0 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}

            {/* SEÇÃO 2: PRODUTOS EM ESTOQUE BAIXO */}
            {(activeFilter === 'todos' || activeFilter === 'estoque') &&
              visibleLowStock.map((prod) => {
                const isZero = prod.quantidade_atual <= 0;
                return (
                  <div
                    key={`prod-${prod.id}`}
                    onClick={handleSelectProduto}
                    className={`p-3.5 hover:bg-slate-50 transition-colors cursor-pointer flex items-start justify-between gap-3 ${
                      isZero ? 'bg-red-50/30' : ''
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                          isZero
                            ? 'bg-red-100 text-[#C2363A]'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {isZero ? (
                          <AlertTriangle className="w-4 h-4" />
                        ) : (
                          <Package className="w-4 h-4" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                          <span className="truncate">{prod.nome}</span>
                        </div>

                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-0.5 font-mono">
                          <span>Cód: {prod.codigo}</span>
                          <span aria-hidden="true">·</span>
                          <span className={isZero ? 'text-[#C2363A] font-bold' : 'text-amber-700 font-semibold'}>
                            Saldo: {prod.quantidade_atual} {prod.unidade_medida}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>Mín: {prod.estoque_minimo}</span>
                        </div>

                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {isZero
                            ? 'Estoque esgotado — reposição imediata necessária'
                            : 'Saldo atingiu o limite mínimo de segurança'}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => handleDismiss(e, `prod-${prod.id}`)}
                      title="Ocultar este aviso"
                      className="p-1 rounded text-slate-300 hover:text-slate-500 hover:bg-slate-200/60 transition-colors shrink-0 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}

            {/* ESTADO VAZIO */}
            {((activeFilter === 'todos' && totalActiveCount === 0) ||
              (activeFilter === 'requisicoes' && visiblePendingReqs.length === 0) ||
              (activeFilter === 'estoque' && visibleLowStock.length === 0)) && (
              <div className="py-10 px-6 text-center">
                <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-2.5">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <p className="text-xs font-bold text-slate-700">Nenhum alerta pendente</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  {activeFilter === 'requisicoes'
                    ? 'Não há requisições aguardando atendimento no momento.'
                    : activeFilter === 'estoque'
                    ? 'Todos os produtos estão acima do estoque mínimo.'
                    : 'O estoque e as requisições estão totalmente em dia.'}
                </p>
              </div>
            )}
          </div>

          {/* Rodapé com Atalhos Diretos */}
          <div className="p-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2 text-[11px]">
            <button
              type="button"
              onClick={handleSelectRequisicao}
              className="flex-1 py-1.5 px-2.5 rounded-lg bg-white hover:bg-teal-50 text-slate-700 hover:text-[#00237D] border border-slate-200 font-semibold transition-colors flex items-center justify-center gap-1 cursor-pointer"
            >
              <span>Ver Requisições</span>
              <ArrowRight className="w-3 h-3" />
            </button>

            <button
              type="button"
              onClick={handleSelectProduto}
              className="flex-1 py-1.5 px-2.5 rounded-lg bg-white hover:bg-teal-50 text-slate-700 hover:text-[#00237D] border border-slate-200 font-semibold transition-colors flex items-center justify-center gap-1 cursor-pointer"
            >
              <span>Ver Estoque</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
