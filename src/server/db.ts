import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AsyncLocalStorage } from 'node:async_hooks';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, '../..');

export const CENTRAL_DB_PATH = path.resolve(PROJECT_ROOT, 'sistema.db');
export const DB_PATH = path.resolve(PROJECT_ROOT, 'almoxarifado.db');

export const currentAreaStorage = new AsyncLocalStorage<{
  areaSigla: string;
  areaId: number;
  db: DatabaseSync;
}>();

// Cache de conexões SQLite ativas
let centralDbInstance: DatabaseSync | null = null;
const areaDbConnections = new Map<string, DatabaseSync>();

export function getCentralDb(): DatabaseSync {
  if (!centralDbInstance) {
    const isNew = !fs.existsSync(CENTRAL_DB_PATH);
    centralDbInstance = new DatabaseSync(CENTRAL_DB_PATH);
    centralDbInstance.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');

    if (isNew) {
      initCentralDb(centralDbInstance);
    } else {
      ensureCentralSchema(centralDbInstance);
    }
  }
  return centralDbInstance;
}

function initCentralDb(db: DatabaseSync) {
  const schemaPath = path.resolve(PROJECT_ROOT, 'schema_central.sql');
  if (fs.existsSync(schemaPath)) {
    const sql = fs.readFileSync(schemaPath, 'utf-8');
    db.exec(sql);
  }

  ensureCentralSchema(db);
}

function ensureCentralSchema(db: DatabaseSync) {
  // 1. Garante tabela de áreas
  db.exec(`
    CREATE TABLE IF NOT EXISTS areas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sigla TEXT UNIQUE NOT NULL,
        nome TEXT NOT NULL,
        arquivo_db TEXT UNIQUE NOT NULL,
        descricao TEXT,
        ativa INTEGER NOT NULL DEFAULT 1,
        criada_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_areas_sigla ON areas (sigla);
    CREATE INDEX IF NOT EXISTS idx_areas_ativa ON areas (ativa);
  `);

  // Garante áreas padrão: ALM e CAF
  const alm = db.prepare('SELECT id FROM areas WHERE sigla = ?').get('ALM') as any;
  if (!alm) {
    db.prepare(`
      INSERT INTO areas (id, sigla, nome, arquivo_db, descricao, ativa)
      VALUES (1, 'ALM', 'Almoxarifado', 'almoxarifado.db', 'Estoque de Insumos e Materiais Médicos-Hospitalares', 1)
    `).run();
  }

  const caf = db.prepare('SELECT id FROM areas WHERE sigla = ?').get('CAF') as any;
  if (!caf) {
    db.prepare(`
      INSERT INTO areas (id, sigla, nome, arquivo_db, descricao, ativa)
      VALUES (2, 'CAF', 'CAF', 'caf.db', 'Central de Abastecimento Farmacêutico (Medicamentos)', 1)
    `).run();
  }

  // 2. Garante tabela de relatórios cruzados
  db.exec(`
    CREATE TABLE IF NOT EXISTS area_relatorios_cruzados (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        area_origem_id INTEGER NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
        area_alvo_id INTEGER NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
        criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(area_origem_id, area_alvo_id)
    );
    CREATE INDEX IF NOT EXISTS idx_rel_cruz_origem ON area_relatorios_cruzados (area_origem_id);
    CREATE INDEX IF NOT EXISTS idx_rel_cruz_alvo ON area_relatorios_cruzados (area_alvo_id);
  `);

  // Regra padrão: CAF (2) pode consultar ALM (1)
  try {
    const hasRule = db.prepare('SELECT id FROM area_relatorios_cruzados WHERE area_origem_id = 2 AND area_alvo_id = 1').get();
    if (!hasRule) {
      db.prepare('INSERT OR IGNORE INTO area_relatorios_cruzados (area_origem_id, area_alvo_id) VALUES (2, 1)').run();
    }
  } catch {}

  // 3. Garante empresas_unidades, centros de custo, usuários, usuario_areas, usuario_modulos, logs_acesso
  db.exec(`
    CREATE TABLE IF NOT EXISTS empresas_unidades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT UNIQUE NOT NULL,
        nome TEXT NOT NULL,
        cnpj TEXT UNIQUE,
        endereco TEXT,
        cidade TEXT,
        uf TEXT,
        ativo INTEGER NOT NULL DEFAULT 1,
        criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_empresas_unidades_codigo ON empresas_unidades (codigo);
    CREATE INDEX IF NOT EXISTS idx_empresas_unidades_ativo ON empresas_unidades (ativo);

    CREATE TABLE IF NOT EXISTS centros_custo (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT UNIQUE NOT NULL,
        nome TEXT NOT NULL,
        departamento TEXT NOT NULL,
        responsavel TEXT NOT NULL,
        ativo INTEGER NOT NULL DEFAULT 1,
        criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_centros_custo_codigo ON centros_custo (codigo);
    CREATE INDEX IF NOT EXISTS idx_centros_custo_ativo ON centros_custo (ativo);

    CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT,
        nome TEXT NOT NULL,
        login TEXT UNIQUE NOT NULL,
        senha_hash TEXT NOT NULL,
        cpf TEXT,
        email TEXT,
        perfil TEXT NOT NULL CHECK (perfil IN ('admin', 'ti_dpo', 'almoxarife', 'requisitante')),
        cargo_nome TEXT,
        permissoes TEXT,
        centro_custo_id INTEGER REFERENCES centros_custo(id) ON DELETE SET NULL,
        ativo INTEGER NOT NULL DEFAULT 1,
        criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ultimo_acesso DATETIME
    );
    CREATE INDEX IF NOT EXISTS idx_usuarios_login ON usuarios (login);
    CREATE INDEX IF NOT EXISTS idx_usuarios_perfil ON usuarios (perfil);
    CREATE INDEX IF NOT EXISTS idx_usuarios_centro_custo ON usuarios (centro_custo_id);

    CREATE TABLE IF NOT EXISTS usuario_areas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        area_id INTEGER NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
        UNIQUE(usuario_id, area_id)
    );
    CREATE INDEX IF NOT EXISTS idx_user_areas_user ON usuario_areas (usuario_id);
    CREATE INDEX IF NOT EXISTS idx_user_areas_area ON usuario_areas (area_id);

    CREATE TABLE IF NOT EXISTS usuario_modulos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        modulo_chave TEXT NOT NULL,
        UNIQUE(usuario_id, modulo_chave)
    );
    CREATE INDEX IF NOT EXISTS idx_usuario_modulos_user ON usuario_modulos (usuario_id);
    CREATE INDEX IF NOT EXISTS idx_usuario_modulos_chave ON usuario_modulos (modulo_chave);

    CREATE TABLE IF NOT EXISTS logs_acesso (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER,
        login TEXT NOT NULL,
        nome TEXT,
        perfil TEXT,
        area_sigla TEXT,
        ip TEXT,
        acao TEXT NOT NULL DEFAULT 'login_sucesso',
        detalhes TEXT,
        data_hora DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_logs_acesso_data ON logs_acesso (data_hora);
    CREATE INDEX IF NOT EXISTS idx_logs_acesso_login ON logs_acesso (login);
  `);

  try {
    const empCount = (db.prepare('SELECT COUNT(*) as c FROM empresas_unidades').get() as any)?.c || 0;
    if (empCount === 0) {
      db.prepare(`
        INSERT INTO empresas_unidades (id, codigo, nome, ativo)
        VALUES (1, 'UNI-01', 'Unidade Principal / Hospital Central', 1)
      `).run();
    }
  } catch {}

  // Migra dados de usuários e centros de custo existentes do almoxarifado.db se central estiver vazio
  migrateLegacyUsersAndCentrosCusto(db);
}

function migrateLegacyUsersAndCentrosCusto(centralDb: DatabaseSync) {
  const userCount = (centralDb.prepare('SELECT count(*) as c FROM usuarios').get() as any).c;
  if (userCount > 0) return;

  const legacyDbPath = path.resolve(PROJECT_ROOT, 'almoxarifado.db');
  if (!fs.existsSync(legacyDbPath)) {
    // Insere usuário padrão admin se não existir almoxarifado.db
    centralDb.prepare(`
      INSERT INTO usuarios (id, codigo, nome, login, senha_hash, perfil, ativo)
      VALUES (1, 'USR-001', 'Administrador do Sistema', 'admin', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', 'admin', 1)
    `).run();
    centralDb.prepare('INSERT OR IGNORE INTO usuario_areas (usuario_id, area_id) VALUES (1, 1), (1, 2)').run();
    return;
  }

  try {
    const legacy = new DatabaseSync(legacyDbPath);
    legacy.exec('PRAGMA foreign_keys = OFF;');

    // Centros de custo
    try {
      const ccs = legacy.prepare('SELECT id, codigo, nome, departamento, responsavel, ativo, criado_em FROM centros_custo').all() as any[];
      const insCc = centralDb.prepare(`
        INSERT OR IGNORE INTO centros_custo (id, codigo, nome, departamento, responsavel, ativo, criado_em)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const cc of ccs) {
        insCc.run(cc.id, cc.codigo, cc.nome, cc.departamento, cc.responsavel, cc.ativo ?? 1, cc.criado_em || new Date().toISOString());
      }
    } catch {}

    // Usuários
    try {
      const users = legacy.prepare('SELECT id, codigo, nome, login, senha_hash, cpf, email, perfil, cargo_nome, permissoes, centro_custo_id, ativo, criado_em, ultimo_acesso FROM usuarios').all() as any[];
      const insUser = centralDb.prepare(`
        INSERT OR IGNORE INTO usuarios (id, codigo, nome, login, senha_hash, cpf, email, perfil, cargo_nome, permissoes, centro_custo_id, ativo, criado_em, ultimo_acesso)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const u of users) {
        insUser.run(
          u.id, u.codigo, u.nome, u.login, u.senha_hash,
          u.cpf, u.email, u.perfil || 'almoxarife',
          u.cargo_nome, u.permissoes, u.centro_custo_id,
          u.ativo ?? 1, u.criado_em || new Date().toISOString(), u.ultimo_acesso
        );

        // Vincula áreas: Admin e TI acessam ALM (1) e CAF (2); outros acessam ALM (1)
        if (u.perfil === 'admin' || u.perfil === 'ti_dpo' || u.id === 1 || u.login === 'admin') {
          centralDb.prepare('INSERT OR IGNORE INTO usuario_areas (usuario_id, area_id) VALUES (?, 1), (?, 2)').run(u.id, u.id);
        } else {
          centralDb.prepare('INSERT OR IGNORE INTO usuario_areas (usuario_id, area_id) VALUES (?, 1)').run(u.id);
        }
      }
    } catch {}

    // Módulos
    try {
      const mods = legacy.prepare('SELECT usuario_id, modulo_chave FROM usuario_modulos').all() as any[];
      const insMod = centralDb.prepare('INSERT OR IGNORE INTO usuario_modulos (usuario_id, modulo_chave) VALUES (?, ?)');
      for (const m of mods) {
        insMod.run(m.usuario_id, m.modulo_chave);
      }
    } catch {}

    legacy.close();
  } catch (err) {
    console.error('[DB] Erro ao migrar usuários para o banco central:', err);
  }
}

export function getAllActiveAreas(): Array<{
  id: number;
  sigla: string;
  nome: string;
  arquivo_db: string;
  descricao?: string;
  ativa: number;
}> {
  const central = getCentralDb();
  return central.prepare('SELECT id, sigla, nome, arquivo_db, descricao, ativa FROM areas WHERE ativa = 1 ORDER BY id ASC').all() as any[];
}

export function getAreaBySiglaOrId(siglaOrId: string | number): {
  id: number;
  sigla: string;
  nome: string;
  arquivo_db: string;
  descricao?: string;
  ativa: number;
} | null {
  const central = getCentralDb();
  let row: any;
  if (typeof siglaOrId === 'number' || !Number.isNaN(Number(siglaOrId))) {
    row = central.prepare('SELECT * FROM areas WHERE id = ?').get(Number(siglaOrId));
  }
  if (!row && typeof siglaOrId === 'string') {
    row = central.prepare('SELECT * FROM areas WHERE UPPER(sigla) = UPPER(?)').get(siglaOrId.trim());
  }
  return row || null;
}

/**
 * Obtém conexão com o banco de dados da área desejada.
 * Se readOnly for true, abre com PRAGMA query_only = ON;
 */
export function getAreaDb(siglaOrId: string | number, readOnly = false): DatabaseSync {
  const area = getAreaBySiglaOrId(siglaOrId) || {
    id: 1,
    sigla: 'ALM',
    nome: 'Almoxarifado',
    arquivo_db: 'almoxarifado.db',
    ativa: 1
  };

  const cacheKey = `${area.arquivo_db}:${readOnly ? 'ro' : 'rw'}`;
  let conn = areaDbConnections.get(cacheKey);
  if (conn) {
    return conn;
  }

  const dbFilePath = path.resolve(PROJECT_ROOT, area.arquivo_db);

  conn = new DatabaseSync(dbFilePath);
  conn.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');

  // Garante que a área possui todas as tabelas operacionais do schema_area.sql
  ensureAreaSchema(conn);

  // Sincroniza espelhos imediatamente
  syncMirrorsToArea(conn);

  if (readOnly) {
    conn.exec('PRAGMA query_only = ON;');
  }

  areaDbConnections.set(cacheKey, conn);
  return conn;
}

function ensureAreaSchema(areaDb: DatabaseSync) {
  try {
    // Executa schema_area.sql para garantir todas as tabelas (produtos, fornecedores, requisicoes, etc.)
    const schemaAreaSqlPath = path.resolve(PROJECT_ROOT, 'schema_area.sql');
    if (fs.existsSync(schemaAreaSqlPath)) {
      const sql = fs.readFileSync(schemaAreaSqlPath, 'utf-8');
      areaDb.exec(sql);
    }

    try {
      areaDb.exec('INSERT OR IGNORE INTO versao_schema (versao) VALUES (1);');
    } catch {}

    // Atualiza colunas em movimentacoes
    const movCols = new Set((areaDb.prepare("PRAGMA table_info('movimentacoes')").all() as Array<{ name: string }>).map((c) => c.name));
    if (!movCols.has('requisicao_id')) {
      areaDb.exec("ALTER TABLE movimentacoes ADD COLUMN requisicao_id INTEGER REFERENCES requisicoes(id) ON DELETE SET NULL;");
    }
    if (!movCols.has('consumo_id')) {
      areaDb.exec("ALTER TABLE movimentacoes ADD COLUMN consumo_id INTEGER REFERENCES consumos(id) ON DELETE SET NULL;");
    }

    // Atualiza colunas em itens_requisicao
    const itemReqCols = new Set((areaDb.prepare("PRAGMA table_info('itens_requisicao')").all() as Array<{ name: string }>).map((c) => c.name));
    if (!itemReqCols.has('lote_id')) {
      areaDb.exec("ALTER TABLE itens_requisicao ADD COLUMN lote_id INTEGER REFERENCES lotes_estoque(id) ON DELETE SET NULL;");
    }
    if (!itemReqCols.has('numero_lote')) {
      areaDb.exec("ALTER TABLE itens_requisicao ADD COLUMN numero_lote TEXT;");
    }
    if (!itemReqCols.has('data_validade')) {
      areaDb.exec("ALTER TABLE itens_requisicao ADD COLUMN data_validade DATE;");
    }
  } catch (err) {
    console.error('[DB] Erro ao assegurar schema da área:', err);
  }
}

/**
 * Sincroniza os espelhos de usuários, centros de custo e empresas/unidades do banco central para um banco de área
 */
export function syncMirrorsToArea(areaDb: DatabaseSync) {
  try {
    const central = getCentralDb();

    // 1. Centros de custo
    const ccs = central.prepare('SELECT id, codigo, nome, departamento, responsavel, ativo, criado_em FROM centros_custo').all() as any[];
    const insCc = areaDb.prepare(`
      INSERT OR REPLACE INTO centros_custo (id, codigo, nome, departamento, responsavel, ativo, criado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const c of ccs) {
      insCc.run(c.id, c.codigo, c.nome, c.departamento, c.responsavel, c.ativo ?? 1, c.criado_em || new Date().toISOString());
    }

    // 2. Usuários (sem senha_hash)
    const users = central.prepare('SELECT id, codigo, nome, login, cpf, email, perfil, cargo_nome, centro_custo_id, ativo, criado_em FROM usuarios').all() as any[];
    const insUser = areaDb.prepare(`
      INSERT OR REPLACE INTO usuarios (id, codigo, nome, login, senha_hash, cpf, email, perfil, cargo_nome, centro_custo_id, ativo, criado_em)
      VALUES (?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const u of users) {
      insUser.run(
        u.id, u.codigo, u.nome, u.login, u.cpf, u.email,
        u.perfil, u.cargo_nome, u.centro_custo_id,
        u.ativo ?? 1, u.criado_em || new Date().toISOString()
      );
    }

    // 3. Empresas / Unidades
    try {
      const emps = central.prepare('SELECT id, codigo, nome, cnpj, endereco, cidade, uf, ativo, criado_em FROM empresas_unidades').all() as any[];
      const insEmp = areaDb.prepare(`
        INSERT OR REPLACE INTO empresas_unidades (id, codigo, nome, cnpj, endereco, cidade, uf, ativo, criado_em)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const e of emps) {
        insEmp.run(e.id, e.codigo, e.nome, e.cnpj || null, e.endereco || null, e.cidade || null, e.uf || null, e.ativo ?? 1, e.criado_em || new Date().toISOString());
      }
    } catch {}
  } catch (err) {
    console.error('[DB Mirror] Erro ao sincronizar espelhos para área:', err);
  }
}

/**
 * Sincroniza espelhos para todos os bancos de áreas ativas
 */
export function syncMirrorsToAllAreas() {
  const areas = getAllActiveAreas();
  for (const a of areas) {
    try {
      const areaDb = getAreaDb(a.sigla);
      syncMirrorsToArea(areaDb);
    } catch (e) {
      console.error(`[DB Mirror] Falha ao sincronizar espelhos para área ${a.sigla}:`, e);
    }
  }
}

/**
 * Retorna o banco de dados da área atualmente ativa no contexto da requisição.
 * Se nenhum contexto estiver ativo, retorna o banco do Almoxarifado (ALM).
 */
export function getCurrentAreaDb(): DatabaseSync {
  const store = currentAreaStorage.getStore();
  if (store && store.db) {
    return store.db;
  }
  return getAreaDb('ALM');
}

/**
 * Proxy dinâmico para a conexão ativa da área.
 * Qualquer chamada a db.prepare(...), db.exec(...) irá automaticamente
 * operar no banco da área da requisição atual!
 */
export const db = new Proxy({} as DatabaseSync, {
  get(_target, prop) {
    const active = getCurrentAreaDb();
    const val = (active as any)[prop];
    if (typeof val === 'function') {
      return val.bind(active);
    }
    return val;
  }
});

export function runInAreaContext<T>(siglaOrId: string | number, fn: () => T): T {
  const area = getAreaBySiglaOrId(siglaOrId);
  if (!area) {
    throw new Error(`Área "${siglaOrId}" não encontrada.`);
  }
  const areaDb = getAreaDb(area.sigla);
  return currentAreaStorage.run({ areaSigla: area.sigla, areaId: area.id, db: areaDb }, fn);
}

/**
 * Cria ou recupera o lote padrão 'SEM LOTE' para produtos que não controlam validade
 */
export function getOrCreateSemLote(produtoId: number, fornecedorId?: number | null, customDb?: DatabaseSync) {
  const targetDb = customDb || db;
  let lote = targetDb.prepare(`
    SELECT * FROM lotes_estoque 
    WHERE produto_id = ? AND numero_lote = 'SEM LOTE'
  `).get(produtoId) as any;

  if (!lote) {
    const info = targetDb.prepare(`
      INSERT INTO lotes_estoque (
        produto_id, numero_lote, data_validade, quantidade_inicial, quantidade_atual,
        fornecedor_id, documento_referencia
      ) VALUES (?, 'SEM LOTE', NULL, 0, 0, ?, 'PADRAO-SEM-VALIDADE')
    `).run(produtoId, fornecedorId || null);
    lote = targetDb.prepare('SELECT * FROM lotes_estoque WHERE id = ?').get(info.lastInsertRowid);
  }
  return lote;
}

export function registrarLogAcesso(
  usuario: { id?: number; login: string; nome?: string; perfil?: string },
  ip = '127.0.0.1',
  acao = 'login_sucesso',
  detalhes?: string,
  areaSigla?: string
) {
  try {
    const central = getCentralDb();
    central.prepare(`
      INSERT INTO logs_acesso (usuario_id, login, nome, perfil, area_sigla, ip, acao, detalhes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      usuario.id || null,
      usuario.login,
      usuario.nome || null,
      usuario.perfil || null,
      areaSigla || null,
      ip,
      acao,
      detalhes || null
    );
  } catch (err) {
    console.error('[DB] Falha ao registrar log de acesso:', err);
  }
}

export function runInTransaction<T>(fn: () => T, targetDb?: DatabaseSync): T {
  const conn = targetDb || db;
  conn.exec('BEGIN TRANSACTION;');
  try {
    const res = fn();
    conn.exec('COMMIT;');
    return res;
  } catch (err) {
    conn.exec('ROLLBACK;');
    throw err;
  }
}

export function updateOverdueLoans(targetDb?: DatabaseSync) {
  const conn = targetDb || db;
  try {
    const hojeStr = new Date().toISOString().slice(0, 10);
    conn.prepare(`
      UPDATE emprestimos_institucionais
      SET status = 'em_atraso'
      WHERE status = 'ativo'
        AND data_prevista_devolucao IS NOT NULL
        AND date(data_prevista_devolucao) < date(?)
    `).run(hojeStr);
  } catch (_e) {}
}

export function getSchemaSql(): string {
  const schemaPath = path.resolve(PROJECT_ROOT, 'schema_area.sql');
  return fs.existsSync(schemaPath) ? fs.readFileSync(schemaPath, 'utf-8') : '';
}

export function getSeedSql(): string {
  const seedPath = path.resolve(PROJECT_ROOT, 'seed.sql');
  return fs.existsSync(seedPath) ? fs.readFileSync(seedPath, 'utf-8') : '';
}

export function clearAccessLogs() {
  const central = getCentralDb();
  central.exec('DELETE FROM logs_acesso;');
}

export function resetDatabase() {
  clearAccessLogs();
}

export function initDatabase() {
  getCentralDb();
  getAreaDb('ALM');
  getAreaDb('CAF');
  syncMirrorsToAllAreas();
}

// Inicialização automática ao carregar o módulo
try {
  initDatabase();
} catch (e) {
  console.error('[DB Init Error]:', e);
}

