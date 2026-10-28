/**
 * Retorna os cabeçalhos padrão para requisições à API REST do AlmoxControl,
 * garantindo o envio do Token JWT e da Sigla da Área Operacional ativa (ALM, CAF, etc.).
 */
export function getAuthHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
  const token = sessionStorage.getItem('multi_almox_token') || localStorage.getItem('multi_almox_token');
  const areaSigla = sessionStorage.getItem('multi_almox_area_sigla') || 'ALM';

  const headers: Record<string, string> = {
    'X-Area-Sigla': areaSigla,
    ...extraHeaders,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}
