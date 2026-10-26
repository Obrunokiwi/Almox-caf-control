-- ============================================================================
-- MULTI ALMOX - SCHEMA PADRÃO DE ÁREA (schema_area.sql)
-- Estrutura idêntica para todos os bancos de área (almoxarifado.db, caf.db, etc.)
-- ============================================================================

PRAGMA foreign_keys = ON;

-- 1. TABELA DE CONTROLE DE VERSÃO DO SCHEMA DA ÁREA
CREATE TABLE IF NOT EXISTS versao_schema (
    versao INTEGER PRIMARY KEY,
    atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. ESPELHO DE CENTROS DE CUSTO (SINCRONIZADO AUTOMATICAMENTE DO BANCO CENTRAL)
CREATE TABLE IF NOT EXISTS centros_custo (
    id INTEGER PRIMARY KEY,
    codigo TEXT UNIQUE NOT NULL,
    nome TEXT NOT NULL,
    departamento TEXT NOT NULL,
    responsavel TEXT NOT NULL,
    ativo INTEGER NOT NULL DEFAULT 1,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_centros_custo_codigo ON centros_custo (codigo);
CREATE INDEX IF NOT EXISTS idx_centros_custo_ativo ON centros_custo (ativo);

-- 3. ESPELHO DE USUÁRIOS (SEM SENHA HASH - APENAS DADOS CADASTRAIS PARA INTEGRIDADE E FKS)
CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY,
    codigo TEXT,
    nome TEXT NOT NULL,
    login TEXT UNIQUE NOT NULL,
    senha_hash TEXT NOT NULL DEFAULT '',
    cpf TEXT,
    email TEXT,
    perfil TEXT NOT NULL,
    cargo_nome TEXT,
    permissoes TEXT,
    centro_custo_id INTEGER REFERENCES centros_custo(id) ON DELETE SET NULL,
    empresa_id INTEGER REFERENCES empresas_unidades(id) ON DELETE SET NULL,
    ativo INTEGER NOT NULL DEFAULT 1,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ultimo_acesso DATETIME
);
CREATE INDEX IF NOT EXISTS idx_usuarios_login ON usuarios (login);
CREATE INDEX IF NOT EXISTS idx_usuarios_perfil ON usuarios (perfil);

-- 4. TABELA DE FORNECEDORES E ENTIDADES PARCEIRAS DA ÁREA
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

-- 5. TABELA DE GRUPOS DE PRODUTOS
CREATE TABLE IF NOT EXISTS grupos_produtos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT UNIQUE,
    nome TEXT NOT NULL,
    tipo_padrao TEXT NOT NULL DEFAULT 'consumivel' CHECK (tipo_padrao IN ('consumivel', 'nao_consumivel')),
    ativo INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_grupos_produtos_codigo ON grupos_produtos (codigo);
CREATE INDEX IF NOT EXISTS idx_grupos_produtos_ativo ON grupos_produtos (ativo);

-- 6. TABELA DE PRODUTOS / ITENS DO CATÁLOGO DA ÁREA
CREATE TABLE IF NOT EXISTS produtos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT UNIQUE NOT NULL,
    nome TEXT NOT NULL,
    descricao TEXT,
    grupo_id INTEGER REFERENCES grupos_produtos(id),
    unidade_medida TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('consumivel', 'nao_consumivel')),
    controla_validade INTEGER NOT NULL DEFAULT 1,
    estoque_minimo REAL NOT NULL DEFAULT 0 CHECK (estoque_minimo >= 0),
    estoque_maximo REAL NOT NULL DEFAULT 0 CHECK (estoque_maximo >= 0),
    quantidade_atual REAL NOT NULL DEFAULT 0 CHECK (quantidade_atual >= 0),
    valor_unitario REAL NOT NULL DEFAULT 0,
    custo_unitario REAL NOT NULL DEFAULT 0,
    localizacao TEXT,
    ativo INTEGER NOT NULL DEFAULT 1,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_produtos_codigo ON produtos (codigo);
CREATE INDEX IF NOT EXISTS idx_produtos_tipo ON produtos (tipo);
CREATE INDEX IF NOT EXISTS idx_produtos_grupo ON produtos (grupo_id);
CREATE INDEX IF NOT EXISTS idx_produtos_ativo ON produtos (ativo);

-- 7. VÍNCULO PRODUTO X FORNECEDORES
CREATE TABLE IF NOT EXISTS produto_fornecedores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    produto_id INTEGER NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
    fornecedor_id INTEGER NOT NULL REFERENCES fornecedores(id) ON DELETE CASCADE,
    marca TEXT,
    nomenclatura_fornecedor TEXT,
    codigo_referencia_fornecedor TEXT,
    ultimo_valor_unitario REAL,
    ultima_compra DATETIME,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_prod_forn_produto ON produto_fornecedores (produto_id);
CREATE INDEX IF NOT EXISTS idx_prod_forn_fornecedor ON produto_fornecedores (fornecedor_id);

-- 8. TABELA DE LOTES DE ESTOQUE E VALIDADES
CREATE TABLE IF NOT EXISTS lotes_estoque (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    produto_id INTEGER NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
    numero_lote TEXT NOT NULL,
    data_validade DATE,
    quantidade_inicial REAL NOT NULL DEFAULT 0,
    quantidade_atual REAL NOT NULL DEFAULT 0 CHECK (quantidade_atual >= 0),
    fornecedor_id INTEGER REFERENCES fornecedores(id) ON DELETE SET NULL,
    centro_custo_id INTEGER REFERENCES centros_custo(id) ON DELETE SET NULL,
    documento_referencia TEXT,
    marca TEXT,
    nomenclatura_fornecedor TEXT,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_lotes_produto ON lotes_estoque (produto_id);
CREATE INDEX IF NOT EXISTS idx_lotes_validade ON lotes_estoque (data_validade);
CREATE INDEX IF NOT EXISTS idx_lotes_numero ON lotes_estoque (numero_lote);

-- 9. TABELA DE NOTAS FISCAIS
CREATE TABLE IF NOT EXISTS notas_fiscais (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero_documento TEXT NOT NULL,
    fornecedor_id INTEGER REFERENCES fornecedores(id) ON DELETE SET NULL,
    fornecedor_nome TEXT,
    centro_custo_id INTEGER REFERENCES centros_custo(id) ON DELETE SET NULL,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
    responsavel_nome TEXT,
    observacao TEXT,
    data_emissao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    situacao TEXT NOT NULL DEFAULT 'ABERTA' CHECK (situacao IN ('ABERTA', 'FECHADA')),
    fechada_em DATETIME,
    fechada_por INTEGER REFERENCES usuarios(id)
);
CREATE INDEX IF NOT EXISTS idx_nf_numero ON notas_fiscais (numero_documento);
CREATE INDEX IF NOT EXISTS idx_nf_fornecedor ON notas_fiscais (fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_nf_situacao ON notas_fiscais (situacao);

CREATE TABLE IF NOT EXISTS historico_notas_fiscais (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nota_fiscal_id INTEGER NOT NULL REFERENCES notas_fiscais(id) ON DELETE CASCADE,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
    acao TEXT NOT NULL,
    detalhes TEXT NOT NULL,
    data_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_hist_nf_nota ON historico_notas_fiscais (nota_fiscal_id);
CREATE INDEX IF NOT EXISTS idx_hist_nf_data ON historico_notas_fiscais (data_registro);

-- 10. TABELA DE REQUISIÇÕES
CREATE TABLE IF NOT EXISTS requisicoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero_requisicao TEXT UNIQUE NOT NULL,
    centro_custo_id INTEGER NOT NULL REFERENCES centros_custo(id),
    centro_custo_nome TEXT,
    centro_custo_codigo TEXT,
    solicitante_id INTEGER NOT NULL REFERENCES usuarios(id),
    solicitante_nome TEXT,
    almoxarife_id INTEGER REFERENCES usuarios(id),
    almoxarife_nome TEXT,
    data_solicitacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_atendimento DATETIME,
    status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovada_atendida', 'rejeitada', 'cancelada')),
    prioridade TEXT NOT NULL DEFAULT 'normal' CHECK (prioridade IN ('normal', 'urgente')),
    motivo_rejeicao TEXT,
    observacao TEXT
);
CREATE INDEX IF NOT EXISTS idx_requisicoes_numero ON requisicoes (numero_requisicao);
CREATE INDEX IF NOT EXISTS idx_requisicoes_status ON requisicoes (status);
CREATE INDEX IF NOT EXISTS idx_requisicoes_centro_custo ON requisicoes (centro_custo_id);
CREATE INDEX IF NOT EXISTS idx_requisicoes_solicitante ON requisicoes (solicitante_id);

CREATE TABLE IF NOT EXISTS itens_requisicao (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    requisicao_id INTEGER NOT NULL REFERENCES requisicoes(id) ON DELETE CASCADE,
    produto_id INTEGER NOT NULL REFERENCES produtos(id),
    lote_id INTEGER REFERENCES lotes_estoque(id) ON DELETE SET NULL,
    numero_lote TEXT,
    data_validade DATE,
    quantidade_solicitada REAL NOT NULL CHECK (quantidade_solicitada > 0),
    quantidade_atendida REAL NOT NULL DEFAULT 0 CHECK (quantidade_atendida >= 0),
    status_item TEXT NOT NULL DEFAULT 'pendente' CHECK (status_item IN ('pendente', 'aprovado', 'negado')),
    analisado_por_id INTEGER REFERENCES usuarios(id),
    analisado_por_nome TEXT,
    data_analise DATETIME,
    motivo_decisao TEXT,
    lotes_atendidos TEXT
);
CREATE INDEX IF NOT EXISTS idx_itens_requisicao_req ON itens_requisicao (requisicao_id);
CREATE INDEX IF NOT EXISTS idx_itens_requisicao_prod ON itens_requisicao (produto_id);
CREATE INDEX IF NOT EXISTS idx_itens_requisicao_status ON itens_requisicao (status_item);

CREATE TABLE IF NOT EXISTS historico_requisicoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    requisicao_id INTEGER NOT NULL REFERENCES requisicoes(id) ON DELETE CASCADE,
    item_requisicao_id INTEGER REFERENCES itens_requisicao(id) ON DELETE SET NULL,
    produto_id INTEGER REFERENCES produtos(id) ON DELETE SET NULL,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
    usuario_nome TEXT,
    acao TEXT NOT NULL CHECK (acao IN (
        'criacao_requisicao',
        'inclusao_item',
        'aprovacao_item',
        'negacao_item',
        'aprovacao_total',
        'aprovacao_parcial',
        'rejeicao_total',
        'cancelamento',
        'alteracao_prioridade',
        'devolucao_setor'
    )),
    status_anterior TEXT,
    status_novo TEXT,
    quantidade_solicitada REAL,
    quantidade_atendida REAL,
    detalhes TEXT NOT NULL,
    justificativa TEXT,
    data_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_hist_req_requisicao ON historico_requisicoes (requisicao_id);
CREATE INDEX IF NOT EXISTS idx_hist_req_item ON historico_requisicoes (item_requisicao_id);
CREATE INDEX IF NOT EXISTS idx_hist_req_usuario ON historico_requisicoes (usuario_id);
CREATE INDEX IF NOT EXISTS idx_hist_req_data ON historico_requisicoes (data_registro);

-- 11. TABELAS DE CONSUMO (ENTREGA DIRETA SEM REQUISIÇÃO)
CREATE TABLE IF NOT EXISTS consumos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero_consumo TEXT UNIQUE NOT NULL,
    centro_custo_id INTEGER NOT NULL REFERENCES centros_custo(id),
    centro_custo_nome TEXT,
    centro_custo_codigo TEXT,
    responsavel_recebimento TEXT NOT NULL,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
    usuario_nome TEXT,
    observacao TEXT,
    data_consumo DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_consumos_numero ON consumos (numero_consumo);
CREATE INDEX IF NOT EXISTS idx_consumos_centro_custo ON consumos (centro_custo_id);
CREATE INDEX IF NOT EXISTS idx_consumos_data ON consumos (data_consumo);

CREATE TABLE IF NOT EXISTS itens_consumo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    consumo_id INTEGER NOT NULL REFERENCES consumos(id) ON DELETE CASCADE,
    produto_id INTEGER NOT NULL REFERENCES produtos(id),
    lote_id INTEGER NOT NULL REFERENCES lotes_estoque(id),
    numero_lote TEXT,
    data_validade DATE,
    quantidade REAL NOT NULL CHECK (quantidade > 0),
    custo_unitario REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_itens_consumo_consumo ON itens_consumo (consumo_id);
CREATE INDEX IF NOT EXISTS idx_itens_consumo_produto ON itens_consumo (produto_id);
CREATE INDEX IF NOT EXISTS idx_itens_consumo_lote ON itens_consumo (lote_id);

-- 12. TABELA DE MOVIMENTAÇÕES (IMUTÁVEIS)
CREATE TABLE IF NOT EXISTS movimentacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'saida', 'estorno_entrada', 'estorno_saida')),
    motivo_diverso TEXT,
    produto_id INTEGER NOT NULL REFERENCES produtos(id),
    lote_id INTEGER REFERENCES lotes_estoque(id) ON DELETE SET NULL,
    quantidade REAL NOT NULL CHECK (quantidade > 0),
    centro_custo_id INTEGER REFERENCES centros_custo(id),
    centro_custo_nome TEXT,
    centro_custo_codigo TEXT,
    fornecedor_id INTEGER REFERENCES fornecedores(id) ON DELETE SET NULL,
    emprestimo_institucional_id INTEGER,
    requisicao_id INTEGER REFERENCES requisicoes(id) ON DELETE SET NULL,
    consumo_id INTEGER REFERENCES consumos(id) ON DELETE SET NULL,
    nota_fiscal_id INTEGER REFERENCES notas_fiscais(id) ON DELETE SET NULL,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
    responsavel_nome TEXT,
    documento_referencia TEXT,
    numero_lote TEXT,
    data_validade DATE,
    valor_unitario REAL,
    marca TEXT,
    nomenclatura_fornecedor TEXT,
    observacao TEXT,
    data_movimentacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_produto ON movimentacoes (produto_id);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_lote ON movimentacoes (lote_id);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_tipo ON movimentacoes (tipo);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_centro_custo ON movimentacoes (centro_custo_id);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_fornecedor ON movimentacoes (fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_data ON movimentacoes (data_movimentacao);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_requisicao ON movimentacoes (requisicao_id);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_consumo ON movimentacoes (consumo_id);

-- 13. TABELA DE EMPRÉSTIMOS INSTITUCIONAIS
CREATE TABLE IF NOT EXISTS emprestimos_institucionais (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero_documento TEXT UNIQUE NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('recebido', 'concedido')),
    entidade_id INTEGER NOT NULL REFERENCES fornecedores(id),
    entidade_nome TEXT,
    data_operacao DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_prevista_devolucao DATE,
    data_quitacao DATETIME,
    status TEXT NOT NULL DEFAULT 'pendente_devolucao' CHECK (status IN ('pendente_devolucao', 'quitado')),
    responsavel_almoxarifado_id INTEGER NOT NULL REFERENCES usuarios(id),
    responsavel_almoxarifado_nome TEXT,
    responsavel_entidade_nome TEXT,
    observacao TEXT
);
CREATE INDEX IF NOT EXISTS idx_emp_inst_entidade ON emprestimos_institucionais (entidade_id);
CREATE INDEX IF NOT EXISTS idx_emp_inst_status ON emprestimos_institucionais (status);
CREATE INDEX IF NOT EXISTS idx_emp_inst_tipo ON emprestimos_institucionais (tipo);

CREATE TABLE IF NOT EXISTS itens_emprestimo_institucional (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    emprestimo_id INTEGER NOT NULL REFERENCES emprestimos_institucionais(id) ON DELETE CASCADE,
    produto_id INTEGER NOT NULL REFERENCES produtos(id),
    lote_id INTEGER REFERENCES lotes_estoque(id) ON DELETE SET NULL,
    numero_lote TEXT,
    data_validade DATE,
    quantidade REAL NOT NULL CHECK (quantidade > 0),
    quantidade_devolvida REAL NOT NULL DEFAULT 0 CHECK (quantidade_devolvida >= 0)
);
CREATE INDEX IF NOT EXISTS idx_itens_emp_inst_emp ON itens_emprestimo_institucional (emprestimo_id);
CREATE INDEX IF NOT EXISTS idx_itens_emp_inst_prod ON itens_emprestimo_institucional (produto_id);

-- 14. TABELA DE INVENTÁRIO DO ESTOQUE
CREATE TABLE IF NOT EXISTS inventarios_estoque (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT UNIQUE NOT NULL,
    data DATE NOT NULL,
    hora TIME NOT NULL,
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
CREATE INDEX IF NOT EXISTS idx_inventarios_codigo ON inventarios_estoque (codigo);
CREATE INDEX IF NOT EXISTS idx_inventarios_data ON inventarios_estoque (data);
CREATE INDEX IF NOT EXISTS idx_inventarios_centro_custo ON inventarios_estoque (centro_custo_id);
CREATE INDEX IF NOT EXISTS idx_inventarios_finalizado ON inventarios_estoque (finalizado);

CREATE TABLE IF NOT EXISTS itens_inventario (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inventario_id INTEGER NOT NULL REFERENCES inventarios_estoque(id) ON DELETE CASCADE,
    produto_id INTEGER NOT NULL REFERENCES produtos(id),
    lote_id INTEGER REFERENCES lotes_estoque(id),
    numero_lote TEXT,
    data_validade DATE,
    quantidade_sistema REAL NOT NULL,
    quantidade_fisica REAL NOT NULL,
    diferenca REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_itens_inv_inventario ON itens_inventario (inventario_id);
CREATE INDEX IF NOT EXISTS idx_itens_inv_produto ON itens_inventario (produto_id);
CREATE INDEX IF NOT EXISTS idx_itens_inv_lote ON itens_inventario (lote_id);

-- 15. ESPELHO DE EMPRESAS / UNIDADES
CREATE TABLE IF NOT EXISTS empresas_unidades (
    id INTEGER PRIMARY KEY,
    codigo TEXT UNIQUE NOT NULL,
    nome TEXT NOT NULL,
    cnpj TEXT UNIQUE,
    endereco TEXT,
    cidade TEXT,
    uf TEXT,
    ativo INTEGER NOT NULL DEFAULT 1,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 16. ALIAS / ESPELHO DE FORNECEDORES E ENTIDADES
CREATE TABLE IF NOT EXISTS fornecedores_entidades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT UNIQUE NOT NULL,
    razao_social TEXT NOT NULL,
    nome_fantasia TEXT,
    cnpj TEXT UNIQUE,
    tipo_entidade TEXT NOT NULL DEFAULT 'fornecedor_comercial',
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

-- 17. TABELA DE EMPRÉSTIMOS INDIVIDUAIS DE EQUIPAMENTOS
CREATE TABLE IF NOT EXISTS emprestimos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo_emprestimo TEXT,
    produto_id INTEGER NOT NULL REFERENCES produtos(id),
    quantidade REAL NOT NULL CHECK (quantidade > 0),
    centro_custo_id INTEGER NOT NULL REFERENCES centros_custo(id),
    solicitante_id INTEGER NOT NULL REFERENCES usuarios(id),
    almoxarife_liberacao_id INTEGER NOT NULL REFERENCES usuarios(id),
    almoxarife_recebimento_id INTEGER REFERENCES usuarios(id),
    data_emprestimo DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_prevista_devolucao DATE NOT NULL,
    data_devolucao DATETIME,
    status TEXT NOT NULL DEFAULT 'emprestado' CHECK (status IN ('emprestado', 'devolvido', 'atrasado')),
    condicao_saida TEXT,
    condicao_devolucao TEXT,
    observacao TEXT
);
CREATE INDEX IF NOT EXISTS idx_emprestimos_produto ON emprestimos (produto_id);
CREATE INDEX IF NOT EXISTS idx_emprestimos_centro_custo ON emprestimos (centro_custo_id);
CREATE INDEX IF NOT EXISTS idx_emprestimos_solicitante ON emprestimos (solicitante_id);
CREATE INDEX IF NOT EXISTS idx_emprestimos_status ON emprestimos (status);

-- 18. TABELA DE LISTA DE REPOSIÇÃO (LISTA DE COMPRAS - APOIO À REPOSIÇÃO)
CREATE TABLE IF NOT EXISTS listas_reposicao (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero_documento TEXT UNIQUE NOT NULL,
    area_sigla TEXT NOT NULL,
    data_inicio DATE NOT NULL,
    data_fim DATE NOT NULL,
    grupo_id INTEGER REFERENCES grupos_produtos(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'RASCUNHO' CHECK (status IN ('RASCUNHO', 'FECHADA')),
    observacao TEXT,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
    usuario_nome TEXT,
    criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_listas_rep_numero ON listas_reposicao (numero_documento);
CREATE INDEX IF NOT EXISTS idx_listas_rep_status ON listas_reposicao (status);

CREATE TABLE IF NOT EXISTS itens_lista_reposicao (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lista_id INTEGER NOT NULL REFERENCES listas_reposicao(id) ON DELETE CASCADE,
    produto_id INTEGER NOT NULL REFERENCES produtos(id),
    produto_codigo TEXT NOT NULL,
    produto_nome TEXT NOT NULL,
    unidade_medida TEXT NOT NULL,
    saldo_atual REAL NOT NULL DEFAULT 0,
    saidas_periodo REAL NOT NULL DEFAULT 0,
    quantidade_sugerida REAL NOT NULL DEFAULT 0,
    quantidade_repor REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_itens_lista_rep_lista ON itens_lista_reposicao (lista_id);
CREATE INDEX IF NOT EXISTS idx_itens_lista_rep_prod ON itens_lista_reposicao (produto_id);

-- Índice de alta performance para Kardex e Cálculo de Reposição
CREATE INDEX IF NOT EXISTS idx_movimentacoes_prod_data ON movimentacoes (produto_id, data_movimentacao);


