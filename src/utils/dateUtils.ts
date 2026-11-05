/**
 * Utilitários de data e hora formatados no padrão brasileiro e horário de Brasília (America/Sao_Paulo)
 */

export function formatDateTimeBrasilia(
  dateInput?: string | Date | null,
  options?: { hideSeconds?: boolean }
): string {
  if (!dateInput) return '-';
  try {
    let d: Date;

    if (dateInput instanceof Date) {
      d = dateInput;
    } else {
      let dateStr = String(dateInput).trim();
      if (!dateStr) return '-';

      // Se a string já veio formatada como "05/11/2026 09:18" ou similar
      if (/^\d{2}\/\d{2}\/\d{4}/.test(dateStr)) {
        return dateStr;
      }

      // Se a string veio do SQLite como "2026-10-14 15:42:07" sem indicador de fuso,
      // o SQLite grava CURRENT_TIMESTAMP em UTC. Adiciona 'Z' para conversão correta ao horário de Brasília
      if (!dateStr.includes('Z') && !dateStr.includes('+')) {
        if (!dateStr.includes('T')) {
          dateStr = dateStr.replace(' ', 'T') + 'Z';
        } else {
          dateStr = dateStr + 'Z';
        }
      }

      d = new Date(dateStr);
      if (isNaN(d.getTime())) {
        d = new Date(String(dateInput));
      }
    }

    if (isNaN(d.getTime())) return String(dateInput);

    const parts = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(d);

    const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '00';

    const day = getPart('day');
    const month = getPart('month');
    const year = getPart('year');
    const hour = getPart('hour');
    const minute = getPart('minute');
    const second = getPart('second');

    if (options?.hideSeconds) {
      return `${day}/${month}/${year} ${hour}:${minute}`;
    }
    return `${day}/${month}/${year} ${hour}:${minute}:${second}`;
  } catch {
    return String(dateInput);
  }
}

export const formatDataHoraBrasilia = formatDateTimeBrasilia;

export function formatDateBrasilia(dateInput?: string | Date | null): string {
  if (!dateInput) return '-';
  try {
    const raw = String(dateInput).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const [y, m, d] = raw.split('-');
      return `${d}/${m}/${y}`;
    }
    const d = new Date(raw.includes('T') || raw.includes('Z') ? raw : `${raw}T12:00:00Z`);
    if (isNaN(d.getTime())) return raw;

    const parts = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d);

    const day = parts.find((p) => p.type === 'day')?.value || '00';
    const month = parts.find((p) => p.type === 'month')?.value || '00';
    const year = parts.find((p) => p.type === 'year')?.value || '0000';

    return `${day}/${month}/${year}`;
  } catch {
    return String(dateInput);
  }
}

export function formatCurrencyBRL(val?: number | null): string {
  const num = Number(val) || 0;
  return num.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
