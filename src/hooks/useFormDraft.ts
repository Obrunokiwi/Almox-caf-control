import { useState, useEffect, useRef, useCallback } from 'react';
import { getAuthHeaders } from '../utils/apiUtils.ts';
import { useToast } from '../context/ToastContext.tsx';

export type DraftStatus = 'idle' | 'salvando' | 'salvo' | 'erro';

export interface UseFormDraftOptions<T> {
  modulo: string;
  isOpen: boolean;
  onRestore?: (data: T) => void;
  debounceMs?: number;
}

function getLocalStorageKey(modulo: string): string {
  const areaSigla =
    (typeof window !== 'undefined' &&
      (sessionStorage.getItem('multi_almox_area_sigla') ||
        localStorage.getItem('multi_almox_area_sigla'))) ||
    'ALM';
  return `almox_draft_v2_${modulo}_${areaSigla.trim().toUpperCase()}`;
}

function readLocalDraft<T>(modulo: string): { dados: T; atualizado_em: string } | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(getLocalStorageKey(modulo));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.dados && typeof parsed.dados === 'object' && Object.keys(parsed.dados).length > 0) {
      return {
        dados: parsed.dados as T,
        atualizado_em: parsed.atualizado_em || new Date().toISOString(),
      };
    }
  } catch {
    // ignore localStorage read errors
  }
  return null;
}

function writeLocalDraft<T>(modulo: string, dados: T, atualizado_em?: string) {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(
      getLocalStorageKey(modulo),
      JSON.stringify({
        dados,
        atualizado_em: atualizado_em || new Date().toISOString(),
      })
    );
  } catch {
    // ignore localStorage write errors
  }
}

function removeLocalDraft(modulo: string) {
  try {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(getLocalStorageKey(modulo));
  } catch {
    // ignore localStorage remove errors
  }
}

export function useFormDraft<T extends Record<string, any>>({
  modulo,
  isOpen,
  onRestore,
  debounceMs = 500,
}: UseFormDraftOptions<T>) {
  const { toast } = useToast();
  const initialLocal = readLocalDraft<T>(modulo);

  const [draftStatus, setDraftStatus] = useState<DraftStatus>('idle');
  const [lastSaved, setLastSaved] = useState<Date | null>(
    initialLocal?.atualizado_em ? new Date(initialLocal.atualizado_em) : null
  );
  const [hasDraft, setHasDraft] = useState<boolean>(Boolean(initialLocal?.dados));
  const [draftData, setDraftData] = useState<T | null>(initialLocal?.dados || null);
  const [draftDate, setDraftDate] = useState<string | null>(initialLocal?.atualizado_em || null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const draftDataRef = useRef<T | null>(initialLocal?.dados || null);
  const debounceTimerRef = useRef<any>(null);
  const pendingDataRef = useRef<T | null>(null);
  const lastSerializedDataRef = useRef<string>(
    initialLocal?.dados ? JSON.stringify(initialLocal.dados) : ''
  );
  const isDiscardingRef = useRef<boolean>(false);
  const isRestoredSessionRef = useRef<boolean>(false);
  const saveSeqRef = useRef<number>(0);
  const isSavingInFlightRef = useRef<boolean>(false);
  const isOpenRef = useRef<boolean>(isOpen);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  const updateDraftState = useCallback((loaded: T | null, updatedAt: string | null) => {
    draftDataRef.current = loaded;
    setDraftData(loaded);
    setDraftDate(updatedAt);
    if (updatedAt) {
      setLastSaved(new Date(updatedAt));
    }
  }, []);

  // 1. Carrega rascunho existente do servidor (com fallback para o espelho local mais recente)
  const loadDraft = useCallback(async (): Promise<T | null> => {
    if (isDiscardingRef.current) return null;

    // Se houver alterações pendentes no debounce ou salvamento em andamento, prioriza o estado local em memória
    if (pendingDataRef.current || isSavingInFlightRef.current) {
      return pendingDataRef.current || draftDataRef.current;
    }

    const localCached = readLocalDraft<T>(modulo);

    try {
      const res = await fetch(`/api/rascunhos/${modulo}`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.rascunho && data.rascunho.dados && Object.keys(data.rascunho.dados).length > 0) {
          let loaded = data.rascunho.dados as T;
          let updatedAt = data.rascunho.atualizado_em || new Date().toISOString();

          // Se o cache local tiver mais itens preenchidos (ex: usuário acabou de salvar/editar), preserva o mais completo
          if (localCached?.dados && modulo === 'entradas_nota') {
            const serverItems = Array.isArray((loaded as any).newNotaItens)
              ? (loaded as any).newNotaItens.filter((it: any) => Number(it?.produto_id) > 0).length
              : 0;
            const localItems = Array.isArray((localCached.dados as any).newNotaItens)
              ? (localCached.dados as any).newNotaItens.filter((it: any) => Number(it?.produto_id) > 0).length
              : 0;
            if (localItems > serverItems) {
              loaded = localCached.dados;
              updatedAt = localCached.atualizado_em;
            }
          }

          const serialized = JSON.stringify(loaded);
          const cloned = JSON.parse(serialized) as T;
          writeLocalDraft(modulo, cloned, updatedAt);
          updateDraftState(cloned, updatedAt);
          lastSerializedDataRef.current = serialized;
          if (!isRestoredSessionRef.current && !isOpenRef.current) {
            setHasDraft(true);
          }
          return cloned;
        } else if (localCached?.dados) {
          updateDraftState(localCached.dados, localCached.atualizado_em);
          lastSerializedDataRef.current = JSON.stringify(localCached.dados);
          if (!isRestoredSessionRef.current && !isOpenRef.current) {
            setHasDraft(true);
          }
          return localCached.dados;
        } else {
          setHasDraft(false);
          updateDraftState(null, null);
          return null;
        }
      }
    } catch (err) {
      console.warn(`[Draft] Aviso ao carregar rascunho de ${modulo}:`, err);
      if (localCached?.dados) {
        updateDraftState(localCached.dados, localCached.atualizado_em);
        return localCached.dados;
      }
    }
    return draftDataRef.current;
  }, [modulo, updateDraftState]);

  useEffect(() => {
    loadDraft();
  }, [loadDraft]);

  // 2. Função de salvamento real na API (com snapshot imutável imediato)
  const saveDraft = useCallback(
    async (formData: T, isManual: boolean = false): Promise<boolean> => {
      if (isManual) {
        isDiscardingRef.current = false;
      }
      if (isDiscardingRef.current) return false;

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      pendingDataRef.current = null;

      // Não salva rascunho vazio
      if (!formData || Object.keys(formData).length === 0) {
        return false;
      }

      // Captura snapshot imutável ANTES da chamada assíncrona para evitar mutação concorrente
      const serializedSnapshot = JSON.stringify(formData);
      const immutableSnapshot: T = JSON.parse(serializedSnapshot);
      const now = new Date();
      const nowIso = now.toISOString();

      // Atualiza imediatamente em memória e no localStorage (0ms de perda)
      writeLocalDraft(modulo, immutableSnapshot, nowIso);
      updateDraftState(immutableSnapshot, nowIso);
      lastSerializedDataRef.current = serializedSnapshot;

      const currentSeq = ++saveSeqRef.current;
      isSavingInFlightRef.current = true;
      setDraftStatus('salvando');
      setErrorMessage(null);

      try {
        const res = await fetch(`/api/rascunhos/${modulo}`, {
          method: 'POST',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            dados: immutableSnapshot,
            forcar_sobrescrita: isManual,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Falha ao salvar rascunho.');
        }

        // Só aplica metadados da resposta se nenhuma gravação mais recente tiver ocorrido
        if (currentSeq === saveSeqRef.current) {
          const serverIso = data.atualizado_em || nowIso;
          const finalData = (data.dados && typeof data.dados === 'object')
            ? (data.dados as T)
            : immutableSnapshot;
          writeLocalDraft(modulo, finalData, serverIso);
          updateDraftState(finalData, serverIso);
          lastSerializedDataRef.current = JSON.stringify(finalData);
          setDraftStatus('salvo');
        }

        if (isManual) {
          toast.success(
            'Rascunho Salvo',
            'Todos os campos e itens preenchidos foram salvos e podem ser retomados a qualquer momento.'
          );
        }
        return true;
      } catch (err: any) {
        const msg = err.message || 'Erro ao salvar rascunho';
        setDraftStatus('erro');
        setErrorMessage(msg);
        if (isManual) {
          toast.error('Erro ao Salvar Rascunho', msg);
        }
        return false;
      } finally {
        if (currentSeq === saveSeqRef.current) {
          isSavingInFlightRef.current = false;
        }
      }
    },
    [modulo, toast, updateDraftState]
  );

  // Flush automático ao fechar o formulário para nunca perder alterações recentes no debounce
  useEffect(() => {
    if (isOpen) {
      isDiscardingRef.current = false;
    } else {
      isRestoredSessionRef.current = false;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (pendingDataRef.current && !isDiscardingRef.current) {
        const toFlush = pendingDataRef.current;
        pendingDataRef.current = null;
        saveDraft(toFlush, false);
      } else {
        setDraftStatus('idle');
      }
    }
  }, [isOpen, saveDraft]);

  // 3. Agendamento com debounce para auto-save após digitação (com persistência local síncrona imediata)
  const scheduleAutoSave = useCallback(
    (formData: T) => {
      if (!isOpenRef.current || isDiscardingRef.current) return;

      const serialized = JSON.stringify(formData);
      if (serialized === lastSerializedDataRef.current) {
        return;
      }

      const immutableSnapshot: T = JSON.parse(serialized);
      const nowIso = new Date().toISOString();
      pendingDataRef.current = immutableSnapshot;
      writeLocalDraft(modulo, immutableSnapshot, nowIso);
      updateDraftState(immutableSnapshot, nowIso);

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      setDraftStatus('salvando');

      debounceTimerRef.current = setTimeout(() => {
        saveDraft(immutableSnapshot, false);
      }, debounceMs);
    },
    [modulo, debounceMs, saveDraft, updateDraftState]
  );

  // 4. Descartar rascunho manualmente
  const discardDraft = useCallback(async () => {
    isDiscardingRef.current = true;
    isRestoredSessionRef.current = false;
    pendingDataRef.current = null;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    removeLocalDraft(modulo);
    setHasDraft(false);
    updateDraftState(null, null);
    setDraftStatus('idle');
    lastSerializedDataRef.current = '';

    try {
      await fetch(`/api/rascunhos/${modulo}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      toast.info('Rascunho Descartado', 'O formulário foi limpo e o rascunho removido.');
    } catch (err) {
      console.warn(`[Draft] Erro ao descartar rascunho de ${modulo}:`, err);
    } finally {
      isDiscardingRef.current = false;
    }
  }, [modulo, toast, updateDraftState]);

  // 5. Aplicar o rascunho carregado no estado do formulário
  const applyDraft = useCallback(
    (silent: boolean = false, explicitData?: T | null) => {
      isRestoredSessionRef.current = true;
      setHasDraft(false);
      const targetData = explicitData || draftDataRef.current || draftData;
      if (targetData && onRestore) {
        const cloned = JSON.parse(JSON.stringify(targetData)) as T;
        onRestore(cloned);
        if (!silent) {
          toast.success(
            'Rascunho Restaurado',
            'Campos e itens preenchidos anteriormente foram recuperados com sucesso.'
          );
        }
      }
    },
    [draftData, onRestore, toast]
  );

  // 6. Limpar rascunho silenciosamente após envio definitivo do formulário com sucesso
  const clearDraftOnSubmit = useCallback(async () => {
    isDiscardingRef.current = true;
    isRestoredSessionRef.current = false;
    pendingDataRef.current = null;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    removeLocalDraft(modulo);
    setHasDraft(false);
    updateDraftState(null, null);
    setDraftStatus('idle');
    lastSerializedDataRef.current = '';

    try {
      await fetch(`/api/rascunhos/${modulo}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
    } catch {
      // ignore error on cleanup
    } finally {
      isDiscardingRef.current = false;
    }
  }, [modulo, updateDraftState]);

  const lastSavedFormatted = lastSaved
    ? `${String(lastSaved.getHours()).padStart(2, '0')}:${String(lastSaved.getMinutes()).padStart(2, '0')}:${String(lastSaved.getSeconds()).padStart(2, '0')}`
    : null;

  return {
    draftStatus,
    lastSaved,
    lastSavedFormatted,
    hasDraft,
    draftData,
    draftDate,
    errorMessage,
    loadDraft,
    saveDraft,
    scheduleAutoSave,
    discardDraft,
    applyDraft,
    clearDraftOnSubmit,
  };
}
