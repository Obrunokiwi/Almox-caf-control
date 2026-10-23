import crypto from 'node:crypto';
import { getCentralDb, getAreaBySiglaOrId } from './db.ts';
import type { Request, Response, NextFunction } from 'express';

export interface AreaInfo {
  id: number;
  sigla: string;
  nome: string;
  arquivo_db?: string;
}

export interface UserSession {
  id: number;
  codigo?: string | null;
  nome: string;
  login: string;
  cpf?: string | null;
  email?: string | null;
  perfil: 'admin' | 'ti_dpo' | 'almoxarife' | 'requisitante';
  cargo_nome?: string | null;
  permissoes?: string[];
  centro_custo_id: number | null;
  centro_custo_nome?: string;
  centro_custo_codigo?: string;
  ativo: number;
  ultimo_acesso?: string | null;
  modulos?: string[];
  area_id?: number;
  area_sigla?: string;
  area_nome?: string;
  areas_liberadas?: AreaInfo[];
}

export const ALL_SYSTEM_MODULES = [
  'fornecedores', 'produtos', 'saldo-estoque', 'entradas', 'movimentacoes',
  'inventario', 'consumo', 'emprestimos', 'requisicoes', 'aprovacao-requisicoes',
  'centros-custo', 'usuarios', 'areas', 'relatorios', 'relatorios-outras-areas',
  'perfil', 'importacao-cadastros', 'backup'
];

export const MODULOS_PADRAO_SISTEMA: Record<string, string[]> = {
  admin: [...ALL_SYSTEM_MODULES],
  ti_dpo: [...ALL_SYSTEM_MODULES],
  almoxarife: [
    'fornecedores', 'produtos', 'saldo-estoque', 'entradas', 'movimentacoes',
    'inventario', 'consumo', 'emprestimos', 'requisicoes', 'aprovacao-requisicoes',
    'relatorios', 'relatorios-outras-areas', 'perfil'
  ],
  requisitante: [
    'requisicoes', 'perfil'
  ],
};

function attachUserModulesAndAreas(row: any, activeAreaSigla?: string) {
  if (!row) return;

  const central = getCentralDb();

  // 1. Áreas liberadas
  try {
    let areas: AreaInfo[] = [];
    if (row.perfil === 'admin' || row.perfil === 'ti_dpo' || row.id === 1 || row.login === 'admin') {
      areas = central.prepare('SELECT id, sigla, nome, arquivo_db FROM areas WHERE ativa = 1 ORDER BY id ASC').all() as any[];
    } else {
      areas = central.prepare(`
        SELECT a.id, a.sigla, a.nome, a.arquivo_db 
        FROM usuario_areas ua
        JOIN areas a ON ua.area_id = a.id
        WHERE ua.usuario_id = ? AND a.ativa = 1
        ORDER BY a.id ASC
      `).all(row.id) as any[];
    }
    row.areas_liberadas = areas;

    // Define a área ativa
    let selectedArea: AreaInfo | undefined;
    if (activeAreaSigla) {
      selectedArea = areas.find((a) => a.sigla.toUpperCase() === activeAreaSigla.toUpperCase());
    }
    if (!selectedArea && areas.length > 0) {
      selectedArea = areas[0];
    }

    if (selectedArea) {
      row.area_id = selectedArea.id;
      row.area_sigla = selectedArea.sigla;
      row.area_nome = selectedArea.nome;
    } else {
      row.area_id = 1;
      row.area_sigla = 'ALM';
      row.area_nome = 'Almoxarifado';
    }
  } catch (e) {
    row.areas_liberadas = [{ id: 1, sigla: 'ALM', nome: 'Almoxarifado' }];
    row.area_id = 1;
    row.area_sigla = 'ALM';
    row.area_nome = 'Almoxarifado';
  }

  // 2. Módulos
  if (row.id === 1 || row.login === 'admin') {
    row.modulos = [...ALL_SYSTEM_MODULES];
    return;
  }

  try {
    const rows = central.prepare('SELECT modulo_chave FROM usuario_modulos WHERE usuario_id = ?').all(row.id) as Array<{ modulo_chave: string }>;
    let list = rows.map((r) => r.modulo_chave);
    if (list.length === 0) {
      const p = (row.cargo_nome || row.perfil) as string;
      list = [...(MODULOS_PADRAO_SISTEMA[p] || ['requisicoes', 'perfil'])];
    }

    // Regras restritivas de perfil
    if (row.perfil === 'requisitante') {
      list = list.filter((m) => !['saldo-estoque', 'aprovacao-requisicoes', 'backup', 'importacao-cadastros', 'usuarios', 'areas', 'consumo'].includes(m));
    }
    if (row.perfil !== 'admin' && row.perfil !== 'ti_dpo') {
      list = list.filter((m) => !['backup', 'importacao-cadastros', 'usuarios', 'areas'].includes(m));
    }
    if (row.perfil !== 'admin' && row.perfil !== 'ti_dpo' && row.perfil !== 'almoxarife') {
      list = list.filter((m) => !['aprovacao-requisicoes', 'consumo'].includes(m));
    }

    row.modulos = list;
  } catch {
    const p = (row.cargo_nome || row.perfil) as string;
    row.modulos = [...(MODULOS_PADRAO_SISTEMA[p] || ['requisicoes', 'perfil'])];
  }
}

export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export function getUserById(id: number, activeAreaSigla?: string): UserSession | null {
  try {
    const central = getCentralDb();
    const row = central.prepare(`
      SELECT u.id, u.codigo, u.nome, u.login, u.cpf, u.email, u.perfil, 
             u.cargo_nome, u.permissoes,
             u.centro_custo_id, u.ativo, u.ultimo_acesso,
             cc.nome as centro_custo_nome, cc.codigo as centro_custo_codigo
      FROM usuarios u
      LEFT JOIN centros_custo cc ON u.centro_custo_id = cc.id
      WHERE u.id = ? AND u.ativo = 1
    `).get(id) as any;

    if (row) {
      if (row.cargo_nome) row.perfil = row.cargo_nome;
      try {
        row.permissoes = row.permissoes ? JSON.parse(row.permissoes) : [];
      } catch {
        row.permissoes = [];
      }
      attachUserModulesAndAreas(row, activeAreaSigla);
    }

    return row || null;
  } catch (_e) {
    return null;
  }
}

export function getUserByLogin(login: string, activeAreaSigla?: string): (UserSession & { senha_hash: string }) | null {
  try {
    const central = getCentralDb();
    const row = central.prepare(`
      SELECT u.id, u.codigo, u.nome, u.login, u.senha_hash, u.cpf, u.email, u.perfil, 
             u.cargo_nome, u.permissoes,
             u.centro_custo_id, u.ativo, u.ultimo_acesso,
             cc.nome as centro_custo_nome, cc.codigo as centro_custo_codigo
      FROM usuarios u
      LEFT JOIN centros_custo cc ON u.centro_custo_id = cc.id
      WHERE u.login = ? AND u.ativo = 1
    `).get(login) as any;

    if (row) {
      if (row.cargo_nome) row.perfil = row.cargo_nome;
      try {
        row.permissoes = row.permissoes ? JSON.parse(row.permissoes) : [];
      } catch {
        row.permissoes = [];
      }
      attachUserModulesAndAreas(row, activeAreaSigla);
    }

    return row || null;
  } catch (_e) {
    return null;
  }
}

// Map de sessões ativas com área ativa
interface SessionPayload {
  userId: number;
  areaSigla: string;
}

const activeSessions = new Map<string, SessionPayload>();
const SESSION_SECRET = process.env.SESSION_SECRET || 'almoxcontrol-session-secret-multi-area';

function signSessionToken(userId: number, areaSigla: string): string {
  const payload = `${userId}.${areaSigla}.${Date.now()}`;
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex').slice(0, 32);
  return `st.${payload}.${sig}`;
}

function verifySignedToken(token: string): SessionPayload | null {
  if (!token.startsWith('st.')) return null;
  const parts = token.split('.');
  if (parts.length !== 5) return null;
  const [, uidStr, areaSigla, tsStr, sig] = parts;
  const payload = `${uidStr}.${areaSigla}.${tsStr}`;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex').slice(0, 32);
  if (sig !== expectedSig) return null;
  const uid = parseInt(uidStr, 10);
  return Number.isNaN(uid) ? null : { userId: uid, areaSigla };
}

export function createSession(userId: number, areaSigla = 'ALM'): string {
  const siglaNorm = areaSigla.toUpperCase();
  const token = signSessionToken(userId, siglaNorm);
  activeSessions.set(token, { userId, areaSigla: siglaNorm });
  return token;
}

export function getSessionUser(token: string, overrideAreaSigla?: string): UserSession | null {
  let payload = activeSessions.get(token);
  if (!payload) {
    payload = verifySignedToken(token) || undefined;
  }

  if (payload) {
    const areaToUse = overrideAreaSigla || payload.areaSigla;
    return getUserById(payload.userId, areaToUse);
  }

  return null;
}

export function switchUserSessionArea(token: string, targetAreaSigla: string): string | null {
  const user = getSessionUser(token);
  if (!user) return null;

  const siglaNorm = targetAreaSigla.toUpperCase();
  // Verifica se o usuário tem acesso à área alvo
  const temAcesso = user.areas_liberadas?.some((a) => a.sigla.toUpperCase() === siglaNorm);
  if (!temAcesso && user.perfil !== 'admin' && user.perfil !== 'ti_dpo') {
    return null;
  }

  activeSessions.delete(token);
  return createSession(user.id, siglaNorm);
}

export function authenticateRequest(req: Request): UserSession | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return null;
  }

  // Header ou query de área preferida
  const headerArea = (req.headers['x-area-sigla'] || req.query.area) as string | undefined;

  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const sessionUser = getSessionUser(token, headerArea);
  if (sessionUser) return sessionUser;

  // Suporte a token no formato user:ID
  if (token.startsWith('user:')) {
    const uid = parseInt(token.replace('user:', ''), 10);
    return getUserById(uid, headerArea);
  }

  return null;
}

export function requireRole(allowedRoles: Array<'admin' | 'ti_dpo' | 'almoxarife' | 'requisitante'>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = authenticateRequest(req);
    if (!user) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }

    if (!allowedRoles.includes(user.perfil)) {
      res.status(403).json({ 
        error: `Acesso negado. Ação restrita a perfis: ${allowedRoles.join(', ')}. Seu perfil: ${user.perfil}` 
      });
      return;
    }

    (req as any).user = user;
    next();
  };
}

export function hasModulePermission(user: UserSession, modulo: string): boolean {
  if (user.id === 1 || user.login === 'admin') return true;

  const moduloNorm = modulo === 'inventarios' ? 'inventario' : modulo;

  if (user.perfil === 'requisitante') {
    if (['saldo-estoque', 'aprovacao-requisicoes', 'backup', 'importacao-cadastros', 'usuarios', 'areas', 'consumo'].includes(moduloNorm)) {
      return false;
    }
  }
  if (user.perfil !== 'admin' && user.perfil !== 'ti_dpo') {
    if (['backup', 'importacao-cadastros', 'usuarios', 'areas'].includes(moduloNorm)) {
      return false;
    }
  }
  if (user.perfil !== 'admin' && user.perfil !== 'ti_dpo' && user.perfil !== 'almoxarife') {
    if (['aprovacao-requisicoes', 'consumo'].includes(moduloNorm)) {
      return false;
    }
  }

  return (user.modulos || []).includes(moduloNorm);
}

export function requireModule(moduloChave: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = authenticateRequest(req);
    if (!user) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }

    if (!hasModulePermission(user, moduloChave)) {
      res.status(403).json({
        error: `Acesso negado. Você não possui autorização para acessar o módulo "${moduloChave}".`,
        modulo: moduloChave,
      });
      return;
    }

    (req as any).user = user;
    next();
  };
}
