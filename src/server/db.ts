/**
 * ============================================================================
 * ALMOXCONTROL - ARQUITETURA DE BANCO DE DADOS (MULTI-BANCO SQLITE)
 * ============================================================================
 * 
 * BANCO CENTRAL (sistema.db):
 *  - Autenticação e credenciais de acesso (senha_hash).
 *  - Tabela `usuarios` com todas as colunas: id, codigo, nome, login, senha_hash,
 *    cpf, email, perfil, cargo_nome, permissoes, centro_custo_id, empresa_id, ativo, criado_em, ultimo_acesso.
 *  - Tabela `usuario_modulos`: permissões modulares de acesso por usuário.
 *  - Tabela `areas`: definição de áreas operacionais ativas (ALM, CAF e dinâmicas).
 *  - Tabela `area_relatorios_cruzados`: permissões de leitura cruzada entre áreas.
 *  - Tabela `usuario_areas`: junção muitos-para-muitos definindo acesso a cada área.
 *  - Tabela `empresas_unidades` e `centros_custo`: cadastro unificado de setores e empresas.
 *  - Tabela `logs_acesso`: registro centralizado de auditoria de acessos e logins.
 * 
 * BANCOS DE ÁREA (almoxarifado.db, caf.db, etc.):
 *  - Catálogo de produtos, lotes, estoque físico e contábil.
 *  - Movimentações, notas fiscais, itens de notas, requisições, consumos,
 *    inventários, empréstimos, fornecedores e grupos.
 *  - Espelhos locais (somente leitura / integridade referencial):
 *    - `usuarios`: espelho completo (incluindo cargo_nome e permissoes), sem senha_hash.
 *    - `centros_custo`: espelho de setores.
 *    - `empresas_unidades`: espelho de unidades.
 *  - Colunas críticas garantidas:
 *    - `movimentacoes`: nota_fiscal_id, requisicao_id, consumo_id, emprestimo_institucional_id.
 *    - `itens_requisicao`: lote_id, numero_lote, data_validade, lotes_atendidos.
 */

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AsyncLocalStorage } from 'node:async_hooks';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, '../..');

// Diretório de banco de dados configurável via variável de ambiente DB_DIR
export const DB_DIR = process.env.DB_DIR ? path.resolve(process.env.DB_DIR) : PROJECT_ROOT;

// Cria o diretório de dados com permissão 0o775 se não existir
try {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true, mode: 0o775 });
  } else {
    fs.chmodSync(DB_DIR, 0o775);
  }
} catch {
  // Ignora se o sistema de arquivos não permitir chmod
}

/**
 * Resolve o caminho físico do arquivo SQLite
 */
export function resolveDbPath(filename: string): string {
  // Se SQLITE_DB_PATH foi definido e o arquivo for o almoxarifado.db, aceita como override
  if (filename === 'almoxarifado.db' && process.env.SQLITE_DB_PATH) {
    return path.resolve(process.env.SQLITE_DB_PATH);
  }
  return path.resolve(DB_DIR, filename);
}

export const CENTRAL_DB_PATH = resolveDbPath('sistema.db');
export const DB_PATH = resolveDbPath('almoxarifado.db');

export const currentAreaStorage = new AsyncLocalStorage<{
  areaSigla: string;
  areaId: number;
  db: DatabaseSync;
}>();

// Cache de conexões SQLite ativas por arquivo
let centralDbInstance: DatabaseSync | null = null;
const areaDbConnections = new Map<string, DatabaseSync>();

/**
 * Garante permissões adequadas (0o664) no arquivo .db e nos arquivos WAL/SHM associados,
 * e 0o775 no diretório pai.
 */
export function ensureFilePermissions(filePath: string) {
  try {
    const dir = path.dirname(filePath);
    if (fs.existsSync(dir)) {
      try { fs.chmodSync(dir, 0o775); } catch {}
    }
    const candidates = [filePath, `${filePath}-wal`, `${filePath}-shm`];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        try { fs.chmodSync(p, 0o664); } catch {}
      }
    }
  } catch {}
}

/**
 * Diagnóstico detalhado de erro de escrita SQLite (especialmente SQLITE_READONLY)
 */
export function diagnoseDbWriteError(actionName: string, dbPath: string, err: any) {
  const isReadonly = err?.message?.includes('readonly') || err?.message?.includes('SQLITE_READONLY');
  let diagInfo = `\n[DB DIAGNÓSTICO] Erro em "${actionName}" no banco "${dbPath}": ${err?.message}\n`;
  try {
    const processUid = process.getuid ? process.getuid() : 'N/A';
    const processGid = process.getgid ? process.getgid() : 'N/A';
    const processUser = process.env.USER || process.env.USERNAME || 'desconhecido';
    diagInfo += `  Processo Node: UID=${processUid}, GID=${processGid}, Usuário=${processUser}\n`;

    const dir = path.dirname(dbPath);
    if (fs.existsSync(dir)) {
      const dStat = fs.statSync(dir);
      diagInfo += `  Diretório: ${dir} (Permissões: ${dStat.mode.toString(8)}, UID: ${dStat.uid}, GID: ${dStat.gid})\n`;
    } else {
      diagInfo += `  Diretório: ${dir} NÃO EXISTE!\n`;
    }

    if (fs.existsSync(dbPath)) {
      const fStat = fs.statSync(dbPath);
      diagInfo += `  Arquivo DB: ${dbPath} (Permissões: ${fStat.mode.toString(8)}, UID: ${fStat.uid}, GID: ${fStat.gid})\n`;
    } else {
      diagInfo += `  Arquivo DB: ${dbPath} NÃO EXISTE\n`;
    }

    const wal = `${dbPath}-wal`;
    if (fs.existsSync(wal)) {
      const wStat = fs.statSync(wal);
      diagInfo += `  Arquivo WAL: ${wal} (Permissões: ${wStat.mode.toString(8)}, UID: ${wStat.uid}, GID: ${wStat.gid})\n`;
    }
    const shm = `${dbPath}-shm`;
    if (fs.existsSync(shm)) {
      const sStat = fs.statSync(shm);
      diagInfo += `  Arquivo SHM: ${shm} (Permissões: ${sStat.mode.toString(8)}, UID: ${sStat.uid}, GID: ${sStat.gid})\n`;
    }

    if (isReadonly) {
      diagInfo += `  CAUSA COMUM: SQLite precisa de permissão de escrita (664) no arquivo .db E na pasta (775) para criar arquivos temporários -wal e -shm.\n`;
      diagInfo += `  SOLUÇÃO UBUNTU/PM2: execute 'sudo chown -R almoxapp:almoxapp ${dir} && sudo chmod -R 775 ${dir}' e adicione 'umask: "002"' no ecosystem.config.cjs.\n`;
    }
  } catch (e: any) {
    diagInfo += `  Falha ao inspecionar estatísticas de arquivo: ${e?.message}\n`;
  }
  console.error(diagInfo);
}

/**
 * Obtém ou cria a conexão com o banco central (sistema.db)
 */
export function getCentralDb(): DatabaseSync {
  if (!centralDbInstance) {
    ensureFilePermissions(CENTRAL_DB_PATH);
    centralDbInstance = new DatabaseSync(CENTRAL_DB_PATH);
    (centralDbInstance as any).__dbPath = CENTRAL_DB_PATH;

    centralDbInstance.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
    ensureFilePermissions(CENTRAL_DB_PATH);

    // Aplica schema base e migrações idempotentes
    migrateCentralDb(centralDbInstance, CENTRAL_DB_PATH);
  }
  return centralDbInstance;
}

/**
 * Migração Idempotente do Banco Central (sistema.db)
 */
function migrateCentralDb(db: DatabaseSync, dbFilePath: string) {
  let appliedMigrations = 0;

  // 1. Garante tabelas base via schema_central.sql se presente
  const schemaPath = path.resolve(PROJECT_ROOT, 'schema_central.sql');
  if (fs.existsSync(schemaPath)) {
    try {
      const sql = fs.readFileSync(schemaPath, 'utf-8');
      db.exec(sql);
    } catch (e: any) {
      console.warn('[DB Central] Aviso ao aplicar schema_central.sql:', e.message);
    }
  }

  // 2. Garante tabela de áreas
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
    appliedMigrations++;
  }

  const caf = db.prepare('SELECT id FROM areas WHERE sigla = ?').get('CAF') as any;
  if (!caf) {
    db.prepare(`
      INSERT INTO areas (id, sigla, nome, arquivo_db, descricao, ativa)
      VALUES (2, 'CAF', 'CAF', 'caf.db', 'Central de Abastecimento Farmacêutico (Medicamentos)', 1)
    `).run();
    appliedMigrations++;
  }

  // 3. Garante tabela de relatórios cruzados
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

  try {
    const hasRule = db.prepare('SELECT id FROM area_relatorios_cruzados WHERE area_origem_id = 2 AND area_alvo_id = 1').get();
    if (!hasRule) {
      db.prepare('INSERT OR IGNORE INTO area_relatorios_cruzados (area_origem_id, area_alvo_id) VALUES (2, 1)').run();
    }
  } catch {}

  // 4. Garante empresas_unidades, centros_custo, usuarios, usuario_areas, usuario_modulos, logs_acesso
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

  // 5. Comparação e adição idempotente de colunas via PRAGMA table_info
  const userCols = new Set((db.prepare("PRAGMA table_info('usuarios')").all() as Array<{ name: string }>).map((c) => c.name));
  if (!userCols.has('permissoes')) {
    db.exec('ALTER TABLE usuarios ADD COLUMN permissoes TEXT;');
    appliedMigrations++;
  }
  if (!userCols.has('cargo_nome')) {
    db.exec('ALTER TABLE usuarios ADD COLUMN cargo_nome TEXT;');
    appliedMigrations++;
  }
  if (!userCols.has('empresa_id')) {
    db.exec('ALTER TABLE usuarios ADD COLUMN empresa_id INTEGER REFERENCES empresas_unidades(id) ON DELETE SET NULL;');
    appliedMigrations++;
  }
  if (!userCols.has('area_id')) {
    db.exec('ALTER TABLE usuarios ADD COLUMN area_id INTEGER REFERENCES areas(id) ON DELETE SET NULL;');
    appliedMigrations++;
  }
  if (!userCols.has('ultimo_acesso')) {
    db.exec('ALTER TABLE usuarios ADD COLUMN ultimo_acesso DATETIME;');
    appliedMigrations++;
  }

  const ccCols = new Set((db.prepare("PRAGMA table_info('centros_custo')").all() as Array<{ name: string }>).map((c) => c.name));
  if (!ccCols.has('empresa_id')) {
    db.exec('ALTER TABLE centros_custo ADD COLUMN empresa_id INTEGER REFERENCES empresas_unidades(id) ON DELETE SET NULL;');
    appliedMigrations++;
  }

  // Garante que centros_custo existentes nos bancos de área estejam no banco central
  try {
    const ccCount = (db.prepare('SELECT COUNT(*) as c FROM centros_custo').get() as any)?.c || 0;
    if (ccCount === 0) {
      const almPath = path.join(DB_DIR, 'almoxarifado.db');
      if (fs.existsSync(almPath)) {
        const areaDb = new DatabaseSync(almPath);
        const rows = areaDb.prepare("SELECT * FROM centros_custo").all() as any[];
        for (const row of rows) {
          db.prepare(`
            INSERT OR IGNORE INTO centros_custo (id, codigo, nome, departamento, responsavel, ativo)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(row.id, row.codigo, row.nome, row.departamento, row.responsavel, row.ativo ?? 1);
        }
      }
    }
  } catch {}

  // Garante unidade padrão se vazia
  try {
    const empCount = (db.prepare('SELECT COUNT(*) as c FROM empresas_unidades').get() as any)?.c || 0;
    if (empCount === 0) {
      db.prepare(`
        INSERT INTO empresas_unidades (id, codigo, nome, ativo)
        VALUES (1, 'UNI-01', 'Unidade Principal / Hospital Central', 1)
      `).run();
    }
  } catch {}

  // Garante que o usuário admin exista, esteja ativo e tenha vínculo com as áreas 1 e 2
  try {
    const adminUser = db.prepare("SELECT id, senha_hash, ativo FROM usuarios WHERE login = 'admin' OR id = 1").get() as any;
    if (!adminUser) {
      db.prepare(`
        INSERT INTO usuarios (id, codigo, nome, login, senha_hash, perfil, cargo_nome, permissoes, ativo)
        VALUES (1, 'USR-001', 'Administrador do Sistema', 'admin', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', 'admin', 'admin', '[]', 1)
      `).run();
      db.prepare('INSERT OR IGNORE INTO usuario_areas (usuario_id, area_id) VALUES (1, 1), (1, 2)').run();
      appliedMigrations++;
    } else {
      if (adminUser.ativo !== 1) {
        db.prepare("UPDATE usuarios SET ativo = 1 WHERE id = ?").run(adminUser.id);
      }
      if (!adminUser.senha_hash) {
        db.prepare("UPDATE usuarios SET senha_hash = '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9' WHERE id = ?").run(adminUser.id);
      }
      db.prepare('INSERT OR IGNORE INTO usuario_areas (usuario_id, area_id) VALUES (?, 1), (?, 2)').run(adminUser.id, adminUser.id);
    }
  } catch (err: any) {
    console.warn('[DB Central] Aviso ao verificar usuário admin:', err.message);
  }

  // 6. Garante tabela central de fornecedores e entidades (compartilhada entre todas as áreas)
  db.exec(`
    CREATE TABLE IF NOT EXISTS fornecedores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT UNIQUE NOT NULL,
        razao_social TEXT NOT NULL,
        nome_fantasia TEXT,
        cnpj TEXT UNIQUE,
        tipo_entidade TEXT NOT NULL DEFAULT 'fornecedor_comercial' CHECK (tipo_entidade IN ('fornecedor_comercial', 'entidade_parceira')),
        inscricao_estadual TEXT,
        telefone TEXT,
        email TEXT,
        contato_responsavel TEXT,
        endereco TEXT,
        cidade TEXT,
        uf TEXT,
        observacoes TEXT,
        ativo INTEGER NOT NULL DEFAULT 1,
        criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_fornecedores_codigo ON fornecedores (codigo);
    CREATE INDEX IF NOT EXISTS idx_fornecedores_cnpj ON fornecedores (cnpj);
    CREATE INDEX IF NOT EXISTS idx_fornecedores_tipo ON fornecedores (tipo_entidade);
    CREATE INDEX IF NOT EXISTS idx_fornecedores_ativo ON fornecedores (ativo);
  `);

  // Migração inicial dos fornecedores existentes em almoxarifado.db para o banco central
  try {
    const centralFornCount = (db.prepare('SELECT COUNT(*) as c FROM fornecedores').get() as any)?.c || 0;
    if (centralFornCount === 0) {
      const almPath = resolveDbPath('almoxarifado.db');
      if (fs.existsSync(almPath)) {
        const almConn = new DatabaseSync(almPath);
        try {
          const rows = almConn.prepare(`
            SELECT id, codigo, razao_social, nome_fantasia, cnpj, tipo_entidade, inscricao_estadual,
                   telefone, email, contato_responsavel, endereco, cidade, uf, observacoes, ativo, criado_em
            FROM fornecedores
          `).all() as any[];
          if (rows && rows.length > 0) {
            const insForn = db.prepare(`
              INSERT OR REPLACE INTO fornecedores (
                id, codigo, razao_social, nome_fantasia, cnpj, tipo_entidade, inscricao_estadual,
                telefone, email, contato_responsavel, endereco, cidade, uf, observacoes, ativo, criado_em
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            for (const r of rows) {
              insForn.run(
                r.id, r.codigo, r.razao_social, r.nome_fantasia || null, r.cnpj || null,
                r.tipo_entidade || 'fornecedor_comercial', r.inscricao_estadual || null,
                r.telefone || null, r.email || null, r.contato_responsavel || null,
                r.endereco || null, r.cidade || null, r.uf || null, r.observacoes || null,
                r.ativo ?? 1, r.criado_em || new Date().toISOString()
              );
            }
            console.log(`[DB Central] ${rows.length} fornecedores migrados para o banco central compartilhado.`);
            appliedMigrations++;
          }
        } finally {
          try { almConn.close(); } catch {}
        }
      }
    }
  } catch (err: any) {
    console.warn('[DB Central] Aviso ao migrar fornecedores existentes:', err.message);
  }

  // Atualiza user_version
  const currVer = (db.prepare('PRAGMA user_version;').get() as any)?.user_version || 0;
  if (currVer < 3) {
    db.exec('PRAGMA user_version = 3;');
  }

  ensureFilePermissions(dbFilePath);

  // Diagnóstico
  const finalVer = (db.prepare('PRAGMA user_version;').get() as any)?.user_version || 0;
  const jMode = (db.prepare('PRAGMA journal_mode;').get() as any)?.journal_mode;
  console.log(`[DB Central] Conectado: ${dbFilePath} | user_version: ${finalVer} | journal_mode: ${jMode} | Migrações aplicadas: ${appliedMigrations}`);
}

/**
 * Obtém todas as áreas ativas do sistema
 */
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

/**
 * Busca uma área por sigla ou ID no banco central
 */
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
 * Utiliza conexão única por arquivo para evitar conflitos de bloqueio SQLite.
 */
export function getAreaDb(siglaOrId: string | number, _readOnly = false): DatabaseSync {
  const area = getAreaBySiglaOrId(siglaOrId) || {
    id: 1,
    sigla: 'ALM',
    nome: 'Almoxarifado',
    arquivo_db: 'almoxarifado.db',
    ativa: 1
  };

  const cacheKey = area.arquivo_db;
  let conn = areaDbConnections.get(cacheKey);
  if (conn) {
    return conn;
  }

  const dbFilePath = resolveDbPath(area.arquivo_db);
  ensureFilePermissions(dbFilePath);

  conn = new DatabaseSync(dbFilePath);
  (conn as any).__dbPath = dbFilePath;
  (conn as any).__areaSigla = area.sigla;

  conn.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  ensureFilePermissions(dbFilePath);

  // Garante que a área possui todas as tabelas operacionais e colunas atualizadas
  migrateAreaDb(conn, area.sigla, dbFilePath);

  // Sincroniza espelhos imediatamente
  syncMirrorsToArea(conn);

  areaDbConnections.set(cacheKey, conn);
  return conn;
}

/**
 * Migração Idempotente do Banco de Área (almoxarifado.db, caf.db, etc.)
 */
function migrateAreaDb(areaDb: DatabaseSync, areaSigla: string, dbFilePath: string) {
  let appliedMigrations = 0;

  try {
    // 1. Executa schema_area.sql para criar tabelas ausentes
    const schemaAreaSqlPath = path.resolve(PROJECT_ROOT, 'schema_area.sql');
    if (fs.existsSync(schemaAreaSqlPath)) {
      const sql = fs.readFileSync(schemaAreaSqlPath, 'utf-8');
      try {
        areaDb.exec(sql);
      } catch (e: any) {
        console.warn(`[DB Área ${areaSigla}] Aviso ao executar schema_area.sql:`, e.message);
      }
    }

    // 2. Garante tabela versao_schema
    areaDb.exec(`
      CREATE TABLE IF NOT EXISTS versao_schema (
          versao INTEGER PRIMARY KEY,
          atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Garante tabela usuario_modulos no banco local caso consultas façam join
    areaDb.exec(`
      CREATE TABLE IF NOT EXISTS usuario_modulos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
          modulo_chave TEXT NOT NULL,
          UNIQUE(usuario_id, modulo_chave)
      );
      CREATE INDEX IF NOT EXISTS idx_usuario_modulos_user ON usuario_modulos (usuario_id);
    `);

    // 4. Verificação e adição idempotente de colunas na tabela 'usuarios'
    const userCols = new Set((areaDb.prepare("PRAGMA table_info('usuarios')").all() as Array<{ name: string }>).map((c) => c.name));
    if (!userCols.has('permissoes')) {
      areaDb.exec('ALTER TABLE usuarios ADD COLUMN permissoes TEXT;');
      appliedMigrations++;
    }
    if (!userCols.has('cargo_nome')) {
      areaDb.exec('ALTER TABLE usuarios ADD COLUMN cargo_nome TEXT;');
      appliedMigrations++;
    }
    if (!userCols.has('empresa_id')) {
      areaDb.exec('ALTER TABLE usuarios ADD COLUMN empresa_id INTEGER REFERENCES empresas_unidades(id) ON DELETE SET NULL;');
      appliedMigrations++;
    }
    if (!userCols.has('centro_custo_id')) {
      areaDb.exec('ALTER TABLE usuarios ADD COLUMN centro_custo_id INTEGER REFERENCES centros_custo(id) ON DELETE SET NULL;');
      appliedMigrations++;
    }
    if (!userCols.has('ultimo_acesso')) {
      areaDb.exec('ALTER TABLE usuarios ADD COLUMN ultimo_acesso DATETIME;');
      appliedMigrations++;
    }

    // 5. Verificação e adição idempotente de colunas na tabela 'movimentacoes'
    const movCols = new Set((areaDb.prepare("PRAGMA table_info('movimentacoes')").all() as Array<{ name: string }>).map((c) => c.name));
    if (!movCols.has('nota_fiscal_id')) {
      areaDb.exec('ALTER TABLE movimentacoes ADD COLUMN nota_fiscal_id INTEGER REFERENCES notas_fiscais(id) ON DELETE SET NULL;');
      appliedMigrations++;
    }
    if (!movCols.has('requisicao_id')) {
      areaDb.exec('ALTER TABLE movimentacoes ADD COLUMN requisicao_id INTEGER REFERENCES requisicoes(id) ON DELETE SET NULL;');
      appliedMigrations++;
    }
    if (!movCols.has('consumo_id')) {
      areaDb.exec('ALTER TABLE movimentacoes ADD COLUMN consumo_id INTEGER REFERENCES consumos(id) ON DELETE SET NULL;');
      appliedMigrations++;
    }
    if (!movCols.has('emprestimo_institucional_id')) {
      areaDb.exec('ALTER TABLE movimentacoes ADD COLUMN emprestimo_institucional_id INTEGER REFERENCES emprestimos_institucionais(id) ON DELETE SET NULL;');
      appliedMigrations++;
    }
    if (!movCols.has('marca')) {
      areaDb.exec('ALTER TABLE movimentacoes ADD COLUMN marca TEXT;');
      appliedMigrations++;
    }
    if (!movCols.has('nomenclatura_fornecedor')) {
      areaDb.exec('ALTER TABLE movimentacoes ADD COLUMN nomenclatura_fornecedor TEXT;');
      appliedMigrations++;
    }
    if (!movCols.has('valor_unitario')) {
      areaDb.exec('ALTER TABLE movimentacoes ADD COLUMN valor_unitario REAL;');
      appliedMigrations++;
    }
    if (!movCols.has('documento_referencia')) {
      areaDb.exec('ALTER TABLE movimentacoes ADD COLUMN documento_referencia TEXT;');
      appliedMigrations++;
    }
    if (!movCols.has('numero_lote')) {
      areaDb.exec('ALTER TABLE movimentacoes ADD COLUMN numero_lote TEXT;');
      appliedMigrations++;
    }
    if (!movCols.has('data_validade')) {
      areaDb.exec('ALTER TABLE movimentacoes ADD COLUMN data_validade DATE;');
      appliedMigrations++;
    }

    // 6. Verificação e adição idempotente de colunas na tabela 'itens_requisicao'
    const itemReqCols = new Set((areaDb.prepare("PRAGMA table_info('itens_requisicao')").all() as Array<{ name: string }>).map((c) => c.name));
    if (!itemReqCols.has('lote_id')) {
      areaDb.exec('ALTER TABLE itens_requisicao ADD COLUMN lote_id INTEGER REFERENCES lotes_estoque(id) ON DELETE SET NULL;');
      appliedMigrations++;
    }
    if (!itemReqCols.has('numero_lote')) {
      areaDb.exec('ALTER TABLE itens_requisicao ADD COLUMN numero_lote TEXT;');
      appliedMigrations++;
    }
    if (!itemReqCols.has('data_validade')) {
      areaDb.exec('ALTER TABLE itens_requisicao ADD COLUMN data_validade DATE;');
      appliedMigrations++;
    }
    if (!itemReqCols.has('lotes_atendidos')) {
      areaDb.exec('ALTER TABLE itens_requisicao ADD COLUMN lotes_atendidos TEXT;');
      appliedMigrations++;
    }
    if (!itemReqCols.has('motivo_decisao')) {
      areaDb.exec('ALTER TABLE itens_requisicao ADD COLUMN motivo_decisao TEXT;');
      appliedMigrations++;
    }

    // 7. Verificação e adição de colunas em produtos
    const prodCols = new Set((areaDb.prepare("PRAGMA table_info('produtos')").all() as Array<{ name: string }>).map((c) => c.name));
    if (!prodCols.has('custo_unitario')) {
      areaDb.exec('ALTER TABLE produtos ADD COLUMN custo_unitario REAL NOT NULL DEFAULT 0;');
      appliedMigrations++;
    }
    if (!prodCols.has('localizacao')) {
      areaDb.exec('ALTER TABLE produtos ADD COLUMN localizacao TEXT;');
      appliedMigrations++;
    }

    // 8. Verificação e adição de colunas em centros_custo
    const ccCols = new Set((areaDb.prepare("PRAGMA table_info('centros_custo')").all() as Array<{ name: string }>).map((c) => c.name));
    if (!ccCols.has('empresa_id')) {
      areaDb.exec('ALTER TABLE centros_custo ADD COLUMN empresa_id INTEGER REFERENCES empresas_unidades(id) ON DELETE SET NULL;');
      appliedMigrations++;
    }

    // 9. Garante tabelas de inventário do estoque
    areaDb.exec(`
      CREATE TABLE IF NOT EXISTS inventarios_estoque (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          codigo TEXT UNIQUE NOT NULL,
          area_id INTEGER NOT NULL DEFAULT 1 REFERENCES empresas_unidades(id),
          data DATE NOT NULL,
          hora TIME NOT NULL,
          empresa_id INTEGER REFERENCES empresas_unidades(id) ON DELETE SET NULL,
          centro_custo_id INTEGER NOT NULL REFERENCES centros_custo(id),
          centro_custo_nome TEXT,
          centro_custo_codigo TEXT,
          zera_por_lote INTEGER DEFAULT 0,
          zera_nao_listados INTEGER DEFAULT 0,
          observacao TEXT,
          finalizado INTEGER DEFAULT 0,
          usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
          usuario_nome TEXT,
          criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS itens_inventario (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          inventario_id INTEGER NOT NULL REFERENCES inventarios_estoque(id) ON DELETE CASCADE,
          produto_id INTEGER NOT NULL REFERENCES produtos(id),
          lote_id INTEGER REFERENCES lotes_estoque(id) ON DELETE SET NULL,
          numero_lote TEXT,
          data_validade DATE,
          quantidade_sistema REAL NOT NULL DEFAULT 0,
          quantidade_fisica REAL NOT NULL DEFAULT 0,
          diferenca REAL NOT NULL DEFAULT 0
      );
    `);

    // Verificação e adição idempotente de colunas na tabela 'inventarios_estoque'
    const invCols = new Set((areaDb.prepare("PRAGMA table_info('inventarios_estoque')").all() as Array<{ name: string }>).map((c) => c.name));
    if (!invCols.has('empresa_id')) {
      areaDb.exec('ALTER TABLE inventarios_estoque ADD COLUMN empresa_id INTEGER REFERENCES empresas_unidades(id) ON DELETE SET NULL;');
      appliedMigrations++;
    }
    if (!invCols.has('area_id')) {
      areaDb.exec('ALTER TABLE inventarios_estoque ADD COLUMN area_id INTEGER DEFAULT 1;');
      appliedMigrations++;
    }
    if (!invCols.has('centro_custo_nome')) {
      areaDb.exec('ALTER TABLE inventarios_estoque ADD COLUMN centro_custo_nome TEXT;');
      appliedMigrations++;
    }
    if (!invCols.has('centro_custo_codigo')) {
      areaDb.exec('ALTER TABLE inventarios_estoque ADD COLUMN centro_custo_codigo TEXT;');
      appliedMigrations++;
    }
    if (!invCols.has('usuario_nome')) {
      areaDb.exec('ALTER TABLE inventarios_estoque ADD COLUMN usuario_nome TEXT;');
      appliedMigrations++;
    }
    if (!invCols.has('observacao')) {
      areaDb.exec('ALTER TABLE inventarios_estoque ADD COLUMN observacao TEXT;');
      appliedMigrations++;
    }
    if (!invCols.has('zera_por_lote')) {
      areaDb.exec('ALTER TABLE inventarios_estoque ADD COLUMN zera_por_lote INTEGER DEFAULT 0;');
      appliedMigrations++;
    }
    if (!invCols.has('zera_nao_listados')) {
      areaDb.exec('ALTER TABLE inventarios_estoque ADD COLUMN zera_nao_listados INTEGER DEFAULT 0;');
      appliedMigrations++;
    }
    if (!invCols.has('finalizado')) {
      areaDb.exec('ALTER TABLE inventarios_estoque ADD COLUMN finalizado INTEGER DEFAULT 0;');
      appliedMigrations++;
    }

    // 10. Verificação e adição idempotente de colunas na tabela 'itens_inventario'
    const itemInvCols = new Set((areaDb.prepare("PRAGMA table_info('itens_inventario')").all() as Array<{ name: string }>).map((c) => c.name));
    if (!itemInvCols.has('lote_id')) {
      areaDb.exec('ALTER TABLE itens_inventario ADD COLUMN lote_id INTEGER REFERENCES lotes_estoque(id) ON DELETE SET NULL;');
      appliedMigrations++;
    }
    if (!itemInvCols.has('numero_lote')) {
      areaDb.exec('ALTER TABLE itens_inventario ADD COLUMN numero_lote TEXT;');
      appliedMigrations++;
    }
    if (!itemInvCols.has('data_validade')) {
      areaDb.exec('ALTER TABLE itens_inventario ADD COLUMN data_validade DATE;');
      appliedMigrations++;
    }
    if (!itemInvCols.has('quantidade_sistema')) {
      areaDb.exec('ALTER TABLE itens_inventario ADD COLUMN quantidade_sistema REAL NOT NULL DEFAULT 0;');
      appliedMigrations++;
    }
    if (!itemInvCols.has('quantidade_fisica')) {
      areaDb.exec('ALTER TABLE itens_inventario ADD COLUMN quantidade_fisica REAL NOT NULL DEFAULT 0;');
      appliedMigrations++;
    }
    if (!itemInvCols.has('diferenca')) {
      areaDb.exec('ALTER TABLE itens_inventario ADD COLUMN diferenca REAL NOT NULL DEFAULT 0;');
      appliedMigrations++;
    }

    // 11. Índices de performance essenciais (Kardex, Notas Fiscais, Movimentações e Inventários)
    areaDb.exec(`
      CREATE INDEX IF NOT EXISTS idx_movimentacoes_prod_data ON movimentacoes (produto_id, data_movimentacao);
      CREATE INDEX IF NOT EXISTS idx_movimentacoes_nf ON movimentacoes (nota_fiscal_id);
      CREATE INDEX IF NOT EXISTS idx_movimentacoes_req ON movimentacoes (requisicao_id);
      CREATE INDEX IF NOT EXISTS idx_movimentacoes_cons ON movimentacoes (consumo_id);
      CREATE INDEX IF NOT EXISTS idx_itens_req_lote ON itens_requisicao (lote_id);
      CREATE INDEX IF NOT EXISTS idx_inventarios_codigo ON inventarios_estoque (codigo);
      CREATE INDEX IF NOT EXISTS idx_inventarios_empresa ON inventarios_estoque (empresa_id);
      CREATE INDEX IF NOT EXISTS idx_inventarios_area ON inventarios_estoque (area_id);
      CREATE INDEX IF NOT EXISTS idx_inventarios_data ON inventarios_estoque (data);
      CREATE INDEX IF NOT EXISTS idx_inventarios_centro_custo ON inventarios_estoque (centro_custo_id);
      CREATE INDEX IF NOT EXISTS idx_inventarios_finalizado ON inventarios_estoque (finalizado);
      CREATE INDEX IF NOT EXISTS idx_itens_inv_inventario ON itens_inventario (inventario_id);
      CREATE INDEX IF NOT EXISTS idx_itens_inv_produto ON itens_inventario (produto_id);
      CREATE INDEX IF NOT EXISTS idx_itens_inv_lote ON itens_inventario (lote_id);
    `);

    // 12. Atualiza user_version
    const currVer = (areaDb.prepare('PRAGMA user_version;').get() as any)?.user_version || 0;
    if (currVer < 3) {
      areaDb.exec('PRAGMA user_version = 3;');
    }
    try {
      areaDb.exec('INSERT OR IGNORE INTO versao_schema (versao) VALUES (3);');
      areaDb.exec('UPDATE versao_schema SET versao = MAX(versao, 3);');
    } catch {}

    ensureFilePermissions(dbFilePath);

    const finalVer = (areaDb.prepare('PRAGMA user_version;').get() as any)?.user_version || 0;
    const jMode = (areaDb.prepare('PRAGMA journal_mode;').get() as any)?.journal_mode;
    console.log(`[DB Área ${areaSigla}] Conectado: ${dbFilePath} | user_version: ${finalVer} | journal_mode: ${jMode} | Migrações aplicadas: ${appliedMigrations}`);
  } catch (err: any) {
    diagnoseDbWriteError(`migrateAreaDb(${areaSigla})`, dbFilePath, err);
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

    // 2. Usuários (espelho completo para consultas e integridade, sem senha_hash)
    const users = central.prepare(`
      SELECT id, codigo, nome, login, cpf, email, perfil, cargo_nome, permissoes, centro_custo_id, ativo, criado_em, ultimo_acesso
      FROM usuarios
    `).all() as any[];
    const insUser = areaDb.prepare(`
      INSERT OR REPLACE INTO usuarios (id, codigo, nome, login, senha_hash, cpf, email, perfil, cargo_nome, permissoes, centro_custo_id, ativo, criado_em, ultimo_acesso)
      VALUES (?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const u of users) {
      insUser.run(
        u.id, u.codigo, u.nome, u.login, u.cpf, u.email,
        u.perfil, u.cargo_nome, u.permissoes, u.centro_custo_id,
        u.ativo ?? 1, u.criado_em || new Date().toISOString(), u.ultimo_acesso
      );
    }

    // 3. Módulos do usuário
    try {
      const mods = central.prepare('SELECT usuario_id, modulo_chave FROM usuario_modulos').all() as any[];
      const insMod = areaDb.prepare('INSERT OR IGNORE INTO usuario_modulos (usuario_id, modulo_chave) VALUES (?, ?)');
      for (const m of mods) {
        insMod.run(m.usuario_id, m.modulo_chave);
      }
    } catch {}

    // 4. Empresas / Unidades
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

    // 5. Fornecedores e Entidades Parceiras (Compartilhados globalmente em todas as áreas)
    try {
      const forns = central.prepare(`
        SELECT id, codigo, razao_social, nome_fantasia, cnpj, tipo_entidade, inscricao_estadual,
               telefone, email, contato_responsavel, endereco, cidade, uf, observacoes, ativo, criado_em
        FROM fornecedores
      `).all() as any[];

      const insForn = areaDb.prepare(`
        INSERT OR REPLACE INTO fornecedores (
          id, codigo, razao_social, nome_fantasia, cnpj, tipo_entidade, inscricao_estadual,
          telefone, email, contato_responsavel, endereco, cidade, uf, observacoes, ativo, criado_em
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const f of forns) {
        insForn.run(
          f.id,
          f.codigo,
          f.razao_social,
          f.nome_fantasia || null,
          f.cnpj || null,
          f.tipo_entidade || 'fornecedor_comercial',
          f.inscricao_estadual || null,
          f.telefone || null,
          f.email || null,
          f.contato_responsavel || null,
          f.endereco || null,
          f.cidade || null,
          f.uf || null,
          f.observacoes || null,
          f.ativo ?? 1,
          f.criado_em || new Date().toISOString()
        );
      }

      // Sincroniza também a tabela espelho secundária 'fornecedores_entidades' se existir na área
      try {
        const insFornEnt = areaDb.prepare(`
          INSERT OR REPLACE INTO fornecedores_entidades (
            id, codigo, razao_social, nome_fantasia, cnpj, tipo_entidade, inscricao_estadual,
            telefone, email, contato_responsavel, endereco, cidade, uf, observacoes, ativo
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const f of forns) {
          insFornEnt.run(
            f.id,
            f.codigo,
            f.razao_social,
            f.nome_fantasia || null,
            f.cnpj || null,
            f.tipo_entidade || 'fornecedor_comercial',
            f.inscricao_estadual || null,
            f.telefone || null,
            f.email || null,
            f.contato_responsavel || null,
            f.endereco || null,
            f.cidade || null,
            f.uf || null,
            f.observacoes || null,
            f.ativo ?? 1
          );
        }
      } catch {}
    } catch (e: any) {
      console.warn('[DB Mirror] Aviso ao sincronizar fornecedores:', e.message);
    }
  } catch (err: any) {
    const dbPath = (areaDb as any).__dbPath || 'area.db';
    diagnoseDbWriteError('syncMirrorsToArea', dbPath, err);
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
    } catch (e: any) {
      console.error(`[DB Mirror] Falha ao sincronizar espelhos para área ${a.sigla}:`, e.message);
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
  } catch (err: any) {
    console.error('[DB] Falha ao registrar log de acesso:', err.message);
  }
}

/**
 * Executa uma operação em transação atômica SQLite (BEGIN/COMMIT/ROLLBACK)
 * com captura e diagnóstico detalhado em caso de erro de escrita/permissão.
 */
export function runInTransaction<T>(fn: () => T, targetDb?: DatabaseSync): T {
  const conn = targetDb || db;
  const dbPath = (conn as any).__dbPath || 'banco_ativo';
  conn.exec('BEGIN TRANSACTION;');
  try {
    const res = fn();
    conn.exec('COMMIT;');
    return res;
  } catch (err: any) {
    try {
      conn.exec('ROLLBACK;');
    } catch {}
    diagnoseDbWriteError('runInTransaction', dbPath, err);
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
  } catch {}
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

/**
 * Inicialização completa da camada de banco de dados com diagnóstico detalhado
 */
export function initDatabase() {
  const processUid = process.getuid ? process.getuid() : 'N/A';
  const processGid = process.getgid ? process.getgid() : 'N/A';
  const processUser = process.env.USER || process.env.USERNAME || 'desconhecido';

  console.log(`\n============================================================================`);
  console.log(`[ALMOXCONTROL] INICIALIZANDO CAMADA DE BANCO DE DADOS (SQLite node:sqlite)`);
  console.log(`  Processo: Usuário=${processUser} | UID=${processUid} | GID=${processGid}`);
  console.log(`  Diretório de Dados (DB_DIR): ${DB_DIR}`);
  console.log(`============================================================================`);

  // 1. Inicializa Central
  getCentralDb();

  // 2. Inicializa Áreas Padrão
  getAreaDb('ALM');
  getAreaDb('CAF');

  // 3. Sincroniza espelhos para todas as áreas ativas
  syncMirrorsToAllAreas();

  console.log(`[ALMOXCONTROL] Camada de banco inicializada com sucesso!\n`);
}

// Inicialização automática ao carregar o módulo
try {
  initDatabase();
} catch (e: any) {
  console.error('[DB Init Error]:', e.message);
}
