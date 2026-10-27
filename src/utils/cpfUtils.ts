// Utilitários para formatação e validação de CPF (xxx.xxx.xxx-xx)

export function maskCpf(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

export function cleanCpf(value?: string | null): string {
  return (value || '').replace(/\D/g, '');
}

export function isValidCpfLength(value?: string | null): boolean {
  return cleanCpf(value).length === 11;
}

export function formatCpf(digitsOrFormatted?: string | null): string {
  const digits = cleanCpf(digitsOrFormatted);
  if (digits.length !== 11) return digitsOrFormatted || '';
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}
