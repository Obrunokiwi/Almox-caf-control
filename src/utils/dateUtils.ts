/**
 * Utilitários de data e hora formatados no padrão brasileiro e horário de Brasília (America/Sao_Paulo)
 */

export function formatDateTimeBrasilia(dateInput?: string | Date | null): string {
  if (!dateInput) return '-';
  try {
    if (dateInput instanceof Date) {
      if (isNaN(dateInput.getTime())) return '-';
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${pad(dateInput.getDate())}/${pad(dateInput.getMonth() + 1)}/${dateInput.getFullYear()} ${pad(dateInput.getHours())}:${pad(dateInput.getMinutes())}:${pad(dateInput.getSeconds())}`;
    }

    let dateStr = String(dateInput).trim();
    if (!dateStr) return '-';

    // Se a string veio do SQLite como "2026-10-14 15:42:07" sem indicador de fuso,
    // o SQLite grava CURRENT_TIMESTAMP em UTC. Adiciona 'Z' para conversão correta ao horário do computador
    if (!dateStr.includes('Z') && !dateStr.includes('+')) {
      if (!dateStr.includes('T')) {
        dateStr = dateStr.replace(' ', 'T') + 'Z';
      } else {
        dateStr = dateStr + 'Z';
      }
    }

    const d = new Date(dateStr);
    if (isNaN(d.getTime())) {
      const fallback = new Date(dateInput);
      if (isNaN(fallback.getTime())) return String(dateInput);
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${pad(fallback.getDate())}/${pad(fallback.getMonth() + 1)}/${fallback.getFullYear()} ${pad(fallback.getHours())}:${pad(fallback.getMinutes())}:${pad(fallback.getSeconds())}`;
    }

    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch {
    return String(dateInput);
  }
}

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
