/**
 * Utilitário central de leitura, validação, arredondamento comercial (half-up)
 * e formatação numérica com limite máximo de 4 casas decimais.
 */

export const MAX_DECIMAL_PLACES = 4;
export const STOCK_EPSILON = 0.00001; // Tolerância para comparações de ponto flutuante em saldos de até 4 casas

/**
 * Arredonda comercialmente (meio para cima / half-up) para no máximo `decimals` casas decimais (padrão 4).
 * Nunca retorna NaN ou Infinity — em caso de valor inválido, retorna 0.
 */
export function round4(val: unknown, decimals: number = MAX_DECIMAL_PLACES): number {
  const num = typeof val === 'number' ? val : parseRawNumber(val);
  if (!Number.isFinite(num)) return 0;
  const d = Math.max(0, Math.min(8, Math.trunc(decimals)));
  const factor = Math.pow(10, d);
  const sign = num < 0 ? -1 : 1;
  const abs = Math.abs(num);
  // Compensa imprecisão binária IEEE-754 antes do Math.round (ex.: 1.00005 * 10000)
  const rounded = Math.round((abs + 1e-12) * factor) / factor;
  const result = sign * rounded;
  return Object.is(result, -0) ? 0 : result;
}

/**
 * Converte internamente qualquer entrada (number ou string com vírgula/ponto, R$, %, espaços)
 * para um float bruto (ou NaN se não for interpretável).
 */
function parseRawNumber(raw: unknown): number {
  if (raw === null || raw === undefined || raw === '') return NaN;
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : NaN;
  }
  let s = String(raw).trim();
  if (!s) return NaN;

  // Remove símbolos de moeda, percentual e espaços invisíveis
  s = s.replace(/[R$%\s\u00A0]/gi, '');
  if (!s || s === '-' || s === '+') return NaN;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');

  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) {
      // Formato brasileiro: 1.250,50000000 -> 1250.50000000
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // Formato internacional: 1,250.50000000 -> 1250.50000000
      s = s.replace(/,/g, '');
    }
  } else if (lastComma > -1) {
    // Apenas vírgula(s): se houver mais de uma vírgula, todas exceto a última são separadores de milhar
    const parts = s.split(',');
    if (parts.length > 2) {
      const dec = parts.pop();
      s = parts.join('') + '.' + dec;
    } else {
      s = s.replace(',', '.');
    }
  } else if (lastDot > -1) {
    // Apenas ponto(s): se houver mais de um ponto (ex.: 1.000.000), junta milhares
    const parts = s.split('.');
    if (parts.length > 2) {
      const dec = parts.pop();
      s = parts.join('') + '.' + dec;
    }
  }

  const parsed = Number(s);
  return Number.isFinite(parsed) ? parsed : NaN;
}

/**
 * Lê, valida e arredonda comercialmente para até 4 casas decimais qualquer número ou string
 * digitada com vírgula ou ponto (ex.: "1,000", "1,00000000", "0.12345678").
 * Caso inválido ou vazio, retorna `defaultValue` (padrão 0).
 */
export function parseDecimal(raw: unknown, defaultValue: number = 0, decimals: number = MAX_DECIMAL_PLACES): number {
  const num = parseRawNumber(raw);
  if (!Number.isFinite(num)) return round4(defaultValue, decimals);
  return round4(num, decimals);
}

/**
 * Versão anulável de `parseDecimal`: retorna `null` quando o campo está em branco ou é inválido,
 * ou o número arredondado em até 4 casas decimais quando válido.
 */
export function parseDecimalNullable(raw: unknown, decimals: number = MAX_DECIMAL_PLACES): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string' && raw.trim() === '') return null;
  const num = parseRawNumber(raw);
  if (!Number.isFinite(num)) return null;
  return round4(num, decimals);
}

/**
 * Verifica se a string/valor bruto possuía mais de 4 casas decimais antes do arredondamento,
 * útil para exibir avisos ou logs de normalização sem bloquear a operação.
 */
export function hadMoreThan4Decimals(raw: unknown): boolean {
  if (raw === null || raw === undefined) return false;
  const s = String(raw).trim().replace(/[R$%\s\u00A0]/gi, '');
  if (!s) return false;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  const sepIndex = Math.max(lastComma, lastDot);
  if (sepIndex === -1) return false;
  const fracPart = s.slice(sepIndex + 1).replace(/0+$/, ''); // Ignora zeros à direita (ex.: 1,00000000 -> 0 casas significativas)
  return fracPart.length > MAX_DECIMAL_PLACES;
}

/**
 * Compara de forma segura se o saldo disponível (`available`) é suficiente para atender `requested`,
 * aplicando arredondamento de 4 casas e tolerância contra imprecisão de ponto flutuante.
 */
export function hasSufficientStock(available: unknown, requested: unknown): boolean {
  const avail = round4(available);
  const req = round4(requested);
  if (req <= 0) return true;
  return avail + STOCK_EPSILON >= req;
}

/**
 * Subtrai `deduction` de `available` com arredondamento comercial de 4 casas decimais,
 * garantindo que erros de ponto flutuante (ex.: 1.0005 - 1.0005 = -1e-16) nunca gerem saldo negativo.
 */
export function safeSubtractStock(available: unknown, deduction: unknown): number {
  const avail = round4(available);
  const ded = round4(deduction);
  const diff = round4(avail - ded);
  return diff <= STOCK_EPSILON ? 0 : diff;
}

/**
 * Soma dois ou mais valores numéricos com arredondamento de 4 casas decimais.
 */
export function safeAddStock(...values: unknown[]): number {
  let acc = 0;
  for (const v of values) {
    acc = round4(acc + round4(v));
  }
  return acc;
}

/**
 * Formata um número no padrão brasileiro (vírgula decimal, ponto de milhar) com até 4 casas decimais.
 */
export function formatDecimal4(
  val: unknown,
  minDecimals: number = 0,
  maxDecimals: number = MAX_DECIMAL_PLACES
): string {
  const num = parseDecimalNullable(val, maxDecimals);
  if (num === null) return '-';
  const minD = Math.max(0, Math.min(maxDecimals, minDecimals));
  const maxD = Math.max(minD, Math.min(MAX_DECIMAL_PLACES, maxDecimals));
  return num.toLocaleString('pt-BR', {
    minimumFractionDigits: minD,
    maximumFractionDigits: maxD,
  });
}

/**
 * Formata um valor monetário (R$) no padrão brasileiro com mínimo de 2 e máximo de 4 casas decimais.
 */
export function formatCurrency4(
  val: unknown,
  minDecimals: number = 2,
  maxDecimals: number = MAX_DECIMAL_PLACES
): string {
  const num = parseDecimalNullable(val, maxDecimals);
  if (num === null) return '-';
  // Se o valor tiver 3ª ou 4ª casa decimal diferente de zero, exibe até 4 casas; caso contrário, respeita minDecimals (2)
  const minD = Math.max(0, Math.min(maxDecimals, minDecimals));
  const maxD = Math.max(minD, Math.min(MAX_DECIMAL_PLACES, maxDecimals));
  return num.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: minD,
    maximumFractionDigits: maxD,
  });
}

/**
 * Normaliza o texto de um input numérico durante a digitação ou no blur:
 * aceita vírgula ou ponto e, no blur, arredonda para no máximo 4 casas decimais.
 */
export function normalizeNumericInputOnBlur(raw: string, allowEmpty: boolean = true): string {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return allowEmpty ? '' : '0';
  const parsed = parseDecimalNullable(trimmed, MAX_DECIMAL_PLACES);
  if (parsed === null) return allowEmpty ? '' : '0';
  return String(parsed);
}
