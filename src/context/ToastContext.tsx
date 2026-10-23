import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

export interface ToastItem extends ToastOptions {
  id: string;
  createdAt: number;
}

interface ToastContextValue {
  toasts: ToastItem[];
  showToast: (options: ToastOptions) => string;
  dismissToast: (id: string) => void;
  toast: {
    success: (title: string, message?: string, duration?: number) => string;
    error: (title: string, message?: string, duration?: number) => string;
    warning: (title: string, message?: string, duration?: number) => string;
    info: (title: string, message?: string, duration?: number) => string;
  };
}

const ToastContext = createContext<ToastContextValue | null>(null);

interface SingleToastProps {
  item: ToastItem;
  onDismiss: (id: string) => void;
}

const SingleToast: React.FC<SingleToastProps> = ({ item, onDismiss }) => {
  const duration = item.duration ?? 4500;
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(100);
  const remainingRef = useRef(duration);
  const lastTickRef = useRef(Date.now());

  useEffect(() => {
    if (duration <= 0) return;

    lastTickRef.current = Date.now();
    const interval = setInterval(() => {
      if (isPaused) {
        lastTickRef.current = Date.now();
        return;
      }
      const now = Date.now();
      const elapsed = now - lastTickRef.current;
      lastTickRef.current = now;
      remainingRef.current = Math.max(0, remainingRef.current - elapsed);
      const pct = (remainingRef.current / duration) * 100;
      setProgress(pct);

      if (remainingRef.current <= 0) {
        clearInterval(interval);
        onDismiss(item.id);
      }
    }, 40);

    return () => clearInterval(interval);
  }, [duration, isPaused, item.id, onDismiss]);

  const config = {
    success: {
      borderLeft: 'border-l-emerald-600',
      iconBg: 'bg-emerald-50 text-emerald-600 border-emerald-200',
      titleColor: 'text-slate-900',
      badgeText: 'SUCESSO',
      badgeStyle: 'text-emerald-700',
      progressBg: 'bg-emerald-500',
      Icon: CheckCircle2,
    },
    error: {
      borderLeft: 'border-l-rose-600',
      iconBg: 'bg-rose-50 text-rose-600 border-rose-200',
      titleColor: 'text-slate-900',
      badgeText: 'ERRO',
      badgeStyle: 'text-rose-700',
      progressBg: 'bg-rose-500',
      Icon: AlertCircle,
    },
    warning: {
      borderLeft: 'border-l-amber-500',
      iconBg: 'bg-amber-50 text-amber-600 border-amber-200',
      titleColor: 'text-slate-900',
      badgeText: 'ATENÇÃO',
      badgeStyle: 'text-amber-700',
      progressBg: 'bg-amber-500',
      Icon: AlertTriangle,
    },
    info: {
      borderLeft: 'border-l-teal-600',
      iconBg: 'bg-teal-50 text-teal-600 border-teal-200',
      titleColor: 'text-slate-900',
      badgeText: 'INFORMAÇÃO',
      badgeStyle: 'text-teal-700',
      progressBg: 'bg-teal-500',
      Icon: Info,
    },
  }[item.type];

  const { Icon } = config;

  return (
    <div
      role={item.type === 'error' ? 'alert' : 'status'}
      aria-live={item.type === 'error' ? 'assertive' : 'polite'}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className={`pointer-events-auto relative w-full bg-white rounded-xl border border-slate-200 border-l-4 ${config.borderLeft} shadow-xl shadow-slate-900/10 overflow-hidden transition-all duration-200 animate-fadeIn`}
    >
      <div className="p-3.5 pr-9 flex items-start gap-3">
        <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 ${config.iconBg}`}>
          <Icon className="w-4 h-4" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider">
            <span className={config.badgeStyle}>{config.badgeText}</span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="text-slate-400 font-mono">
              {new Date(item.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
          <h4 className={`text-xs font-bold mt-0.5 leading-snug ${config.titleColor}`}>
            {item.title}
          </h4>
          {item.message && (
            <p className="text-xs text-slate-600 mt-1 leading-relaxed break-words">
              {item.message}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => onDismiss(item.id)}
          className="absolute top-2.5 right-2.5 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          title="Fechar notificação"
          aria-label="Fechar notificação"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Barra de progresso temporal */}
      {duration > 0 && (
        <div className="h-1 w-full bg-slate-100">
          <div
            className={`h-full transition-all duration-75 ${config.progressBg}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((options: ToastOptions): string => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newItem: ToastItem = {
      ...options,
      id,
      createdAt: Date.now(),
    };
    setToasts((prev) => [...prev.slice(-4), newItem]);
    return id;
  }, []);

  const toastHelpers = React.useMemo(
    () => ({
      success: (title: string, message?: string, duration?: number) =>
        showToast({ type: 'success', title, message, duration }),
      error: (title: string, message?: string, duration?: number) =>
        showToast({ type: 'error', title, message, duration: duration ?? 6000 }),
      warning: (title: string, message?: string, duration?: number) =>
        showToast({ type: 'warning', title, message, duration: duration ?? 5000 }),
      info: (title: string, message?: string, duration?: number) =>
        showToast({ type: 'info', title, message, duration }),
    }),
    [showToast]
  );

  return (
    <ToastContext.Provider value={{ toasts, showToast, dismissToast, toast: toastHelpers }}>
      {children}

      {/* Container Flutuante de Toasts */}
      <div
        aria-label="Notificações do sistema"
        className="fixed bottom-5 right-5 z-[120] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0 print:hidden"
      >
        {toasts.map((item) => (
          <SingleToast key={item.id} item={item} onDismiss={dismissToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast deve ser utilizado dentro de um ToastProvider');
  }
  return ctx;
}
