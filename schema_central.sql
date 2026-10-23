-- ============================================================================
-- MULTI ALMOX - BANCO CENTRAL (sistema.db)
-- ARQUITETURA MULTIÁREA: Gerenciamento compartilhado de Usuários, Centros de Custo e Áreas
-- ============================================================================

PRAGMA foreign_keys = ON;

-- 1. TABELA DE ÁREAS OPERACIONAIS (ALM, CAF E NOVAS ÁREAS)
CREATE TABLE IF NOT EXISTS areas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sigla TEXT UNIQUE NOT NULL,             -- Ex: 'ALM', 'CAF'
    nome TEXT NOT NULL,                      -- Ex: 'Almoxarifado', 'CAF'
    arquivo_db TEXT UNIQUE NOT NULL,         -- Ex: 'almoxarifado.db', 'caf.db'
    descricao TEXT,
    ativa INTEGER NOT NULL DEFAULT 1,        -- 1 = Ativa, 0 = Desativada
    criada_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_areas_sigla ON areas (sigla);
CREATE INDEX IF NOT EXISTS idx_areas_ativa ON areas (ativa);

-- 2. TABELA CENTRAL DE CENTROS DE CUSTO (ESPELHADA EM CADA BANCO DE ÁREA)
CREATE TABLE IF NOT EXISTS centros_custo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT UNIQUE NOT NULL,             -- Ex: '7 - 1.02', '101'
    nome TEXT NOT NULL,                      -- Ex: 'ALMOXARIFADO CENTRAL'
    departamento TEXT NOT NULL,              -- Ex: 'ALMOXARIFADO'
    responsavel TEXT NOT NULL,               -- Ex: 'Gestor de Estoque'
    ativo INTEGER NOT NULL DEFAULT 1,        -- 1 = Ativo, 0 = Inativo
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_centros_custo_codigo ON centros_custo (codigo);
CREATE INDEX IF NOT EXISTS idx_centros_custo_ativo ON centros_custo (ativo);

-- 3. TABELA CENTRAL DE USUÁRIOS (AUTENTICAÇÃO ÚNICA PARA TODAS AS ÁREAS)
CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT,                             -- Ex: 'USR-001'
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

-- 4. VÍNCULO USUÁRIO X ÁREAS LIBERADAS
CREATE TABLE IF NOT EXISTS usuario_areas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    area_id INTEGER NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
    UNIQUE(usuario_id, area_id)
);
CREATE INDEX IF NOT EXISTS idx_user_areas_user ON usuario_areas (usuario_id);
CREATE INDEX IF NOT EXISTS idx_user_areas_area ON usuario_areas (area_id);

-- 5. PERMISSÕES DE MÓDULOS POR USUÁRIO
CREATE TABLE IF NOT EXISTS usuario_modulos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    modulo_chave TEXT NOT NULL,
    UNIQUE(usuario_id, modulo_chave)
);
CREATE INDEX IF NOT EXISTS idx_usuario_modulos_user ON usuario_modulos (usuario_id);
CREATE INDEX IF NOT EXISTS idx_usuario_modulos_chave ON usuario_modulos (modulo_chave);

-- 6. CONFIGURAÇÃO DE RELATÓRIOS CRUZADOS ENTRE ÁREAS (PADRÃO: CAF CONSULTA ALM)
CREATE TABLE IF NOT EXISTS area_relatorios_cruzados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    area_origem_id INTEGER NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
    area_alvo_id INTEGER NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(area_origem_id, area_alvo_id)
);
CREATE INDEX IF NOT EXISTS idx_rel_cruz_origem ON area_relatorios_cruzados (area_origem_id);
CREATE INDEX IF NOT EXISTS idx_rel_cruz_alvo ON area_relatorios_cruzados (area_alvo_id);

-- 7. AUDITORIA E LOGS DE ACESSO
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
