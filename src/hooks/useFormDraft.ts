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

export function useFormDraft<T extends Record<string, any>>({
  modulo,
  isOpen,
  onRestore,
  debounceMs = 900,
}: UseFormDraftOptions<T>) {
  const { toast } = useToast();
  const [draftStatus, setDraftStatus] = useState<DraftStatus>('idle');
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasDraft, setHasDraft] = useState<boolean>(false);
  const [draftData, setDraftData] = useState<T | null>(null);
  const [draftDate, setDraftDate] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const debounceTimerRef = useRef<any>(null);
  const lastSerializedDataRef = useRef<string>('');
  const isDiscardingRef = useRef<boolean>(false);

  // 1. Carrega rascunho existente do servidor ao abrir o formulário
  const loadDraft = useCallback(async () => {
    try {
      const res = await fetch(`/api/rascunhos/${modulo}`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.rascunho && data.rascunho.dados && Object.keys(data.rascunho.dados).length > 0) {
          setHasDraft(true);
          setDraftData(data.rascunho.dados as T);
          setDraftDate(data.rascunho.atualizado_em);
          setLastSaved(new Date(data.rascunho.atualizado_em));
          lastSerializedDataRef.current = JSON.stringify(data.rascunho.dados);
        } else {
          setHasDraft(false);
          setDraftData(null);
          setDraftDate(null);
        }
      }
    } catch (err) {
      console.warn(`[Draft] Aviso ao carregar rascunho de ${modulo}:`, err);
    }
  }, [modulo]);

  useEffect(() => {
    loadDraft();
  }, [loadDraft]);

  useEffect(() => {
    if (isOpen) {
      isDiscardingRef.current = false;
      loadDraft();
    } else {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      setDraftStatus('idle');
    }
  }, [isOpen, loadDraft]);

  // 2. Função de salvamento real na API
  const saveDraft = useCallback(
    async (formData: T, isManual: boolean = false): Promise<boolean> => {
      if (isDiscardingRef.current) return false;

      // Não salva rascunho vazio
      if (!formData || Object.keys(formData).length === 0) {
        return false;
      }

      setDraftStatus('salvando');
      setErrorMessage(null);

      try {
        const res = await fetch(`/api/rascunhos/${modulo}`, {
          method: 'POST',
          headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ dados: formData }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Falha ao salvar rascunho.');
        }

        const now = new Date();
        setDraftStatus('salvo');
        setLastSaved(now);
        setDraftDate(now.toISOString());
        setDraftData(formData);
        setHasDraft(true);
        lastSerializedDataRef.current = JSON.stringify(formData);

        if (isManual) {
          toast.success('Rascunho Salvo', 'O progresso do formulário foi salvo no banco e pode ser retomado a qualquer momento.');
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
      }
    },
    [modulo, toast]
  );

  // 3. Agendamento com debounce para auto-save após digitação
  const scheduleAutoSave = useCallback(
    (formData: T) => {
      if (!isOpen || isDiscardingRef.current) return;

      const serialized = JSON.stringify(formData);
      // Evita chamadas se o conteúdo não mudou
      if (serialized === lastSerializedDataRef.current) {
        return;
      }

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      setDraftStatus('salvando');

      debounceTimerRef.current = setTimeout(() => {
        saveDraft(formData, false);
      }, debounceMs);
    },
    [isOpen, debounceMs, saveDraft]
  );

  // 4. Descartar rascunho manualmente
  const discardDraft = useCallback(async () => {
    isDiscardingRef.current = true;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    try {
      await fetch(`/api/rascunhos/${modulo}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      setHasDraft(false);
      setDraftData(null);
      setDraftDate(null);
      setDraftStatus('idle');
      lastSerializedDataRef.current = '';
      toast.info('Rascunho Descartado', 'O formulário foi limpo e o rascunho removido.');
    } catch (err) {
      console.warn(`[Draft] Erro ao descartar rascunho de ${modulo}:`, err);
    }
  }, [modulo, toast]);

  // 5. Aplicar o rascunho carregado no estado do formulário
  const applyDraft = useCallback(() => {
    if (draftData && onRestore) {
      onRestore(draftData);
      setHasDraft(false); // Oculta a barra de alerta após aplicar
      toast.success('Rascunho Restaurado', 'Campos e itens preenchidos anteriormente foram recuperados com sucesso.');
    }
  }, [draftData, onRestore, toast]);

  // 6. Limpar rascunho silenciosamente após envio definitivo do formulário com sucesso
  const clearDraftOnSubmit = useCallback(async () => {
    isDiscardingRef.current = true;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    setHasDraft(false);
    setDraftData(null);
    setDraftDate(null);
    setDraftStatus('idle');
    lastSerializedDataRef.current = '';

    try {
      await fetch(`/api/rascunhos/${modulo}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
    } catch {}
  }, [modulo]);

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
    saveDraft,
    scheduleAutoSave,
    discardDraft,
    applyDraft,
    clearDraftOnSubmit,
  };
}
