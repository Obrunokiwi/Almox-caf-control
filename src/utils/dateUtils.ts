/**
 * Utilitários de data e hora formatados no padrão brasileiro e horário de Brasília (America/Sao_Paulo)
 */

export function formatDateTimeBrasilia(dateInput?: string | Date | null): string {
  if (!dateInput) return '-';
  try {
    let dateStr = String(dateInput).trim();
    if (!dateStr) return '-';

    // Se a string veio do SQLite como "2026-10-14 15:42:07" sem indicador de fuso,
    // o SQLite grava CURRENT_TIMESTAMP em UTC. Adiciona 'Z' para conversão correta para Brasília (-03:00)
    if (!dateStr.includes('Z') && !dateStr.includes('+') && !dateStr.includes('T')) {
      dateStr = dateStr.replace(' ', 'T') + 'Z';
    }

    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateInput);

    // Formato brasileiro estrito: dd/mm/aaaa HH:mm:ss, 24h, sem fuso ("UTC", "GMT", "Z")
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

    const day = parts.find((p) => p.type === 'day')?.value || '00';
    const month = parts.find((p) => p.type === 'month')?.value || '00';
    const year = parts.find((p) => p.type === 'year')?.value || '0000';
    const hour = parts.find((p) => p.type === 'hour')?.value || '00';
    const minute = parts.find((p) => p.type === 'minute')?.value || '00';
    const second = parts.find((p) => p.type === 'second')?.value || '00';

    return `${day}/${month}/${year} ${hour}:${minute}:${second}`;
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
