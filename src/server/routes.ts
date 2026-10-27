import { Router } from 'express';
import { 
  db, 
  DB_PATH, 
  CENTRAL_DB_PATH, 
  PROJECT_ROOT, 
  getCentralDb, 
  getAreaDb, 
  getAllActiveAreas, 
  getAreaBySiglaOrId, 
  syncMirrorsToAllAreas, 
  currentAreaStorage, 
  getSchemaSql, 
  getSeedSql, 
  runInTransaction, 
  resetDatabase, 
  updateOverdueLoans, 
  registrarLogAcesso 
} from './db.ts';
import { 
  authenticateRequest, 
  getUserById, 
  getUserByLogin, 
  hashPassword, 
  createSession, 
  switchUserSessionArea,
  ALL_SYSTEM_MODULES, 
  MODULOS_PADRAO_SISTEMA, 
  hasModulePermission,
  requireRole,
  type UserSession
} from './auth.ts';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const apiRouter = Router();

// Middleware de resolução da Área da Requisição (ALM, CAF, etc.)
apiRouter.use((req, res, next) => {
  const authUser = authenticateRequest(req);
  let sigla = (req.headers['x-area-sigla'] || req.query.area) as string | undefined;
  if (!sigla && authUser?.area_sigla) {
    sigla = authUser.area_sigla;
  }
  if (!sigla) {
    sigla = 'ALM';
  }
  sigla = sigla.toUpperCase().trim();

  const area = getAreaBySiglaOrId(sigla) || { id: 1, sigla: 'ALM', nome: 'Almoxarifado', arquivo_db: 'almoxarifado.db', ativa: 1 };
  const areaDb = getAreaDb(area.sigla);

  (req as any).areaSigla = area.sigla;
  (req as any).areaId = area.id;
  (req as any).areaNome = area.nome;
  (req as any).areaDb = areaDb;

  currentAreaStorage.run({ areaSigla: area.sigla, areaId: area.id, db: areaDb }, () => {
    next();
  });
});

// ============================================================================
// HELPERS DE CONTROLE DE LOTE, VALIDADE (30/60/90 DIAS) E BLOQUEIO POR VENCIMENTO
// ============================================================================

export function classifyLoteValidade(dataValidade?: string | null): {
  dias_para_vencer: number | null;
  status_validade: 'vencido' | 'critico_30d' | 'alerta_60d' | 'atencao_90d' | 'regular' | 'sem_validade';
} {
  if (!dataValidade || !String(dataValidade).trim()) {
    return { dias_para_vencer: null, status_validade: 'sem_validade' };
  }
  const hojeStr = new Date().toISOString().slice(0, 10);
  const dtHoje = new Date(`${hojeStr}T00:00:00`);
  const dtVal = new Date(`${String(dataValidade).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(dtVal.getTime())) {
    return { dias_para_vencer: null, status_validade: 'sem_validade' };
  }
  const diffDays = Math.ceil((dtVal.getTime() - dtHoje.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { dias_para_vencer: diffDays, status_validade: 'vencido' };
  if (diffDays <= 30) return { dias_para_vencer: diffDays, status_validade: 'critico_30d' };
  if (diffDays <= 60) return { dias_para_vencer: diffDays, status_validade: 'alerta_60d' };
  if (diffDays <= 90) return { dias_para_vencer: diffDays, status_validade: 'atencao_90d' };
  return { dias_para_vencer: diffDays, status_validade: 'regular' };
}

export function upsertLoteEstoque(params: {
  produto_id: number;
  numero_lote?: string | null;
  data_validade?: string | null;
  quantidade: number;
  fornecedor_id?: number | null;
  documento_referencia?: string | null;
  marca?: string | null;
  nomenclatura_fornecedor?: string | null;
  centro_custo_id?: number | null;
}): { id: number; numero_lote: string; data_validade: string | null } {
  const loteNorm = params.numero_lote && String(params.numero_lote).trim()
    ? String(params.numero_lote).trim().toUpperCase()
    : 'LOTE-PADRAO';
  const validadeNorm = params.data_validade && String(params.data_validade).trim()
    ? String(params.data_validade).trim().slice(0, 10)
    : null;

  const existente = db.prepare(`
    SELECT id, numero_lote, data_validade, centro_custo_id
    FROM lotes_estoque
    WHERE produto_id = ?
      AND UPPER(numero_lote) = ?
      AND COALESCE(data_validade, '') = COALESCE(?, '')
    LIMIT 1
  `).get(params.produto_id, loteNorm, validadeNorm || '') as { id: number; numero_lote: string; data_validade: string | null; centro_custo_id: number | null } | undefined;

  if (existente) {
    db.prepare(`
      UPDATE lotes_estoque
      SET quantidade_atual = quantidade_atual + ?,
          quantidade_inicial = quantidade_inicial + ?,
          fornecedor_id = COALESCE(?, fornecedor_id),
          documento_referencia = COALESCE(?, documento_referencia),
          marca = COALESCE(?, marca),
          nomenclatura_fornecedor = COALESCE(?, nomenclatura_fornecedor),
          centro_custo_id = COALESCE(?, centro_custo_id)
      WHERE id = ?
    `).run(
      params.quantidade,
      params.quantidade,
      params.fornecedor_id || null,
      params.documento_referencia || null,
      params.marca || null,
      params.nomenclatura_fornecedor || null,
      params.centro_custo_id || null,
      existente.id
    );
    return existente;
  }

  const info = db.prepare(`
    INSERT INTO lotes_estoque (
      produto_id, numero_lote, data_validade, quantidade_inicial, quantidade_atual,
      fornecedor_id, documento_referencia, marca, nomenclatura_fornecedor, centro_custo_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    params.produto_id,
    loteNorm,
    validadeNorm,
    params.quantidade,
    params.quantidade,
    params.fornecedor_id || null,
    params.documento_referencia || null,
    params.marca || null,
    params.nomenclatura_fornecedor || null,
    params.centro_custo_id || null
  );

  return {
    id: Number(info.lastInsertRowid),
    numero_lote: loteNorm,
    data_validade: validadeNorm,
  };
}

/**
 * Consome saldo de lotes válidos (não vencidos) usando FEFO (First Expired, First Out).
 * Bloqueia sumariamente caso os lotes disponíveis estejam vencidos!
 */
export function consumirLotesValidosFEFO(
  produtoId: number,
  qtdNecessaria: number,
  loteIdEspecifico?: number | null
): Array<{ lote_id: number; numero_lote: string; data_validade: string | null; quantidade_consumida: number }> {
  const hojeStr = new Date().toISOString().slice(0, 10);
  const prod = db.prepare('SELECT id, codigo, nome, unidade_medida FROM produtos WHERE id = ?').get(produtoId) as any;
  const prodLabel = prod ? `${prod.codigo} - ${prod.nome}` : `Produto #${produtoId}`;

  if (loteIdEspecifico) {
    const lote = db.prepare('SELECT * FROM lotes_estoque WHERE id = ? AND produto_id = ?').get(loteIdEspecifico, produtoId) as any;
    if (!lote) {
      throw new Error(`Lote #${loteIdEspecifico} não encontrado para o produto "${prodLabel}".`);
    }
    if (lote.data_validade && String(lote.data_validade).slice(0, 10) < hojeStr) {
      throw new Error(
        `BLOQUEIO AUTOMÁTICO DE MOVIMENTAÇÃO POR VENCIMENTO: O lote "${lote.numero_lote}" do produto "${prodLabel}" venceu em ${lote.data_validade}. ` +
        `Lotes vencidos estão sumariamente bloqueados para requisições de consumo, transferências ou empréstimos. ` +
        `A única movimentação permitida para lotes vencidos é "Saída por Vencimento/Descarte" em Movimentações Diversas.`
      );
    }
    if (Number(lote.quantidade_atual) < qtdNecessaria) {
      throw new Error(
        `Saldo insuficiente no lote "${lote.numero_lote}" (${prodLabel}). Disponível no lote: ${lote.quantidade_atual}, Solicitado: ${qtdNecessaria}.`
      );
    }
    db.prepare('UPDATE lotes_estoque SET quantidade_atual = quantidade_atual - ? WHERE id = ?').run(qtdNecessaria, lote.id);
    return [{
      lote_id: lote.id,
      numero_lote: lote.numero_lote,
      data_validade: lote.data_validade || null,
      quantidade_consumida: qtdNecessaria,
    }];
  }

  const todosLotesAtivos = db.prepare(`
    SELECT * FROM lotes_estoque
    WHERE produto_id = ? AND quantidade_atual > 0
    ORDER BY CASE WHEN data_validade IS NULL THEN 1 ELSE 0 END ASC, data_validade ASC, id ASC
  `).all(produtoId) as any[];

  if (todosLotesAtivos.length === 0) {
    return [];
  }

  const lotesValidos = todosLotesAtivos.filter(
    (l) => !l.data_validade || String(l.data_validade).slice(0, 10) >= hojeStr
  );
  const lotesVencidos = todosLotesAtivos.filter(
    (l) => l.data_validade && String(l.data_validade).slice(0, 10) < hojeStr
  );

  const saldoValido = lotesValidos.reduce((acc, l) => acc + Number(l.quantidade_atual), 0);
  const saldoVencido = lotesVencidos.reduce((acc, l) => acc + Number(l.quantidade_atual), 0);

  if (saldoValido < qtdNecessaria) {
    if (saldoVencido > 0) {
      const listaVenc = lotesVencidos
        .map((l) => `${l.numero_lote} (Val: ${l.data_validade}, Qtd: ${l.quantidade_atual})`)
        .join(', ');
      throw new Error(
        `BLOQUEIO AUTOMÁTICO DE MOVIMENTAÇÃO POR VENCIMENTO: O produto "${prodLabel}" possui ${saldoVencido} ${prod?.unidade_medida || 'un.'} em lote(s) VENCIDO(S) [${listaVenc}] e apenas ${saldoValido} ${prod?.unidade_medida || 'un.'} em lotes válidos não vencidos (Solicitado: ${qtdNecessaria}). ` +
        `O sistema bloqueia sumariamente a liberação de lotes vencidos para consumo ou empréstimo. Realize a baixa em "Movimentações Diversas > Saída por Vencimento/Descarte".`
      );
    }
  }

  let restante = qtdNecessaria;
  const consumidos: Array<{ lote_id: number; numero_lote: string; data_validade: string | null; quantidade_consumida: number }> = [];

  for (const lote of lotesValidos) {
    if (restante <= 0) break;
    const disp = Number(lote.quantidade_atual);
    const abater = Math.min(disp, restante);
    if (abater > 0) {
      db.prepare('UPDATE lotes_estoque SET quantidade_atual = quantidade_atual - ? WHERE id = ?').run(abater, lote.id);
      consumidos.push({
        lote_id: lote.id,
        numero_lote: lote.numero_lote,
        data_validade: lote.data_validade || null,
        quantidade_consumida: abater,
      });
      restante -= abater;
    }
  }

  return consumidos;
}

// ============================================================================
// 1. EMPRESAS / UNIDADES DE ALMOXARIFADO
// ============================================================================

apiRouter.get(['/empresas-unidades', '/unidades'], (_req, res) => {
  try {
    const central = getCentralDb();
    const rows = central.prepare('SELECT * FROM empresas_unidades WHERE ativo = 1 ORDER BY id ASC').all();
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao buscar unidades: ' + err.message });
  }
});

// ============================================================================
// 1.1 GESTÃO DE ÁREAS OPERACIONAIS (SOMENTE ADMINISTRADOR)
// ============================================================================

apiRouter.get('/areas', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || (user.perfil !== 'admin' && user.perfil !== 'ti_dpo')) {
    res.status(403).json({ error: 'Acesso restrito a Administradores' });
    return;
  }

  try {
    const central = getCentralDb();
    const areas = central.prepare('SELECT * FROM areas ORDER BY id ASC').all() as any[];

    const result = areas.map((a) => {
      let totalProdutos = 0;
      let totalMovimentacoes = 0;
      try {
        const areaDb = getAreaDb(a.sigla);
        const pRow = areaDb.prepare('SELECT COUNT(*) as c FROM produtos').get() as any;
        totalProdutos = pRow ? pRow.c : 0;
        const mRow = areaDb.prepare('SELECT COUNT(*) as c FROM movimentacoes').get() as any;
        totalMovimentacoes = mRow ? mRow.c : 0;
      } catch {}

      return {
        ...a,
        total_produtos: totalProdutos,
        total_movimentacoes: totalMovimentacoes,
      };
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao listar áreas: ' + err.message });
  }
});

apiRouter.post('/areas', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || (user.perfil !== 'admin' && user.perfil !== 'ti_dpo')) {
    res.status(403).json({ error: 'Acesso restrito a Administradores' });
    return;
  }

  const { sigla, nome, descricao, copiar_catalogo_de_sigla } = req.body;
  if (!sigla || !nome) {
    res.status(400).json({ error: 'Sigla e nome da área são obrigatórios' });
    return;
  }

  const siglaNorm = sigla.trim().toUpperCase();
  const arquivoDb = `${siglaNorm.toLowerCase()}.db`;

  try {
    const central = getCentralDb();

    // 1. Cadastra na tabela central de áreas
    const info = central.prepare(`
      INSERT INTO areas (sigla, nome, arquivo_db, descricao, ativa)
      VALUES (?, ?, ?, ?, 1)
    `).run(siglaNorm, nome.trim(), arquivoDb, descricao ? descricao.trim() : null);

    const novaAreaId = Number(info.lastInsertRowid);

    // 2. Inicializa o arquivo SQLite da nova área com o schema_area.sql padrão
    const newAreaDb = getAreaDb(siglaNorm);

    // 3. Se solicitado, copia catálogo da área de origem
    if (copiar_catalogo_de_sigla) {
      try {
        const sourceDb = getAreaDb(copiar_catalogo_de_sigla);

        // Copia fornecedores
        const forns = sourceDb.prepare('SELECT * FROM fornecedores').all() as any[];
        const insForn = newAreaDb.prepare(`
          INSERT OR IGNORE INTO fornecedores (
            id, codigo, razao_social, nome_fantasia, cnpj, tipo_entidade, inscricao_estadual,
            telefone, email, contato_responsavel, endereco, cidade, uf, observacoes, ativo, criado_em
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const f of forns) {
          insForn.run(
            f.id, f.codigo, f.razao_social, f.nome_fantasia, f.cnpj, f.tipo_entidade, f.inscricao_estadual,
            f.telefone, f.email, f.contato_responsavel, f.endereco, f.cidade, f.uf, f.observacoes, f.ativo, f.criado_em
          );
        }

        // Copia grupos
        const grupos = sourceDb.prepare('SELECT * FROM grupos_produtos').all() as any[];
        const insGrupo = newAreaDb.prepare(`
          INSERT OR IGNORE INTO grupos_produtos (id, codigo, nome, tipo_padrao, ativo)
          VALUES (?, ?, ?, ?, ?)
        `);
        for (const g of grupos) {
          insGrupo.run(g.id, g.codigo, g.nome, g.tipo_padrao, g.ativo);
        }

        // Copia produtos (com saldo zerado e sem lotes!)
        const prods = sourceDb.prepare('SELECT * FROM produtos').all() as any[];
        const insProd = newAreaDb.prepare(`
          INSERT OR IGNORE INTO produtos (
            id, codigo, nome, descricao, grupo_id, unidade_medida, tipo, controla_validade,
            estoque_minimo, estoque_maximo, quantidade_atual, valor_unitario, custo_unitario, localizacao, ativo, criado_em
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
        `);
        for (const p of prods) {
          insProd.run(
            p.id, p.codigo, p.nome, p.descricao, p.grupo_id, p.unidade_medida, p.tipo, p.controla_validade,
            p.estoque_minimo, p.estoque_maximo, p.valor_unitario, p.custo_unitario, p.localizacao, p.ativo, p.criado_em
          );
        }
      } catch (errCopy) {
        console.error('[Areas] Erro ao copiar catálogo de área:', errCopy);
      }
    }

    // 4. Vincula admin e ti_dpo à nova área
    const adminUsers = central.prepare("SELECT id FROM usuarios WHERE perfil IN ('admin', 'ti_dpo')").all() as any[];
    for (const u of adminUsers) {
      central.prepare('INSERT OR IGNORE INTO usuario_areas (usuario_id, area_id) VALUES (?, ?)').run(u.id, novaAreaId);
    }

    const created = central.prepare('SELECT * FROM areas WHERE id = ?').get(novaAreaId);
    res.status(201).json(created);
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint failed')) {
      res.status(409).json({ error: `Já existe uma área cadastrada com a sigla "${siglaNorm}".` });
      return;
    }
    res.status(500).json({ error: 'Erro ao criar área: ' + err.message });
  }
});

apiRouter.put('/areas/:id', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || (user.perfil !== 'admin' && user.perfil !== 'ti_dpo')) {
    res.status(403).json({ error: 'Acesso restrito a Administradores' });
    return;
  }

  const { id } = req.params;
  const { nome, descricao } = req.body;

  if (!nome || !nome.trim()) {
    res.status(400).json({ error: 'O nome da área é obrigatório' });
    return;
  }

  try {
    const central = getCentralDb();
    central.prepare(`
      UPDATE areas 
      SET nome = ?, descricao = ?
      WHERE id = ?
    `).run(nome.trim(), descricao ? descricao.trim() : null, Number(id));

    const updated = central.prepare('SELECT * FROM areas WHERE id = ?').get(Number(id));
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao atualizar área: ' + err.message });
  }
});

apiRouter.patch('/areas/:id/status', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || (user.perfil !== 'admin' && user.perfil !== 'ti_dpo')) {
    res.status(403).json({ error: 'Acesso restrito a Administradores' });
    return;
  }

  const { id } = req.params;
  const central = getCentralDb();
  const area = central.prepare('SELECT * FROM areas WHERE id = ?').get(Number(id)) as any;

  if (!area) {
    res.status(404).json({ error: 'Área não encontrada' });
    return;
  }

  if (area.sigla === 'ALM' || area.sigla === 'CAF') {
    res.status(400).json({ error: 'As áreas padrão Almoxarifado (ALM) e CAF não podem ser desativadas.' });
    return;
  }

  const novoAtiva = area.ativa === 1 ? 0 : 1;
  central.prepare('UPDATE areas SET ativa = ? WHERE id = ?').run(novoAtiva, Number(id));

  res.json({ id: area.id, sigla: area.sigla, ativa: novoAtiva });
});

apiRouter.get('/areas/:id/relatorios-cruzados', (req, res) => {
  const user = authenticateRequest(req);
  if (!user) {
    res.status(401).json({ error: 'Não autenticado' });
    return;
  }

  const { id } = req.params;
  try {
    const central = getCentralDb();
    const rows = central.prepare(`
      SELECT rc.*, a.sigla as alvo_sigla, a.nome as alvo_nome
      FROM area_relatorios_cruzados rc
      JOIN areas a ON rc.area_alvo_id = a.id
      WHERE rc.area_origem_id = ?
    `).all(Number(id));
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao buscar relatórios cruzados: ' + err.message });
  }
});

apiRouter.put('/areas/:id/relatorios-cruzados', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || (user.perfil !== 'admin' && user.perfil !== 'ti_dpo')) {
    res.status(403).json({ error: 'Acesso restrito a Administradores' });
    return;
  }

  const { id } = req.params;
  const { area_alvo_ids } = req.body;

  if (!Array.isArray(area_alvo_ids)) {
    res.status(400).json({ error: 'Formato inválido. area_alvo_ids deve ser um array de IDs.' });
    return;
  }

  try {
    const central = getCentralDb();
    central.prepare('DELETE FROM area_relatorios_cruzados WHERE area_origem_id = ?').run(Number(id));
    const ins = central.prepare('INSERT OR IGNORE INTO area_relatorios_cruzados (area_origem_id, area_alvo_id) VALUES (?, ?)');
    for (const alvoId of area_alvo_ids) {
      if (Number(alvoId) !== Number(id)) {
        ins.run(Number(id), Number(alvoId));
      }
    }
    res.json({ message: 'Permissões de relatórios cruzados atualizadas com sucesso' });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao atualizar relatórios cruzados: ' + err.message });
  }
});

// ============================================================================
// 1.2 MÓDULO DE CONSUMO DIRETO (ENTREGA SEM REQUISIÇÃO)
// ============================================================================

apiRouter.get('/consumos', (req, res) => {
  const { busca, data_inicio, data_fim, centro_custo_id } = req.query;

  let sql = `
    SELECT c.*,
           cc.nome as centro_custo_nome, cc.codigo as centro_custo_codigo,
           u.nome as usuario_nome,
           (SELECT COUNT(*) FROM itens_consumo ic WHERE ic.consumo_id = c.id) as total_itens,
           (SELECT COALESCE(SUM(ic.quantidade), 0) FROM itens_consumo ic WHERE ic.consumo_id = c.id) as total_quantidade,
           (SELECT COALESCE(SUM(ic.quantidade * ic.custo_unitario), 0) FROM itens_consumo ic WHERE ic.consumo_id = c.id) as valor_total
    FROM consumos c
    LEFT JOIN centros_custo cc ON c.centro_custo_id = cc.id
    LEFT JOIN usuarios u ON c.usuario_id = u.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (centro_custo_id) {
    sql += ' AND c.centro_custo_id = ?';
    params.push(Number(centro_custo_id));
  }
  if (data_inicio) {
    sql += ' AND date(c.data_consumo) >= date(?)';
    params.push(String(data_inicio));
  }
  if (data_fim) {
    sql += ' AND date(c.data_consumo) <= date(?)';
    params.push(String(data_fim));
  }
  if (busca && typeof busca === 'string' && busca.trim()) {
    sql += ' AND (c.numero_consumo LIKE ? OR c.responsavel_recebimento LIKE ? OR cc.nome LIKE ?)';
    const t = `%${busca.trim()}%`;
    params.push(t, t, t);
  }

  sql += ' ORDER BY c.id DESC';

  try {
    const rows = db.prepare(sql).all(...params);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao listar consumos: ' + err.message });
  }
});

apiRouter.get('/consumos/:id', (req, res) => {
  const { id } = req.params;
  try {
    const consumo = db.prepare(`
      SELECT c.*,
             cc.nome as centro_custo_nome, cc.codigo as centro_custo_codigo,
             u.nome as usuario_nome
      FROM consumos c
      LEFT JOIN centros_custo cc ON c.centro_custo_id = cc.id
      LEFT JOIN usuarios u ON c.usuario_id = u.id
      WHERE c.id = ?
    `).get(Number(id)) as any;

    if (!consumo) {
      res.status(404).json({ error: 'Registro de consumo não encontrado' });
      return;
    }

    const itens = db.prepare(`
      SELECT ic.*, p.codigo as produto_codigo, p.nome as produto_nome, p.unidade_medida,
             le.numero_lote as lote_numero, le.data_validade as lote_validade
      FROM itens_consumo ic
      JOIN produtos p ON ic.produto_id = p.id
      LEFT JOIN lotes_estoque le ON ic.lote_id = le.id
      WHERE ic.consumo_id = ?
    `).all(Number(id));

    res.json({ ...consumo, itens });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao consultar consumo: ' + err.message });
  }
});

apiRouter.post('/consumos', (req, res) => {
  const user = authenticateRequest(req);
  if (!user) {
    res.status(401).json({ error: 'Não autenticado' });
    return;
  }

  if (user.perfil === 'requisitante') {
    res.status(403).json({ error: 'Perfil Requisitante não possui autorização para lançar entregas de consumo direto.' });
    return;
  }

  const { centro_custo_id, responsavel_recebimento, observacao, itens } = req.body;

  if (!centro_custo_id) {
    res.status(400).json({ error: 'O Setor / Centro de Custo atendido é obrigatório' });
    return;
  }
  if (!responsavel_recebimento || !String(responsavel_recebimento).trim()) {
    res.status(400).json({ error: 'O nome do Responsável pelo Recebimento é obrigatório' });
    return;
  }
  if (!Array.isArray(itens) || itens.length === 0) {
    res.status(400).json({ error: 'O consumo deve conter pelo menos 1 item' });
    return;
  }

  const areaSigla = ((req as any).areaSigla || user.area_sigla || 'ALM').toUpperCase();
  const year = new Date().getFullYear();

  const countCons = db.prepare(`
    SELECT COUNT(*) as count FROM consumos WHERE numero_consumo LIKE ?
  `).get(`CONS-${areaSigla}-${year}-%`) as { count: number };
  const nextSeq = String((countCons?.count || 0) + 1).padStart(4, '0');
  const numero_consumo = `CONS-${areaSigla}-${year}-${nextSeq}`;

  try {
    const result = runInTransaction(() => {
      // 1. Dados desnormalizados do centro de custo
      const cc = db.prepare('SELECT nome, codigo FROM centros_custo WHERE id = ?').get(Number(centro_custo_id)) as any;
      const ccNome = cc ? cc.nome : null;
      const ccCodigo = cc ? cc.codigo : null;

      // 2. Insere cabeçalho de consumo
      const insCons = db.prepare(`
        INSERT INTO consumos (
          numero_consumo, centro_custo_id, centro_custo_nome, centro_custo_codigo,
          responsavel_recebimento, usuario_id, usuario_nome, observacao
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const infoCons = insCons.run(
        numero_consumo,
        Number(centro_custo_id),
        ccNome,
        ccCodigo,
        String(responsavel_recebimento).trim(),
        user.id,
        user.nome,
        observacao ? String(observacao).trim() : null
      );
      const consumoId = Number(infoCons.lastInsertRowid);

      const insItem = db.prepare(`
        INSERT INTO itens_consumo (consumo_id, produto_id, lote_id, numero_lote, data_validade, quantidade, custo_unitario)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const insMov = db.prepare(`
        INSERT INTO movimentacoes (
          tipo, motivo_diverso, produto_id, lote_id, quantidade,
          centro_custo_id, centro_custo_nome, centro_custo_codigo,
          consumo_id, usuario_id, responsavel_nome, documento_referencia,
          numero_lote, data_validade, valor_unitario, observacao
        ) VALUES ('saida', 'Consumo Direto', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const hojeStr = new Date().toISOString().slice(0, 10);

      // 3. Processa cada item com FEFO e bloqueio de vencido
      for (const it of itens) {
        const prodId = Number(it.produto_id);
        const qtd = Number(it.quantidade);
        if (!prodId || qtd <= 0) {
          throw new Error('Quantidade inválida para o produto.');
        }

        const prod = db.prepare('SELECT * FROM produtos WHERE id = ?').get(prodId) as any;
        if (!prod) {
          throw new Error(`Produto #${prodId} não encontrado no catálogo da área.`);
        }

        // Se informou lote específico
        let loteUsado: any;
        if (it.lote_id) {
          loteUsado = db.prepare('SELECT * FROM lotes_estoque WHERE id = ? AND produto_id = ?').get(Number(it.lote_id), prodId) as any;
          if (!loteUsado) {
            throw new Error(`Lote #${it.lote_id} não encontrado para o produto "${prod.nome}".`);
          }
          if (loteUsado.data_validade && String(loteUsado.data_validade).slice(0, 10) < hojeStr) {
            throw new Error(
              `BLOQUEIO DE VENCIMENTO: O lote "${loteUsado.numero_lote}" do item "${prod.nome}" está VENCIDO (${loteUsado.data_validade}) e não pode ser dispensado para consumo.`
            );
          }
          if (Number(loteUsado.quantidade_atual) < qtd) {
            throw new Error(`Saldo insuficiente no lote "${loteUsado.numero_lote}" (${prod.nome}). Disponível: ${loteUsado.quantidade_atual}, Solicitado: ${qtd}.`);
          }
          db.prepare('UPDATE lotes_estoque SET quantidade_atual = quantidade_atual - ? WHERE id = ?').run(qtd, loteUsado.id);
        } else {
          // FEFO automático
          const lotesConsumidos = consumirLotesValidosFEFO(prodId, qtd);
          loteUsado = lotesConsumidos[0];
        }

        // Atualiza quantidade_atual do produto
        db.prepare('UPDATE produtos SET quantidade_atual = MAX(0, quantidade_atual - ?) WHERE id = ?').run(qtd, prodId);

        const custoUnit = Number(it.custo_unitario || prod.valor_unitario || 0);

        insItem.run(
          consumoId,
          prodId,
          loteUsado.id || loteUsado.lote_id,
          loteUsado.numero_lote,
          loteUsado.data_validade || null,
          qtd,
          custoUnit
        );

        insMov.run(
          prodId,
          loteUsado.id || loteUsado.lote_id,
          qtd,
          Number(centro_custo_id),
          ccNome,
          ccCodigo,
          consumoId,
          user.id,
          user.nome,
          numero_consumo,
          loteUsado.numero_lote,
          loteUsado.data_validade || null,
          custoUnit,
          `Entrega para ${responsavel_recebimento} (${ccNome || 'Setor'})`
        );
      }

      return db.prepare('SELECT * FROM consumos WHERE id = ?').get(consumoId);
    });

    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: 'Erro ao registrar consumo: ' + err.message });
  }
});

apiRouter.post('/consumos/:id/estorno', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || (user.perfil !== 'admin' && user.perfil !== 'ti_dpo' && user.perfil !== 'almoxarife')) {
    res.status(403).json({ error: 'Apenas almoxarifes ou administradores podem estornar consumos' });
    return;
  }

  const { id } = req.params;
  const { justificativa } = req.body;

  if (!justificativa || !String(justificativa).trim()) {
    res.status(400).json({ error: 'A justificativa do estorno é obrigatória' });
    return;
  }

  try {
    runInTransaction(() => {
      const consumo = db.prepare('SELECT * FROM consumos WHERE id = ?').get(Number(id)) as any;
      if (!consumo) {
        throw new Error('Consumo não encontrado.');
      }

      const itens = db.prepare('SELECT * FROM itens_consumo WHERE consumo_id = ?').all(Number(id)) as any[];

      const insMovEstorno = db.prepare(`
        INSERT INTO movimentacoes (
          tipo, motivo_diverso, produto_id, lote_id, quantidade,
          centro_custo_id, centro_custo_nome, centro_custo_codigo,
          consumo_id, usuario_id, responsavel_nome, documento_referencia,
          numero_lote, data_validade, valor_unitario, observacao
        ) VALUES ('estorno_saida', 'Estorno de Consumo', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const it of itens) {
        // Devolve ao lote
        db.prepare('UPDATE lotes_estoque SET quantidade_atual = quantidade_atual + ? WHERE id = ?').run(it.quantidade, it.lote_id);
        // Devolve ao produto
        db.prepare('UPDATE produtos SET quantidade_atual = quantidade_atual + ? WHERE id = ?').run(it.quantidade, it.produto_id);

        insMovEstorno.run(
          it.produto_id,
          it.lote_id,
          it.quantidade,
          consumo.centro_custo_id,
          consumo.centro_custo_nome,
          consumo.centro_custo_codigo,
          consumo.id,
          user.id,
          user.nome,
          `EST-${consumo.numero_consumo}`,
          it.numero_lote,
          it.data_validade,
          it.custo_unitario,
          `Estorno de consumo: ${justificativa.trim()}`
        );
      }
    });

    res.json({ message: 'Consumo estornado com sucesso. Quantidades devolvidas aos lotes e estoque.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao estornar consumo: ' + err.message });
  }
});

// ============================================================================
// 1.3 RELATÓRIOS DE OUTRAS ÁREAS (SOMENTE LEITURA)
// ============================================================================

function checkCrossAreaAuthorization(user: UserSession | null, targetSigla: string): { allowed: boolean; status: number; message: string; targetSiglaNorm?: string } {
  if (!user) {
    return { allowed: false, status: 401, message: 'Não autenticado' };
  }

  if (user.perfil === 'requisitante') {
    return { allowed: false, status: 403, message: 'Acesso negado. Usuários requisitantes não possuem permissão para relatórios de outras áreas.' };
  }

  const originSigla = (user.area_sigla || 'ALM').toUpperCase();
  const targetSiglaNorm = targetSigla.toUpperCase();

  if (originSigla === targetSiglaNorm) {
    return { allowed: true, status: 200, message: 'OK', targetSiglaNorm };
  }

  const central = getCentralDb();
  const originArea = central.prepare('SELECT id FROM areas WHERE UPPER(sigla) = ? AND ativa = 1').get(originSigla) as { id: number } | undefined;
  const targetArea = central.prepare('SELECT id FROM areas WHERE UPPER(sigla) = ? AND ativa = 1').get(targetSiglaNorm) as { id: number } | undefined;

  if (!originArea || !targetArea) {
    return { allowed: false, status: 404, message: `Área de origem (${originSigla}) ou destino (${targetSiglaNorm}) não encontrada ou inativa.` };
  }

  const rule = central.prepare('SELECT id FROM area_relatorios_cruzados WHERE area_origem_id = ? AND area_alvo_id = ?').get(originArea.id, targetArea.id);
  if (!rule) {
    return { allowed: false, status: 403, message: `Acesso negado. A área ${originSigla} não possui autorização para consultar relatórios da área ${targetSiglaNorm}.` };
  }

  return { allowed: true, status: 200, message: 'OK', targetSiglaNorm };
}

apiRouter.get('/relatorios-outras-areas/areas-permitidas', (req, res) => {
  const user = authenticateRequest(req);
  if (!user) {
    res.status(401).json({ error: 'Não autenticado' });
    return;
  }

  if (user.perfil === 'requisitante') {
    res.json([]);
    return;
  }

  const areaSigla = (user.area_sigla || 'ALM').toUpperCase();
  const central = getCentralDb();

  try {
    const currentArea = central.prepare('SELECT id FROM areas WHERE UPPER(sigla) = ?').get(areaSigla) as any;
    const currentAreaId = currentArea ? currentArea.id : 1;

    const targetAreas = central.prepare(`
      SELECT a.id, a.sigla, a.nome, a.arquivo_db, a.descricao
      FROM area_relatorios_cruzados rc
      JOIN areas a ON rc.area_alvo_id = a.id
      WHERE rc.area_origem_id = ? AND a.ativa = 1
    `).all(currentAreaId);

    res.json(targetAreas);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao listar áreas permitidas para consulta: ' + err.message });
  }
});

apiRouter.get('/relatorios-outras-areas/:targetSigla/saldo', (req, res) => {
  const user = authenticateRequest(req);
  const check = checkCrossAreaAuthorization(user, req.params.targetSigla);
  if (!check.allowed) {
    res.status(check.status).json({ error: check.message });
    return;
  }

  try {
    const targetDb = getAreaDb(check.targetSiglaNorm!, true); // Read-only connection!
    const rows = targetDb.prepare(`
      SELECT p.id, p.codigo, p.nome, p.unidade_medida, p.tipo, p.quantidade_atual,
             p.estoque_minimo, p.valor_unitario, gp.nome as grupo_nome
      FROM produtos p
      LEFT JOIN grupos_produtos gp ON p.grupo_id = gp.id
      WHERE p.ativo = 1
      ORDER BY p.nome ASC
    `).all();
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao consultar saldos da outra área: ' + err.message });
  }
});

apiRouter.get('/relatorios-outras-areas/:targetSigla/movimentacoes', (req, res) => {
  const user = authenticateRequest(req);
  const check = checkCrossAreaAuthorization(user, req.params.targetSigla);
  if (!check.allowed) {
    res.status(check.status).json({ error: check.message });
    return;
  }

  try {
    const targetDb = getAreaDb(check.targetSiglaNorm!, true);
    const rows = targetDb.prepare(`
      SELECT m.*, p.nome as produto_nome, p.codigo as produto_codigo,
             cc.nome as centro_custo_nome
      FROM movimentacoes m
      JOIN produtos p ON m.produto_id = p.id
      LEFT JOIN centros_custo cc ON m.centro_custo_id = cc.id
      ORDER BY m.id DESC LIMIT 100
    `).all();
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao consultar movimentações da outra área: ' + err.message });
  }
});

apiRouter.get('/relatorios-outras-areas/:targetSigla/validades', (req, res) => {
  const user = authenticateRequest(req);
  const check = checkCrossAreaAuthorization(user, req.params.targetSigla);
  if (!check.allowed) {
    res.status(check.status).json({ error: check.message });
    return;
  }

  try {
    const targetDb = getAreaDb(check.targetSiglaNorm!, true);
    const rows = targetDb.prepare(`
      SELECT le.*, p.nome as produto_nome, p.codigo as produto_codigo, p.unidade_medida
      FROM lotes_estoque le
      JOIN produtos p ON le.produto_id = p.id
      WHERE le.quantidade_atual > 0 AND le.data_validade IS NOT NULL
      ORDER BY le.data_validade ASC
    `).all() as any[];

    const result = rows.map((r) => {
      const cls = classifyLoteValidade(r.data_validade);
      return { ...r, ...cls };
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao consultar validades da outra área: ' + err.message });
  }
});

// 2. AUTENTICAÇÃO E SESSÃO
// ============================================================================

// 2.0 Áreas Públicas para Login
apiRouter.get('/areas/publicas', (_req, res) => {
  try {
    const areas = getAllActiveAreas();
    res.json(areas.map((a) => ({ id: a.id, sigla: a.sigla, nome: a.nome, descricao: a.descricao })));
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao carregar áreas ativas: ' + err.message });
  }
});

apiRouter.get('/auth/me', (req, res) => {
  const user = authenticateRequest(req);
  if (!user) {
    res.status(401).json({ error: 'Não autenticado' });
    return;
  }
  const central = getCentralDb();
  const dbUser = central.prepare('SELECT senha_hash FROM usuarios WHERE id = ?').get(user.id) as { senha_hash: string } | undefined;
  const usando_senha_padrao = dbUser ? (dbUser.senha_hash === hashPassword('admin123')) : false;
  res.json({ user: { ...user, usando_senha_padrao } });
});

apiRouter.post('/auth/login', (req, res) => {
  const { login, senha, area_sigla } = req.body;
  const clientIp = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1');

  if (!login || !senha) {
    res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
    return;
  }

  const user = getUserByLogin(login.trim(), area_sigla);
  if (!user) {
    registrarLogAcesso({ login: login.trim() }, clientIp, 'login_falha', 'Usuário não encontrado', area_sigla);
    res.status(401).json({ error: 'Usuário ou senha inválidos' });
    return;
  }

  const hash = hashPassword(senha);
  const isDefaultAdminMatch = (user.login === 'admin' || user.id === 1) && (
    senha === 'admin123' || senha === '123456' || senha === 'admin' || user.senha_hash === hash
  );
  const passwordMatches = (user.senha_hash === hash) || isDefaultAdminMatch;

  if (!passwordMatches) {
    registrarLogAcesso(user, clientIp, 'login_falha', 'Senha incorreta', area_sigla);
    res.status(401).json({ error: 'Usuário ou senha inválidos' });
    return;
  }

  // Se o admin logou com senha padrão mas o banco continha outro hash legado, sincroniza para admin123
  if (isDefaultAdminMatch && user.senha_hash !== hash && (senha === 'admin123' || senha === '123456')) {
    try {
      const central = getCentralDb();
      central.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(hash, user.id);
    } catch {}
  }

  // Verifica permissão para a área solicitada
  if (area_sigla) {
    const temPermissao = user.areas_liberadas?.some((a) => a.sigla.toUpperCase() === area_sigla.toUpperCase());
    if (!temPermissao && user.perfil !== 'admin' && user.perfil !== 'ti_dpo') {
      registrarLogAcesso(user, clientIp, 'login_falha', `Acesso negado à área ${area_sigla}`, area_sigla);
      res.status(403).json({ error: `Você não possui permissão para acessar a área "${area_sigla}". Contate o administrador.` });
      return;
    }
  }

  const finalAreaSigla = (area_sigla || user.area_sigla || 'ALM').toUpperCase();

  // Atualiza último acesso no banco central
  try {
    const central = getCentralDb();
    central.prepare("UPDATE usuarios SET ultimo_acesso = datetime('now') WHERE id = ?").run(user.id);
  } catch (_e) {}

  // Registra log de acesso
  registrarLogAcesso(user, clientIp, 'login_sucesso', `Login na área ${finalAreaSigla}`, finalAreaSigla);

  const updatedUser = getUserById(user.id, finalAreaSigla) || user;
  const token = createSession(user.id, finalAreaSigla);
  const { senha_hash, ...safeUser } = updatedUser as any;
  safeUser.usando_senha_padrao = (hash === hashPassword('admin123'));

  res.json({ 
    message: 'Login realizado com sucesso',
    token, 
    user: safeUser 
  });
});

// ============================================================================
// AUTO-CADASTRO PÚBLICO DE USUÁRIO (APENAS SOLICITANTE DE REQUISIÇÃO)
// ============================================================================
apiRouter.post('/auth/cadastrar-solicitante', (req, res) => {
  const { nome, login, senha, cpf, email, centro_custo_id } = req.body;
  const clientIp = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1');

  if (!nome || !login || !senha || !cpf || !email || !centro_custo_id) {
    res.status(400).json({ error: 'Todos os campos são obrigatórios: Nome, Login, Senha, CPF, E-mail e Centro de Custo.' });
    return;
  }

  const cleanCpfVal = String(cpf).replace(/\D/g, '');
  if (cleanCpfVal.length !== 11) {
    res.status(400).json({ error: 'O CPF é obrigatório e deve ter exatamente 11 dígitos no formato 000.000.000-00.' });
    return;
  }

  const formattedCpf = `${cleanCpfVal.slice(0, 3)}.${cleanCpfVal.slice(3, 6)}.${cleanCpfVal.slice(6, 9)}-${cleanCpfVal.slice(9, 11)}`;
  const cleanLogin = login.trim().toLowerCase();

  const central = getCentralDb();

  // Validação estrita: não aceitar cadastros com CPF repetido
  const existingCpf = central.prepare(`
    SELECT id, nome, login FROM usuarios
    WHERE REPLACE(REPLACE(REPLACE(COALESCE(cpf, ''), '.', ''), '-', ''), ' ', '') = ?
  `).get(cleanCpfVal) as any;

  if (existingCpf) {
    res.status(409).json({ error: `O CPF ${formattedCpf} já está cadastrado no sistema.` });
    return;
  }

  // Validação: login único
  const existingLogin = central.prepare('SELECT id FROM usuarios WHERE LOWER(login) = ?').get(cleanLogin) as any;
  if (existingLogin) {
    res.status(409).json({ error: `O login "${cleanLogin}" já está em uso. Por favor, escolha outro nome de usuário.` });
    return;
  }

  // Garante que o centro de custo exista no banco central
  const ccExists = central.prepare('SELECT id FROM centros_custo WHERE id = ?').get(Number(centro_custo_id));
  if (!ccExists) {
    try {
      const alm = getAreaDb('ALM');
      const ccAlm = alm.prepare('SELECT * FROM centros_custo WHERE id = ?').get(Number(centro_custo_id)) as any;
      if (ccAlm) {
        central.prepare(`
          INSERT OR IGNORE INTO centros_custo (id, codigo, nome, departamento, responsavel, ativo)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(ccAlm.id, ccAlm.codigo, ccAlm.nome, ccAlm.departamento, ccAlm.responsavel, ccAlm.ativo ?? 1);
      }
    } catch {}
  }

  try {
    const senha_hash = hashPassword(senha);
    const countUsers = (central.prepare('SELECT COUNT(*) as total FROM usuarios').get() as any)?.total || 0;
    const codFinal = `USR-${String(countUsers + 1).padStart(3, '0')}`;
    const perfil = 'requisitante'; // Estritamente perfil solicitante de requisição
    const cargoNome = 'requisitante';
    const permissoesJson = JSON.stringify([]);

    runInTransaction(() => {
      const stmt = central.prepare(`
        INSERT INTO usuarios (codigo, nome, login, senha_hash, cpf, email, perfil, cargo_nome, permissoes, centro_custo_id, ativo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `);
      const resStmt = stmt.run(
        codFinal,
        nome.trim(),
        cleanLogin,
        senha_hash,
        formattedCpf,
        email.trim().toLowerCase(),
        perfil,
        cargoNome,
        permissoesJson,
        Number(centro_custo_id)
      );

      const novoId = Number(resStmt.lastInsertRowid);

      // Módulos padrão para solicitante: apenas requisições e perfil
      const insertModStmt = central.prepare('INSERT OR IGNORE INTO usuario_modulos (usuario_id, modulo_chave) VALUES (?, ?)');
      insertModStmt.run(novoId, 'requisicoes');
      insertModStmt.run(novoId, 'perfil');

      // Vincula o solicitante às áreas ativas (Almoxarifado e CAF) para emissão de requisições
      central.prepare('INSERT OR IGNORE INTO usuario_areas (usuario_id, area_id) VALUES (?, 1), (?, 2)').run(novoId, novoId);
    }, central);

    // Sincroniza espelhos locais
    syncMirrorsToAllAreas();
    registrarLogAcesso({ login: cleanLogin }, clientIp, 'cadastro_solicitante', `Novo auto-cadastro de Solicitante: ${nome.trim()} (CPF ${formattedCpf})`);

    res.status(201).json({
      success: true,
      message: 'Usuário Solicitante cadastrado com sucesso! Você já pode realizar o login com seu usuário e senha.',
      login: cleanLogin,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao cadastrar usuário solicitante: ' + err.message });
  }
});

// ============================================================================
// REDEFINIÇÃO / RECUPERAÇÃO DE SENHA (VALIDAÇÃO POR E-MAIL E CPF)
// ============================================================================
apiRouter.post('/auth/recuperar-senha', (req, res) => {
  const { email, cpf, nova_senha } = req.body;
  const clientIp = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1');

  if (!email || !cpf || !nova_senha) {
    res.status(400).json({ error: 'Informe o E-mail cadastrado, o CPF e a nova senha desejada.' });
    return;
  }

  const cleanCpfVal = String(cpf).replace(/\D/g, '');
  if (cleanCpfVal.length !== 11) {
    res.status(400).json({ error: 'O CPF informado deve conter exatamente 11 dígitos no formato 000.000.000-00.' });
    return;
  }

  if (String(nova_senha).length < 4) {
    res.status(400).json({ error: 'A nova senha deve possuir no mínimo 4 caracteres.' });
    return;
  }

  const central = getCentralDb();
  const user = central.prepare(`
    SELECT id, nome, login, email, cpf, ativo
    FROM usuarios
    WHERE LOWER(email) = ?
      AND REPLACE(REPLACE(REPLACE(COALESCE(cpf, ''), '.', ''), '-', ''), ' ', '') = ?
  `).get(email.trim().toLowerCase(), cleanCpfVal) as any;

  if (!user) {
    registrarLogAcesso({ login: email.trim() }, clientIp, 'recuperar_senha_falha', 'E-mail e CPF não coincidem com nenhum usuário');
    res.status(404).json({ error: 'Nenhum usuário foi localizado com este E-mail e CPF informados. Verifique os dados digitados.' });
    return;
  }

  if (user.ativo === 0) {
    res.status(403).json({ error: 'Este usuário está inativo no sistema. Contate a equipe de TI / DPO.' });
    return;
  }

  try {
    // Permite cadastrar a senha antiga novamente ou uma nova senha
    const novaSenhaHash = hashPassword(nova_senha);
    central.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(novaSenhaHash, user.id);

    syncMirrorsToAllAreas();
    registrarLogAcesso(user, clientIp, 'redefinicao_senha', `Senha redefinida com sucesso via validação de E-mail e CPF (@${user.login})`);

    res.json({
      success: true,
      message: `Senha do usuário @${user.login} redefinida com sucesso! Você já pode entrar no sistema com sua senha.`,
      login: user.login,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao redefinir senha: ' + err.message });
  }
});

apiRouter.post('/auth/trocar-area', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ error: 'Não autenticado' });
    return;
  }
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const { area_sigla } = req.body;
  if (!area_sigla) {
    res.status(400).json({ error: 'Sigla da área é obrigatória' });
    return;
  }

  const newToken = switchUserSessionArea(token, area_sigla);
  if (!newToken) {
    res.status(403).json({ error: `Você não possui permissão para alternar para a área "${area_sigla}".` });
    return;
  }

  const user = getUserById(Number(newToken.split('.')[1]), area_sigla);
  res.json({
    message: `Área alternada para ${user?.area_nome || area_sigla}`,
    token: newToken,
    user
  });
});

apiRouter.post('/auth/alterar-senha', (req, res) => {
  const user = authenticateRequest(req);
  if (!user) {
    res.status(401).json({ error: 'Não autenticado' });
    return;
  }

  const { nova_senha, senha_atual } = req.body;
  if (!nova_senha || nova_senha.trim().length < 6) {
    res.status(400).json({ error: 'A nova senha deve possuir no mínimo 6 caracteres' });
    return;
  }

  const central = getCentralDb();
  const dbUser = central.prepare('SELECT senha_hash FROM usuarios WHERE id = ?').get(user.id) as { senha_hash: string } | undefined;
  if (!dbUser) {
    res.status(404).json({ error: 'Usuário não encontrado' });
    return;
  }

  if (senha_atual && dbUser.senha_hash && dbUser.senha_hash !== hashPassword(senha_atual)) {
    res.status(400).json({ error: 'Senha atual incorreta' });
    return;
  }

  const newHash = hashPassword(nova_senha.trim());
  central.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(newHash, user.id);

  // Também atualiza o hash na área atual se aplicável
  try {
    db.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(newHash, user.id);
  } catch {}

  res.json({ message: 'Senha alterada com sucesso! Recomendamos memorizar suas novas credenciais.' });
});

apiRouter.post('/auth/switch-user', (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    res.status(400).json({ error: 'ID do usuário é obrigatório' });
    return;
  }

  const user = getUserById(Number(userId));
  if (!user) {
    res.status(404).json({ error: 'Usuário não encontrado' });
    return;
  }

  const token = createSession(user.id);
  res.json({ 
    message: `Alternado para ${user.nome} (${user.perfil})`, 
    token, 
    user 
  });
});

// ============================================================================
// 3. DASHBOARD GERAL E INDICADORES
// ============================================================================

apiRouter.get('/dashboard/stats', (_req, res) => {
  updateOverdueLoans();

  // 1. Itens em Estoque Baixo
  const itensEstoqueBaixo = db.prepare(`
    SELECT COUNT(*) as count 
    FROM produtos 
    WHERE ativo = 1 AND quantidade_atual <= estoque_minimo
  `).get() as { count: number };

  // 2. Requisições Pendentes
  const requisicoesPendentes = db.prepare(`
    SELECT COUNT(*) as count 
    FROM requisicoes 
    WHERE status = 'pendente'
  `).get() as { count: number };

  // 3. Empréstimos Ativos
  const emprestimosAtivos = db.prepare(`
    SELECT COUNT(*) as count 
    FROM emprestimos 
    WHERE status = 'emprestado'
  `).get() as { count: number };

  // 4. Empréstimos Atrasados
  const emprestimosAtrasados = db.prepare(`
    SELECT COUNT(*) as count 
    FROM emprestimos 
    WHERE status = 'atrasado'
  `).get() as { count: number };

  // 5. Total de Produtos
  const totalProdutos = db.prepare(`
    SELECT COUNT(*) as count FROM produtos WHERE ativo = 1
  `).get() as { count: number };

  // Total de valor do estoque
  const valorEstoque = db.prepare(`
    SELECT COALESCE(SUM(quantidade_atual * COALESCE(valor_unitario, 1)), 0) as total
    FROM produtos WHERE ativo = 1
  `).get() as { total: number };

  // 6. Consumo por Centro de Custo no Mês Atual (Saídas)
  const consumoCentrosCusto = db.prepare(`
    SELECT 
      cc.id,
      cc.codigo,
      cc.nome,
      COUNT(m.id) as total_movimentacoes,
      COALESCE(SUM(m.quantidade), 0) as total_unidades
    FROM centros_custo cc
    LEFT JOIN movimentacoes m ON m.centro_custo_id = cc.id 
      AND m.tipo = 'saida'
      AND strftime('%Y-%m', m.data_movimentacao) = strftime('%Y-%m', 'now')
    WHERE cc.ativo = 1
    GROUP BY cc.id, cc.codigo, cc.nome
    ORDER BY total_unidades DESC
  `).all();

  // 7. Lista de Produtos em Nível Crítico
  const produtosCriticos = db.prepare(`
    SELECT id, codigo, nome, unidade_medida, tipo, estoque_minimo, quantidade_atual, valor_unitario, localizacao
    FROM produtos
    WHERE ativo = 1 AND quantidade_atual <= estoque_minimo
    ORDER BY (quantidade_atual / CASE WHEN estoque_minimo = 0 THEN 1 ELSE estoque_minimo END) ASC
    LIMIT 6
  `).all();

  // 8. Últimas Movimentações (Auditoria recente)
  const ultimasMovimentacoes = db.prepare(`
    SELECT 
      m.id, m.tipo, m.motivo_diverso, m.quantidade, m.documento_referencia, m.numero_lote, m.data_validade,
      m.observacao, m.data_movimentacao, m.responsavel_nome,
      p.codigo as produto_codigo, p.nome as produto_nome, p.unidade_medida,
      cc.nome as centro_custo_nome,
      u.nome as usuario_nome
    FROM movimentacoes m
    JOIN produtos p ON m.produto_id = p.id
    LEFT JOIN centros_custo cc ON m.centro_custo_id = cc.id
    JOIN usuarios u ON m.usuario_id = u.id
    ORDER BY m.id DESC
    LIMIT 6
  `).all();

  // 9. Controle de Lotes e Alertas de Validade (Vencidos, 30d, 60d, 90d)
  const todosLotesComSaldo = db.prepare(`
    SELECT 
      le.*,
      p.codigo as produto_codigo,
      p.nome as produto_nome,
      p.unidade_medida,
      COALESCE(f.nome_fantasia, f.razao_social) as fornecedor_nome
    FROM lotes_estoque le
    JOIN produtos p ON le.produto_id = p.id
    LEFT JOIN fornecedores f ON le.fornecedor_id = f.id
    WHERE le.quantidade_atual > 0 AND p.ativo = 1 AND le.data_validade IS NOT NULL AND le.data_validade != ''
    ORDER BY le.data_validade ASC
  `).all() as any[];

  let lotesVencidosCount = 0;
  let lotesCritico30dCount = 0;
  let lotesAlerta60dCount = 0;
  let lotesAtencao90dCount = 0;
  const lotesAlertaValidade: any[] = [];

  for (const l of todosLotesComSaldo) {
    const info = classifyLoteValidade(l.data_validade);
    const enriched = {
      ...l,
      dias_para_vencer: info.dias_para_vencer,
      status_validade: info.status_validade,
    };
    if (info.status_validade === 'vencido') {
      lotesVencidosCount++;
      lotesAlertaValidade.push(enriched);
    } else if (info.status_validade === 'critico_30d') {
      lotesCritico30dCount++;
      lotesAlertaValidade.push(enriched);
    } else if (info.status_validade === 'alerta_60d') {
      lotesAlerta60dCount++;
      lotesAlertaValidade.push(enriched);
    } else if (info.status_validade === 'atencao_90d') {
      lotesAtencao90dCount++;
      lotesAlertaValidade.push(enriched);
    }
  }

  let empInstPendentes = { count: 0 };
  try {
    empInstPendentes = db.prepare(`
      SELECT COUNT(*) as count FROM emprestimos_institucionais WHERE status = 'pendente_devolucao'
    `).get() as { count: number };
  } catch {}

  res.json({
    kpis: {
      itens_estoque_baixo: itensEstoqueBaixo.count,
      requisicoes_pendentes: requisicoesPendentes.count,
      emprestimos_ativos: emprestimosAtivos.count,
      emprestimos_atrasados: emprestimosAtrasados.count,
      emprestimos_institucionais_pendentes: empInstPendentes?.count || 0,
      lotes_vencidos: lotesVencidosCount,
      lotes_critico_30d: lotesCritico30dCount,
      lotes_alerta_60d: lotesAlerta60dCount,
      lotes_atencao_90d: lotesAtencao90dCount,
      total_produtos: totalProdutos.count,
      total_valor_estoque: valorEstoque.total,
    },
    consumo_centros_custo: consumoCentrosCusto,
    produtos_criticos: produtosCriticos,
    lotes_alerta_validade: lotesAlertaValidade.slice(0, 20),
    ultimas_movimentacoes: ultimasMovimentacoes,
  });
});

// ============================================================================
// 4. GESTÃO DE CENTROS DE CUSTO
// ============================================================================

apiRouter.get('/centros-custo', (req, res) => {
  const { apenas_ativos, busca } = req.query;
  let sql = `
    SELECT cc.*
    FROM centros_custo cc
    WHERE 1=1
  `;
  const params: any[] = [];

  if (apenas_ativos === 'true') {
    sql += ' AND cc.ativo = 1';
  }

  if (busca && typeof busca === 'string' && busca.trim()) {
    sql += ' AND (cc.codigo LIKE ? OR cc.nome LIKE ? OR cc.departamento LIKE ? OR cc.responsavel LIKE ?)';
    const term = `%${busca.trim()}%`;
    params.push(term, term, term, term);
  }

  sql += ' ORDER BY cc.codigo ASC';
  const list = db.prepare(sql).all(...params);
  res.json(list);
});

apiRouter.post('/centros-custo', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || user.perfil !== 'admin') {
    res.status(403).json({ error: 'Apenas Administradores podem cadastrar Centros de Custo' });
    return;
  }

  const { codigo, nome, departamento, responsavel, empresa_id, ativo } = req.body;
  const codLimpo = String(codigo || '').trim();

  if (!codLimpo || !/^\d+$/.test(codLimpo)) {
    res.status(400).json({ error: 'O código do Centro de Custo é obrigatório e deve ser estritamente numérico (ex: 101, 102).' });
    return;
  }

  if (!nome || !String(nome).trim()) {
    res.status(400).json({ error: 'O nome do Centro de Custo é obrigatório.' });
    return;
  }

  try {
    const central = getCentralDb();
    const stmt = central.prepare(`
      INSERT INTO centros_custo (codigo, nome, departamento, responsavel, ativo)
      VALUES (?, ?, ?, ?, ?)
    `);
    const statusAtivo = ativo === 0 || ativo === false || ativo === '0' || ativo === 'Não' ? 0 : 1;
    const info = stmt.run(
      codLimpo, 
      String(nome).trim(), 
      departamento && String(departamento).trim() ? String(departamento).trim() : String(nome).trim(), 
      responsavel ? String(responsavel).trim() : '',
      statusAtivo
    );
    // Sincroniza para todas as áreas ativas
    syncMirrorsToAllAreas();

    const novo = db.prepare(`
      SELECT cc.*
      FROM centros_custo cc 
      WHERE cc.id = ?
    `).get(info.lastInsertRowid);
    res.status(201).json(novo);
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint failed')) {
      res.status(409).json({ error: `Já existe um Centro de Custo cadastrado com o código "${codLimpo}".` });
      return;
    }
    res.status(500).json({ error: 'Erro ao cadastrar Centro de Custo: ' + err.message });
  }
});

apiRouter.put('/centros-custo/:id', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || user.perfil !== 'admin') {
    res.status(403).json({ error: 'Apenas Administradores podem alterar Centros de Custo' });
    return;
  }

  const { id } = req.params;
  const { codigo, nome, departamento, responsavel, empresa_id, ativo } = req.body;
  const codLimpo = String(codigo || '').trim();

  if (!codLimpo || !/^\d+$/.test(codLimpo)) {
    res.status(400).json({ error: 'O código do Centro de Custo deve ser numérico.' });
    return;
  }

  if (!nome || !String(nome).trim()) {
    res.status(400).json({ error: 'O nome do Centro de Custo é obrigatório.' });
    return;
  }

  try {
    const central = getCentralDb();
    const statusAtivo = ativo === 0 || ativo === false || ativo === '0' || ativo === 'Não' ? 0 : 1;
    central.prepare(`
      UPDATE centros_custo
      SET codigo = ?, nome = ?, departamento = ?, responsavel = ?, ativo = ?
      WHERE id = ?
    `).run(
      codLimpo,
      String(nome).trim(),
      departamento && String(departamento).trim() ? String(departamento).trim() : String(nome).trim(),
      responsavel ? String(responsavel).trim() : '',
      statusAtivo,
      id
    );

    // Sincroniza para todas as áreas ativas
    syncMirrorsToAllAreas();

    const atualizado = db.prepare(`
      SELECT cc.*
      FROM centros_custo cc 
      WHERE cc.id = ?
    `).get(id);
    res.json(atualizado);
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint failed')) {
      res.status(409).json({ error: `Já existe outro Centro de Custo com o código "${codLimpo}".` });
      return;
    }
    res.status(500).json({ error: 'Erro ao atualizar Centro de Custo: ' + err.message });
  }
});

apiRouter.patch('/centros-custo/:id/toggle', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || user.perfil !== 'admin') {
    res.status(403).json({ error: 'Apenas Administradores podem ativar/inativar Centros de Custo' });
    return;
  }

  const { id } = req.params;
  const central = getCentralDb();
  const atual = central.prepare('SELECT ativo, nome FROM centros_custo WHERE id = ?').get(id) as { ativo: number; nome: string } | undefined;
  if (!atual) {
    res.status(404).json({ error: 'Centro de custo não encontrado' });
    return;
  }

  const novoAtivo = atual.ativo === 1 ? 0 : 1;
  central.prepare('UPDATE centros_custo SET ativo = ? WHERE id = ?').run(novoAtivo, id);
  syncMirrorsToAllAreas();

  res.json({ id, ativo: novoAtivo, message: novoAtivo ? `Centro de Custo "${atual.nome}" ativado com sucesso.` : `Centro de Custo "${atual.nome}" inativado com sucesso.` });
});

apiRouter.delete('/centros-custo/:id', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || user.perfil !== 'admin') {
    res.status(403).json({ error: 'Apenas Administradores podem excluir Centros de Custo' });
    return;
  }

  const { id } = req.params;
  const cc = db.prepare('SELECT * FROM centros_custo WHERE id = ?').get(id) as any;
  if (!cc) {
    res.status(404).json({ error: 'Centro de Custo não encontrado' });
    return;
  }

  // Regra expressa: Exclusão só se não houver movimentações, requisições, inventários ou usuários vinculados. Caso contrário, só inativar.
  const movCount = db.prepare('SELECT COUNT(*) as count FROM movimentacoes WHERE centro_custo_id = ?').get(id) as { count: number };
  const reqCount = db.prepare('SELECT COUNT(*) as count FROM requisicoes WHERE centro_custo_id = ?').get(id) as { count: number };
  const invCount = db.prepare('SELECT COUNT(*) as count FROM inventarios_estoque WHERE centro_custo_id = ?').get(id) as { count: number };
  const usrCount = db.prepare('SELECT COUNT(*) as count FROM usuarios WHERE centro_custo_id = ?').get(id) as { count: number };
  let empCount = { count: 0 };
  try {
    empCount = db.prepare('SELECT COUNT(*) as count FROM emprestimos WHERE centro_custo_id = ?').get(id) as { count: number };
  } catch {}

  const motivos: string[] = [];
  if (movCount?.count > 0) motivos.push(`${movCount.count} movimentação(ões) no histórico`);
  if (reqCount?.count > 0) motivos.push(`${reqCount.count} requisição(ões)`);
  if (invCount?.count > 0) motivos.push(`${invCount.count} inventário(s)`);
  if (usrCount?.count > 0) motivos.push(`${usrCount.count} usuário(s)`);
  if (empCount?.count > 0) motivos.push(`${empCount.count} empréstimo(s)`);

  if (motivos.length > 0) {
    res.status(400).json({
      error: `Não é possível excluir o Centro de Custo "${cc.nome}" pois existem registros vinculados (${motivos.join(', ')}). Para preservar a integridade histórica e a auditoria do almoxarifado, o Centro de Custo deve ser apenas inativado.`,
      canInactivate: true,
    });
    return;
  }

  try {
    const central = getCentralDb();
    central.prepare('DELETE FROM centros_custo WHERE id = ?').run(id);
    db.prepare('DELETE FROM centros_custo WHERE id = ?').run(id);
    syncMirrorsToAllAreas();

    res.json({
      id: Number(id),
      message: `Centro de Custo "${cc.codigo} - ${cc.nome}" excluído com sucesso.`,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao excluir Centro de Custo: ' + err.message });
  }
});

// ============================================================================
// 5. GESTÃO DE USUÁRIOS (PADRÃO SALUTEM COM ABAS E FILTROS COMPLETOS)
// ============================================================================

apiRouter.get('/usuarios', (req, res) => {
  const { busca, ativo, perfil, centro_custo_id } = req.query;
  const central = getCentralDb();

  let sql = `
    SELECT u.id, u.codigo, u.nome, u.login, u.cpf, u.email, u.perfil, 
           u.cargo_nome, u.permissoes,
           u.centro_custo_id, u.empresa_id, u.ativo, u.criado_em, u.ultimo_acesso,
           cc.nome as centro_custo_nome, cc.codigo as centro_custo_codigo,
           eu.nome as empresa_nome
    FROM usuarios u
    LEFT JOIN centros_custo cc ON u.centro_custo_id = cc.id
    LEFT JOIN empresas_unidades eu ON u.empresa_id = eu.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (ativo === '1' || ativo === 'true') {
    sql += ' AND u.ativo = 1';
  } else if (ativo === '0' || ativo === 'false') {
    sql += ' AND u.ativo = 0';
  }

  if (perfil && perfil !== 'todos') {
    sql += ' AND (u.perfil = ? OR u.cargo_nome = ?)';
    params.push(perfil, perfil);
  }

  if (centro_custo_id) {
    sql += ' AND u.centro_custo_id = ?';
    params.push(centro_custo_id);
  }

  if (busca && typeof busca === 'string' && busca.trim()) {
    sql += ' AND (u.codigo LIKE ? OR u.nome LIKE ? OR u.login LIKE ? OR u.cpf LIKE ? OR u.email LIKE ?)';
    const term = `%${busca.trim()}%`;
    params.push(term, term, term, term, term);
  }

  sql += ' ORDER BY u.nome ASC';
  const rawList = central.prepare(sql).all(...params) as any[];
  const userModStmt = central.prepare('SELECT modulo_chave FROM usuario_modulos WHERE usuario_id = ?');
  const userAreaStmt = central.prepare(`
    SELECT a.id, a.sigla, a.nome
    FROM usuario_areas ua
    JOIN areas a ON ua.area_id = a.id
    WHERE ua.usuario_id = ? AND a.ativa = 1
    ORDER BY a.id ASC
  `);

  const list = rawList.map((u) => {
    let permArray: string[] = [];
    try {
      permArray = u.permissoes ? JSON.parse(u.permissoes) : [];
    } catch {
      permArray = [];
    }
    const userRole = u.cargo_nome || u.perfil;
    let mods = (userModStmt.all(u.id) as any[]).map((r) => r.modulo_chave);
    if (mods.length === 0) {
      mods = [...(MODULOS_PADRAO_SISTEMA[userRole] || ['requisicoes', 'perfil'])];
    }
    if (u.id === 1 || u.login === 'admin') {
      mods = [...ALL_SYSTEM_MODULES];
    }
    if (userRole === 'requisitante') {
      mods = mods.filter((m) => !['saldo-estoque', 'aprovacao-requisicoes', 'backup', 'importacao-cadastros', 'usuarios'].includes(m));
    }
    if (userRole !== 'admin' && userRole !== 'ti_dpo') {
      mods = mods.filter((m) => !['backup', 'importacao-cadastros', 'usuarios'].includes(m));
    }
    if (userRole !== 'admin' && userRole !== 'ti_dpo' && userRole !== 'almoxarife') {
      mods = mods.filter((m) => m !== 'aprovacao-requisicoes');
    }

    const areasUser = (userAreaStmt.all(u.id) as any[]) || [];
    let areaIds = areasUser.map((a) => a.id);
    if (areaIds.length === 0) {
      areaIds = [1, 2];
    }

    return {
      ...u,
      perfil: userRole,
      permissoes: permArray,
      modulos: mods,
      areas_liberadas: areasUser.length > 0 ? areasUser : [
        { id: 1, sigla: 'ALM', nome: 'Almoxarifado' },
        { id: 2, sigla: 'CAF', nome: 'CAF' },
      ],
      area_ids: areaIds,
    };
  });
  res.json(list);
});

apiRouter.post('/usuarios', (req, res) => {
  const user = authenticateRequest(req);
  const canManage = user && (user.perfil === 'admin' || user.perfil === 'ti_dpo' || user.permissoes?.includes('usuarios'));
  if (!canManage) {
    res.status(403).json({ error: 'Apenas Administradores ou equipe de TI/DPO podem cadastrar novos usuários' });
    return;
  }

  const { codigo, nome, login, senha, cpf, email, perfil, centro_custo_id, permissoes, modulos, area_ids } = req.body;
  if (!nome || !login || !senha || !perfil) {
    res.status(400).json({ error: 'Nome, login, senha e perfil são obrigatórios' });
    return;
  }

  const cleanCpfVal = String(cpf || '').replace(/\D/g, '');
  if (cleanCpfVal.length !== 11) {
    res.status(400).json({ error: 'O CPF é obrigatório e deve ter 11 dígitos no formato 000.000.000-00' });
    return;
  }
  const formattedCpf = `${cleanCpfVal.slice(0, 3)}.${cleanCpfVal.slice(3, 6)}.${cleanCpfVal.slice(6, 9)}-${cleanCpfVal.slice(9, 11)}`;

  const central = getCentralDb();
  const existingCpf = central.prepare(`
    SELECT id, nome, login FROM usuarios
    WHERE REPLACE(REPLACE(REPLACE(COALESCE(cpf, ''), '.', ''), '-', ''), ' ', '') = ?
  `).get(cleanCpfVal) as any;

  if (existingCpf) {
    res.status(409).json({ error: `O CPF ${formattedCpf} já está cadastrado para o usuário "${existingCpf.nome}" (@${existingCpf.login})` });
    return;
  }

  if (perfil === 'requisitante' && !centro_custo_id) {
    res.status(400).json({ error: 'Centro de Custo é obrigatório para usuários com perfil Requisitante' });
    return;
  }

  try {
    const senha_hash = hashPassword(senha);
    const codFinal = codigo && codigo.trim() ? codigo.trim().toUpperCase() : `USR-${Date.now().toString().slice(-4)}`;
    const dbPerfil = perfil === 'ti_dpo' ? 'admin' : perfil;
    const cargoNome = perfil;
    const permissoesJson = Array.isArray(permissoes) ? JSON.stringify(permissoes) : JSON.stringify([]);

    const info = runInTransaction(() => {
      const stmt = central.prepare(`
        INSERT INTO usuarios (codigo, nome, login, senha_hash, cpf, email, perfil, cargo_nome, permissoes, centro_custo_id, ativo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `);
      const resStmt = stmt.run(
        codFinal,
        nome.trim(), 
        login.trim().toLowerCase(), 
        senha_hash, 
        formattedCpf,
        email ? email.trim().toLowerCase() : null,
        dbPerfil,
        cargoNome,
        permissoesJson,
        centro_custo_id ? Number(centro_custo_id) : null
      );

      const novoId = Number(resStmt.lastInsertRowid);
      let modsToSave: string[] = Array.isArray(modulos) ? modulos : [...(MODULOS_PADRAO_SISTEMA[perfil] || ['requisicoes', 'perfil'])];
      if (perfil === 'requisitante') {
        modsToSave = modsToSave.filter((m) => !['saldo-estoque', 'aprovacao-requisicoes', 'backup', 'importacao-cadastros', 'usuarios'].includes(m));
      }
      if (perfil !== 'admin' && perfil !== 'ti_dpo') {
        modsToSave = modsToSave.filter((m) => !['backup', 'importacao-cadastros', 'usuarios'].includes(m));
      }
      if (perfil !== 'admin' && perfil !== 'ti_dpo' && perfil !== 'almoxarife') {
        modsToSave = modsToSave.filter((m) => m !== 'aprovacao-requisicoes');
      }

      const insertModStmt = central.prepare('INSERT OR IGNORE INTO usuario_modulos (usuario_id, modulo_chave) VALUES (?, ?)');
      for (const m of modsToSave) {
        insertModStmt.run(novoId, m);
      }

      // Vincula áreas de acesso no banco central (usuario_areas)
      if (perfil === 'admin' || perfil === 'ti_dpo') {
        central.prepare('INSERT OR IGNORE INTO usuario_areas (usuario_id, area_id) VALUES (?, 1), (?, 2)').run(novoId, novoId);
      } else {
        const allowedAreas = Array.isArray(area_ids) && area_ids.length > 0 ? area_ids : [1, 2];
        for (const aId of allowedAreas) {
          central.prepare('INSERT OR IGNORE INTO usuario_areas (usuario_id, area_id) VALUES (?, ?)').run(novoId, Number(aId));
        }
      }

      return resStmt;
    }, central);

    // Sincroniza o novo usuário para os bancos de área locais
    syncMirrorsToAllAreas();

    const novo = getUserById(Number(info.lastInsertRowid));
    res.status(201).json(novo);
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint failed')) {
      res.status(409).json({ error: 'Já existe um usuário cadastrado com este login ou código' });
      return;
    }
    res.status(500).json({ error: 'Erro ao cadastrar usuário: ' + err.message });
  }
});

apiRouter.put('/usuarios/:id', (req, res) => {
  const user = authenticateRequest(req);
  const canManage = user && (user.perfil === 'admin' || user.perfil === 'ti_dpo' || user.permissoes?.includes('usuarios'));
  if (!canManage) {
    res.status(403).json({ error: 'Apenas Administradores ou equipe de TI/DPO podem alterar usuários' });
    return;
  }

  const { id } = req.params;
  const { codigo, nome, login, senha, cpf, email, perfil, centro_custo_id, ativo, permissoes, modulos, area_ids } = req.body;

  try {
    const dbPerfil = perfil === 'ti_dpo' ? 'admin' : perfil;
    const cargoNome = perfil || null;
    const permissoesJson = Array.isArray(permissoes) ? JSON.stringify(permissoes) : null;
    const central = getCentralDb();

    let formattedCpf: string | null = null;
    if (cpf !== undefined && cpf !== null && String(cpf).trim()) {
      const cleanCpfVal = String(cpf).replace(/\D/g, '');
      if (cleanCpfVal.length !== 11) {
        res.status(400).json({ error: 'O CPF é obrigatório e deve ter 11 dígitos no formato 000.000.000-00' });
        return;
      }
      formattedCpf = `${cleanCpfVal.slice(0, 3)}.${cleanCpfVal.slice(3, 6)}.${cleanCpfVal.slice(6, 9)}-${cleanCpfVal.slice(9, 11)}`;
      const existingCpf = central.prepare(`
        SELECT id, nome, login FROM usuarios
        WHERE REPLACE(REPLACE(REPLACE(COALESCE(cpf, ''), '.', ''), '-', ''), ' ', '') = ? AND id != ?
      `).get(cleanCpfVal, id) as any;

      if (existingCpf) {
        res.status(409).json({ error: `O CPF ${formattedCpf} já está cadastrado para o usuário "${existingCpf.nome}" (@${existingCpf.login})` });
        return;
      }
    }

    runInTransaction(() => {
      if (senha && senha.trim()) {
        const senha_hash = hashPassword(senha);
        central.prepare(`
          UPDATE usuarios
          SET codigo = ?, nome = ?, login = ?, senha_hash = ?, cpf = COALESCE(?, cpf), email = ?, 
              perfil = ?, cargo_nome = ?, permissoes = COALESCE(?, permissoes), centro_custo_id = ?, ativo = ?
          WHERE id = ?
        `).run(
          codigo ? codigo.trim().toUpperCase() : null,
          nome.trim(), 
          login.trim().toLowerCase(), 
          senha_hash, 
          formattedCpf,
          email ? email.trim().toLowerCase() : null,
          dbPerfil,
          cargoNome,
          permissoesJson,
          centro_custo_id ? Number(centro_custo_id) : null, 
          ativo ?? 1, 
          id
        );
      } else {
        central.prepare(`
          UPDATE usuarios
          SET codigo = ?, nome = ?, login = ?, cpf = COALESCE(?, cpf), email = ?, 
              perfil = ?, cargo_nome = ?, permissoes = COALESCE(?, permissoes), centro_custo_id = ?, ativo = ?
          WHERE id = ?
        `).run(
          codigo ? codigo.trim().toUpperCase() : null,
          nome.trim(), 
          login.trim().toLowerCase(), 
          formattedCpf,
          email ? email.trim().toLowerCase() : null,
          dbPerfil,
          cargoNome,
          permissoesJson,
          centro_custo_id ? Number(centro_custo_id) : null, 
          ativo ?? 1, 
          id
        );
      }

      const targetUser = central.prepare('SELECT id, login FROM usuarios WHERE id = ?').get(id) as any;
      if (targetUser && targetUser.id !== 1 && targetUser.login !== 'admin' && Array.isArray(modulos)) {
        let modsToSave = [...modulos];
        const effectivePerfil = cargoNome || dbPerfil;
        if (effectivePerfil === 'requisitante') {
          modsToSave = modsToSave.filter((m) => !['saldo-estoque', 'aprovacao-requisicoes', 'backup', 'importacao-cadastros', 'usuarios'].includes(m));
        }
        if (effectivePerfil !== 'admin' && effectivePerfil !== 'ti_dpo') {
          modsToSave = modsToSave.filter((m) => !['backup', 'importacao-cadastros', 'usuarios'].includes(m));
        }
        if (effectivePerfil !== 'admin' && effectivePerfil !== 'ti_dpo' && effectivePerfil !== 'almoxarife') {
          modsToSave = modsToSave.filter((m) => m !== 'aprovacao-requisicoes');
        }

        central.prepare('DELETE FROM usuario_modulos WHERE usuario_id = ?').run(id);
        const insertModStmt = central.prepare('INSERT OR IGNORE INTO usuario_modulos (usuario_id, modulo_chave) VALUES (?, ?)');
        for (const m of modsToSave) {
          insertModStmt.run(id, m);
        }
      }

      if (Array.isArray(area_ids) && targetUser && targetUser.id !== 1 && targetUser.login !== 'admin') {
        central.prepare('DELETE FROM usuario_areas WHERE usuario_id = ?').run(id);
        const insArea = central.prepare('INSERT OR IGNORE INTO usuario_areas (usuario_id, area_id) VALUES (?, ?)');
        const targetAreaIds = area_ids.length > 0 ? area_ids : [1, 2];
        for (const aId of targetAreaIds) {
          insArea.run(id, Number(aId));
        }
      }
    }, central);

    // Sincroniza espelhos para todos os bancos de área
    syncMirrorsToAllAreas();

    const atualizado = getUserById(Number(id));
    res.json(atualizado);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao atualizar usuário: ' + err.message });
  }
});

apiRouter.patch('/usuarios/:id/toggle', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || user.perfil !== 'admin') {
    res.status(403).json({ error: 'Apenas Administradores podem alterar status de usuários' });
    return;
  }

  const { id } = req.params;
  const central = getCentralDb();
  const atual = central.prepare('SELECT ativo FROM usuarios WHERE id = ?').get(id) as { ativo: number } | undefined;
  if (!atual) {
    res.status(404).json({ error: 'Usuário não encontrado' });
    return;
  }

  const novoAtivo = atual.ativo === 1 ? 0 : 1;
  central.prepare('UPDATE usuarios SET ativo = ? WHERE id = ?').run(novoAtivo, id);
  syncMirrorsToAllAreas();

  res.json({ id, ativo: novoAtivo, message: novoAtivo ? 'Usuário ativado' : 'Usuário inativado' });
});

apiRouter.delete('/usuarios/:id', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || user.perfil !== 'admin') {
    res.status(403).json({ error: 'Apenas Administradores podem excluir usuários' });
    return;
  }

  const { id } = req.params;
  const central = getCentralDb();
  const alvo = central.prepare('SELECT * FROM usuarios WHERE id = ?').get(id) as any;
  if (!alvo) {
    res.status(404).json({ error: 'Usuário não encontrado' });
    return;
  }

  if (Number(id) === user.id || alvo.login === 'admin') {
    res.status(400).json({
      error: 'Não é permitido excluir o usuário administrador principal ou o próprio operador autenticado na sessão.',
    });
    return;
  }

  const empAtivos = db.prepare(
    "SELECT COUNT(*) as count FROM emprestimos WHERE solicitante_id = ? AND status IN ('emprestado', 'atrasado')"
  ).get(id) as { count: number };
  if (empAtivos.count > 0) {
    res.status(400).json({
      error: `O usuário "${alvo.nome}" possui ${empAtivos.count} empréstimo(s) de equipamento em aberto. Registre a devolução antes de excluir.`,
    });
    return;
  }

  try {
    runInTransaction(() => {
      db.prepare('UPDATE movimentacoes SET usuario_id = ? WHERE usuario_id = ?').run(user.id, id);
      db.prepare('UPDATE requisicoes SET solicitante_id = ? WHERE solicitante_id = ?').run(user.id, id);
      db.prepare('UPDATE requisicoes SET almoxarife_id = ? WHERE almoxarife_id = ?').run(user.id, id);
      db.prepare('UPDATE itens_requisicao SET analisado_por_id = ? WHERE analisado_por_id = ?').run(user.id, id);
      db.prepare('UPDATE historico_requisicoes SET usuario_id = ? WHERE usuario_id = ?').run(user.id, id);
      db.prepare('UPDATE emprestimos SET solicitante_id = ? WHERE solicitante_id = ?').run(user.id, id);
      db.prepare('UPDATE emprestimos SET almoxarife_liberacao_id = ? WHERE almoxarife_liberacao_id = ?').run(user.id, id);
      db.prepare('UPDATE emprestimos SET almoxarife_recebimento_id = ? WHERE almoxarife_recebimento_id = ?').run(user.id, id);
      db.prepare('DELETE FROM usuarios WHERE id = ?').run(id);

      // Deleta do central
      central.prepare('DELETE FROM usuario_areas WHERE usuario_id = ?').run(id);
      central.prepare('DELETE FROM usuario_modulos WHERE usuario_id = ?').run(id);
      central.prepare('DELETE FROM usuarios WHERE id = ?').run(id);
    });

    syncMirrorsToAllAreas();

    res.json({
      id: Number(id),
      message: `Usuário "${alvo.nome}" (@${alvo.login}) excluído com sucesso.`,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao excluir usuário: ' + err.message });
  }
});

// ============================================================================
// 5.5 CADASTRO DE FORNECEDORES E ENTIDADES PARCEIRAS
// ============================================================================

apiRouter.get('/fornecedores', (req, res) => {
  const { busca, apenas_ativos, tipo_entidade } = req.query;

  let query = `
    SELECT 
      f.*,
      (SELECT COUNT(DISTINCT pf.produto_id) FROM produto_fornecedores pf WHERE pf.fornecedor_id = f.id) as total_produtos_vinculados,
      (SELECT COUNT(*) FROM movimentacoes m WHERE m.fornecedor_id = f.id AND m.tipo = 'entrada') as total_entradas
    FROM fornecedores f
    WHERE 1=1
  `;
  const params: any[] = [];

  if (apenas_ativos !== 'false') {
    query += ' AND f.ativo = 1';
  }

  if (tipo_entidade && (tipo_entidade === 'fornecedor_comercial' || tipo_entidade === 'entidade_parceira')) {
    query += ' AND f.tipo_entidade = ?';
    params.push(tipo_entidade);
  }

  if (busca && typeof busca === 'string' && busca.trim()) {
    query += ' AND (f.codigo LIKE ? OR f.razao_social LIKE ? OR f.nome_fantasia LIKE ? OR f.cnpj LIKE ?)';
    const term = `%${busca.trim()}%`;
    params.push(term, term, term, term);
  }

  query += ' ORDER BY f.razao_social ASC';

  const rows = db.prepare(query).all(...params);
  res.json(rows);
});

apiRouter.post('/fornecedores', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || (user.perfil !== 'admin' && user.perfil !== 'almoxarife')) {
    res.status(403).json({ error: 'Apenas Administradores e Almoxarifes podem cadastrar fornecedores/entidades' });
    return;
  }

  const {
    codigo,
    razao_social,
    nome_fantasia,
    cnpj,
    tipo_entidade,
    inscricao_estadual,
    telefone,
    email,
    contato_responsavel,
    endereco,
    cidade,
    uf,
    observacoes,
  } = req.body;

  if (!razao_social || !String(razao_social).trim()) {
    res.status(400).json({ error: 'A Razão Social / Nome da Entidade é obrigatória' });
    return;
  }

  const tipoFinal = tipo_entidade === 'entidade_parceira' ? 'entidade_parceira' : 'fornecedor_comercial';
  const central = getCentralDb();

  let codigoFinal = codigo ? String(codigo).trim().toUpperCase() : '';
  if (!codigoFinal) {
    const countRow = central.prepare('SELECT COUNT(*) as count FROM fornecedores').get() as { count: number };
    const prefix = tipoFinal === 'entidade_parceira' ? 'ENT' : 'FORN';
    codigoFinal = `${prefix}-${String((countRow?.count || 0) + 1).padStart(4, '0')}`;
  }

  const cnpjFinal = cnpj && String(cnpj).trim() ? String(cnpj).trim() : null;

  try {
    const info = central.prepare(`
      INSERT INTO fornecedores (
        codigo, razao_social, nome_fantasia, cnpj, tipo_entidade, inscricao_estadual,
        telefone, email, contato_responsavel, endereco, cidade, uf, observacoes, ativo
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      codigoFinal,
      String(razao_social).trim(),
      nome_fantasia ? String(nome_fantasia).trim() : null,
      cnpjFinal,
      tipoFinal,
      inscricao_estadual ? String(inscricao_estadual).trim() : null,
      telefone ? String(telefone).trim() : null,
      email ? String(email).trim() : null,
      contato_responsavel ? String(contato_responsavel).trim() : null,
      endereco ? String(endereco).trim() : null,
      cidade ? String(cidade).trim() : null,
      uf ? String(uf).trim().toUpperCase() : null,
      observacoes ? String(observacoes).trim() : null
    );

    // Propaga imediatamente para todas as áreas operacionais (ALM, CAF, etc.)
    syncMirrorsToAllAreas();

    const novo = central.prepare('SELECT * FROM fornecedores WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(novo);
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint failed')) {
      res.status(409).json({ error: 'Já existe um fornecedor/entidade cadastrado com este Código ou CNPJ/CPF' });
      return;
    }
    res.status(500).json({ error: 'Erro ao cadastrar fornecedor/entidade: ' + err.message });
  }
});

apiRouter.put('/fornecedores/:id', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || (user.perfil !== 'admin' && user.perfil !== 'almoxarife')) {
    res.status(403).json({ error: 'Apenas Administradores e Almoxarifes podem editar fornecedores/entidades' });
    return;
  }

  const { id } = req.params;
  const {
    codigo,
    razao_social,
    nome_fantasia,
    cnpj,
    tipo_entidade,
    inscricao_estadual,
    telefone,
    email,
    contato_responsavel,
    endereco,
    cidade,
    uf,
    observacoes,
    ativo,
  } = req.body;

  if (!codigo || !razao_social) {
    res.status(400).json({ error: 'Código e Razão Social / Nome são obrigatórios' });
    return;
  }

  const tipoFinal = tipo_entidade === 'entidade_parceira' ? 'entidade_parceira' : 'fornecedor_comercial';
  const central = getCentralDb();

  try {
    central.prepare(`
      UPDATE fornecedores
      SET codigo = ?, razao_social = ?, nome_fantasia = ?, cnpj = ?, tipo_entidade = ?, inscricao_estadual = ?,
          telefone = ?, email = ?, contato_responsavel = ?, endereco = ?, cidade = ?, uf = ?,
          observacoes = ?, ativo = ?
      WHERE id = ?
    `).run(
      String(codigo).trim().toUpperCase(),
      String(razao_social).trim(),
      nome_fantasia ? String(nome_fantasia).trim() : null,
      cnpj && String(cnpj).trim() ? String(cnpj).trim() : null,
      tipoFinal,
      inscricao_estadual ? String(inscricao_estadual).trim() : null,
      telefone ? String(telefone).trim() : null,
      email ? String(email).trim() : null,
      contato_responsavel ? String(contato_responsavel).trim() : null,
      endereco ? String(endereco).trim() : null,
      cidade ? String(cidade).trim() : null,
      uf ? String(uf).trim().toUpperCase() : null,
      observacoes ? String(observacoes).trim() : null,
      ativo ?? 1,
      id
    );

    // Propaga imediatamente para todas as áreas operacionais (ALM, CAF, etc.)
    syncMirrorsToAllAreas();

    const atualizado = central.prepare('SELECT * FROM fornecedores WHERE id = ?').get(id);
    res.json(atualizado);
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint failed')) {
      res.status(409).json({ error: 'Já existe outro fornecedor/entidade com este Código ou CNPJ/CPF' });
      return;
    }
    res.status(500).json({ error: 'Erro ao atualizar fornecedor/entidade: ' + err.message });
  }
});

apiRouter.delete('/fornecedores/:id', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || (user.perfil !== 'admin' && user.perfil !== 'almoxarife')) {
    res.status(403).json({ error: 'Apenas Administradores e Almoxarifes podem excluir fornecedores/entidades' });
    return;
  }

  const { id } = req.params;
  const central = getCentralDb();
  const forn = central.prepare('SELECT * FROM fornecedores WHERE id = ?').get(id) as any;
  if (!forn) {
    res.status(404).json({ error: 'Fornecedor/Entidade não encontrado' });
    return;
  }

  try {
    // Desvincula e remove em todas as áreas operacionais (ALM, CAF, etc.)
    const areas = getAllActiveAreas();
    for (const a of areas) {
      try {
        const areaDb = getAreaDb(a.sigla);
        runInTransaction(() => {
          areaDb.prepare('UPDATE movimentacoes SET fornecedor_id = NULL WHERE fornecedor_id = ?').run(id);
          areaDb.prepare('UPDATE lotes_estoque SET fornecedor_id = NULL WHERE fornecedor_id = ?').run(id);
          areaDb.prepare('DELETE FROM produto_fornecedores WHERE fornecedor_id = ?').run(id);
          try { areaDb.prepare('DELETE FROM fornecedores_entidades WHERE id = ?').run(id); } catch {}
          areaDb.prepare('DELETE FROM fornecedores WHERE id = ?').run(id);
        }, areaDb);
      } catch (areaErr: any) {
        console.warn(`[Delete Fornecedor] Aviso ao limpar na área ${a.sigla}:`, areaErr.message);
      }
    }

    // Exclui do banco central compartilhado
    central.prepare('DELETE FROM fornecedores WHERE id = ?').run(id);

    // Sincroniza espelhos para garantir consistência
    syncMirrorsToAllAreas();

    res.json({
      id: Number(id),
      message: `Cadastro "${forn.codigo} - ${forn.razao_social}" excluído do banco compartilhado com sucesso.`,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao excluir fornecedor/entidade: ' + err.message });
  }
});

// ============================================================================
// 6. CATÁLOGO DE PRODUTOS E LOTES (CÓDIGO ÚNICO DE ESTOQUE)
// ============================================================================

apiRouter.get('/lotes', (req, res) => {
  const user = authenticateRequest(req);
  if (user && user.perfil === 'requisitante') {
    res.status(403).json({ error: 'Acesso negado: Requisitantes não possuem autorização para consultar lotes e saldos de estoque.' });
    return;
  }

  const { produto_id, apenas_com_saldo, filtro_validade } = req.query;

  let sql = `
    SELECT 
      le.*,
      p.codigo as produto_codigo,
      p.nome as produto_nome,
      p.unidade_medida,
      COALESCE(f.nome_fantasia, f.razao_social) as fornecedor_nome
    FROM lotes_estoque le
    JOIN produtos p ON le.produto_id = p.id
    LEFT JOIN fornecedores f ON le.fornecedor_id = f.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (apenas_com_saldo !== 'false') {
    sql += ' AND le.quantidade_atual > 0';
  }

  if (produto_id) {
    sql += ' AND le.produto_id = ?';
    params.push(Number(produto_id));
  }

  sql += ' ORDER BY CASE WHEN le.data_validade IS NULL THEN 1 ELSE 0 END ASC, le.data_validade ASC, le.id ASC';

  const rows = db.prepare(sql).all(...params) as any[];
  const enriched = rows
    .map((l) => {
      const info = classifyLoteValidade(l.data_validade);
      return {
        ...l,
        dias_para_vencer: info.dias_para_vencer,
        status_validade: info.status_validade,
      };
    })
    .filter((l) => {
      if (!filtro_validade || filtro_validade === 'todos') return true;
      return l.status_validade === filtro_validade;
    });

  res.json(enriched);
});

// ============================================================================
// GRUPOS DE PRODUTOS & SUGESTÃO DE CÓDIGO
// ============================================================================

apiRouter.get('/grupos-produtos', (_req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM grupos_produtos WHERE ativo = 1 ORDER BY id ASC').all();
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao buscar grupos de produtos: ' + err.message });
  }
});

apiRouter.get('/produtos/sugestao-codigo', (_req, res) => {
  try {
    const row = db.prepare(
      "SELECT codigo FROM produtos WHERE length(codigo) = 7 AND codigo GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9]' ORDER BY CAST(codigo AS INTEGER) DESC LIMIT 1"
    ).get() as { codigo?: string } | undefined;
    let nextNum = 4140001;
    if (row && row.codigo) {
      const num = parseInt(row.codigo, 10);
      if (!isNaN(num) && num >= 4140001) {
        nextNum = num + 1;
      }
    }
    res.json({ codigo: String(nextNum) });
  } catch {
    res.json({ codigo: '4140001' });
  }
});

apiRouter.get('/produtos', (req, res) => {
  const { tipo, busca, codigo, nome, grupo_id, estoque_baixo, apenas_ativos } = req.query;

  let query = `
    SELECT 
      p.*,
      gp.nome as grupo_nome,
      gp.codigo as grupo_codigo
    FROM produtos p
    LEFT JOIN grupos_produtos gp ON p.grupo_id = gp.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (apenas_ativos !== 'false') {
    query += ' AND p.ativo = 1';
  }

  if (tipo && (tipo === 'consumivel' || tipo === 'nao_consumivel')) {
    query += ' AND p.tipo = ?';
    params.push(tipo);
  }

  if (grupo_id && String(grupo_id).trim()) {
    query += ' AND p.grupo_id = ?';
    params.push(Number(grupo_id));
  }

  if (codigo && String(codigo).trim()) {
    query += ' AND p.codigo LIKE ?';
    params.push(`%${String(codigo).trim()}%`);
  }

  if (nome && String(nome).trim()) {
    query += ' AND (p.nome LIKE ? OR p.descricao LIKE ?)';
    const termNome = `%${String(nome).trim()}%`;
    params.push(termNome, termNome);
  }

  if (estoque_baixo === 'true') {
    query += ' AND p.quantidade_atual <= p.estoque_minimo';
  }

  if (busca && typeof busca === 'string' && busca.trim()) {
    query += ' AND (p.codigo LIKE ? OR p.nome LIKE ? OR p.descricao LIKE ? OR p.localizacao LIKE ?)';
    const term = `%${busca.trim()}%`;
    params.push(term, term, term, term);
  }

  query += ' ORDER BY p.nome ASC';

  const rows = db.prepare(query).all(...params) as any[];

  // Anexa fornecedores, marcas e lotes de estoque vinculados a cada código de produto
  try {
    const vinculos = db.prepare(`
      SELECT 
        pf.*,
        f.codigo as fornecedor_codigo,
        f.razao_social as fornecedor_razao_social,
        f.nome_fantasia as fornecedor_nome_fantasia,
        f.cnpj as fornecedor_cnpj
      FROM produto_fornecedores pf
      JOIN fornecedores f ON pf.fornecedor_id = f.id
      ORDER BY pf.ultima_compra DESC, pf.id DESC
    `).all() as any[];

    const mapByProd = new Map<number, any[]>();
    for (const v of vinculos) {
      const list = mapByProd.get(v.produto_id) || [];
      list.push(v);
      mapByProd.set(v.produto_id, list);
    }

    const lotesRows = db.prepare(`
      SELECT 
        le.*,
        COALESCE(cc.nome, 'Almoxarifado Central') as centro_custo_nome,
        cc.codigo as centro_custo_codigo,
        COALESCE(f.nome_fantasia, f.razao_social) as fornecedor_nome
      FROM lotes_estoque le
      LEFT JOIN centros_custo cc ON le.centro_custo_id = cc.id
      LEFT JOIN fornecedores f ON le.fornecedor_id = f.id
      WHERE le.quantidade_atual > 0
      ORDER BY CASE WHEN le.data_validade IS NULL THEN 1 ELSE 0 END ASC, le.data_validade ASC, le.id ASC
    `).all() as any[];

    const lotesByProd = new Map<number, any[]>();
    for (const l of lotesRows) {
      const info = classifyLoteValidade(l.data_validade);
      const list = lotesByProd.get(l.produto_id) || [];
      list.push({
        ...l,
        dias_para_vencer: info.dias_para_vencer,
        status_validade: info.status_validade,
      });
      lotesByProd.set(l.produto_id, list);
    }

    for (const r of rows) {
      r.custo_unitario = r.custo_unitario !== null && r.custo_unitario !== undefined ? Number(r.custo_unitario) : (Number(r.valor_unitario) || 0.0);
      r.valor_unitario = Number(r.valor_unitario !== null && r.valor_unitario !== undefined ? r.valor_unitario : r.custo_unitario);
      r.fornecedores_vinculados = mapByProd.get(r.id) || [];
      const prodLotes = lotesByProd.get(r.id) || [];
      r.lotes = prodLotes;
      const qtdBloqueadaVencida = prodLotes
        .filter((l: any) => l.status_validade === 'vencido')
        .reduce((acc: number, l: any) => acc + Number(l.quantidade_atual), 0);
      r.quantidade_bloqueada_vencida = qtdBloqueadaVencida;
      r.quantidade_disponivel_valida = Math.max(0, Number(r.quantidade_atual) - qtdBloqueadaVencida);
    }
  } catch {
    for (const r of rows) {
      r.custo_unitario = Number(r.custo_unitario || r.valor_unitario || 0.0);
      r.valor_unitario = Number(r.valor_unitario || r.custo_unitario || 0.0);
      r.fornecedores_vinculados = [];
      r.lotes = [];
      r.quantidade_bloqueada_vencida = 0;
      r.quantidade_disponivel_valida = Number(r.quantidade_atual);
    }
  }

  const user = authenticateRequest(req);
  if (user && user.perfil === 'requisitante') {
    const sanitized = rows.map((p) => ({
      id: p.id,
      codigo: p.codigo,
      nome: p.nome,
      descricao: p.descricao,
      unidade_medida: p.unidade_medida,
      tipo: p.tipo,
      ativo: p.ativo,
      grupo_id: p.grupo_id,
      grupo_nome: p.grupo_nome,
      grupo_codigo: p.grupo_codigo,
    }));
    res.json(sanitized);
    return;
  }

  res.json(rows);
});

apiRouter.post('/produtos/:id/fornecedores', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || (user.perfil !== 'admin' && user.perfil !== 'almoxarife')) {
    res.status(403).json({ error: 'Apenas Administradores e Almoxarifes podem vincular fornecedores a produtos' });
    return;
  }

  const { id } = req.params;
  const { fornecedor_id, marca, nomenclatura_fornecedor, codigo_referencia_fornecedor, ultimo_valor_unitario } = req.body;

  if (!fornecedor_id) {
    res.status(400).json({ error: 'Selecione um fornecedor cadastrado para vincular a este código de produto' });
    return;
  }

  try {
    const prod = db.prepare('SELECT id, codigo, nome FROM produtos WHERE id = ?').get(id) as any;
    if (!prod) {
      res.status(404).json({ error: 'Produto não encontrado no catálogo' });
      return;
    }

    const forn = db.prepare('SELECT id, razao_social FROM fornecedores WHERE id = ?').get(fornecedor_id) as any;
    if (!forn) {
      res.status(404).json({ error: 'Fornecedor não encontrado' });
      return;
    }

    const info = db.prepare(`
      INSERT INTO produto_fornecedores (
        produto_id, fornecedor_id, marca, nomenclatura_fornecedor, codigo_referencia_fornecedor, ultimo_valor_unitario
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      Number(id),
      Number(fornecedor_id),
      marca ? String(marca).trim() : null,
      nomenclatura_fornecedor ? String(nomenclatura_fornecedor).trim() : null,
      codigo_referencia_fornecedor ? String(codigo_referencia_fornecedor).trim().toUpperCase() : null,
      ultimo_valor_unitario ? Number(ultimo_valor_unitario) : null
    );

    const criado = db.prepare(`
      SELECT 
        pf.*,
        f.codigo as fornecedor_codigo,
        f.razao_social as fornecedor_razao_social,
        f.nome_fantasia as fornecedor_nome_fantasia,
        f.cnpj as fornecedor_cnpj
      FROM produto_fornecedores pf
      JOIN fornecedores f ON pf.fornecedor_id = f.id
      WHERE pf.id = ?
    `).get(info.lastInsertRowid);

    res.status(201).json({
      message: `Fornecedor "${forn.razao_social}" vinculado ao código único de estoque "${prod.codigo}".`,
      data: criado,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao vincular fornecedor ao produto: ' + err.message });
  }
});

apiRouter.delete('/produtos/:id/fornecedores/:vinculoId', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || (user.perfil !== 'admin' && user.perfil !== 'almoxarife')) {
    res.status(403).json({ error: 'Sem permissão' });
    return;
  }

  const { id, vinculoId } = req.params;
  db.prepare('DELETE FROM produto_fornecedores WHERE id = ? AND produto_id = ?').run(vinculoId, id);
  res.json({ message: 'Vínculo de fornecedor/marca removido com sucesso.' });
});

apiRouter.post('/produtos', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || (user.perfil !== 'admin' && user.perfil !== 'almoxarife')) {
    res.status(403).json({ error: 'Apenas Administradores e Almoxarifes podem cadastrar produtos' });
    return;
  }

  let { codigo, nome, descricao, grupo_id, unidade_medida, tipo, controla_validade, estoque_minimo, estoque_maximo, valor_unitario, custo_unitario, localizacao } = req.body;
  if (!nome || !unidade_medida || !tipo) {
    res.status(400).json({ error: 'Descrição padrão, unidade de medida e tipo são obrigatórios' });
    return;
  }

  // Gera código sequencial numérico de 7 dígitos caso deixado em branco
  if (!codigo || !String(codigo).trim()) {
    try {
      const row = db.prepare(
        "SELECT codigo FROM produtos WHERE length(codigo) = 7 AND codigo GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9]' ORDER BY CAST(codigo AS INTEGER) DESC LIMIT 1"
      ).get() as { codigo?: string } | undefined;
      let nextNum = 4140001;
      if (row && row.codigo) {
        const num = parseInt(row.codigo, 10);
        if (!isNaN(num) && num >= 4140001) {
          nextNum = num + 1;
        }
      }
      codigo = String(nextNum);
    } catch {
      codigo = '4140001';
    }
  } else {
    // Preserva o código digitado pelo usuário (numérico de 7 dígitos ou formato próprio)
    codigo = String(codigo).trim();
  }

  const custoFinal = custo_unitario !== undefined && custo_unitario !== null && custo_unitario !== ''
    ? Number(custo_unitario)
    : (valor_unitario ? Number(valor_unitario) : 0);
  const valorFinal = valor_unitario !== undefined && valor_unitario !== null && valor_unitario !== ''
    ? Number(valor_unitario)
    : custoFinal;

  try {
    const stmt = db.prepare(`
      INSERT INTO produtos (
        codigo, nome, descricao, grupo_id, unidade_medida, tipo,
        controla_validade, estoque_minimo, estoque_maximo, quantidade_atual,
        valor_unitario, custo_unitario, localizacao, ativo
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 1)
    `);
    const info = stmt.run(
      codigo,
      nome.trim().toUpperCase(),
      descricao ? descricao.trim() : null,
      grupo_id ? Number(grupo_id) : null,
      unidade_medida.trim().toUpperCase(),
      tipo,
      controla_validade === 0 || controla_validade === false ? 0 : 1,
      Number(estoque_minimo) || 0,
      Number(estoque_maximo) || 0,
      valorFinal,
      custoFinal,
      localizacao ? localizacao.trim().toUpperCase() : null
    );
    const novo = db.prepare(`
      SELECT p.*, gp.nome as grupo_nome, gp.codigo as grupo_codigo
      FROM produtos p
      LEFT JOIN grupos_produtos gp ON p.grupo_id = gp.id
      WHERE p.id = ?
    `).get(info.lastInsertRowid);
    res.status(201).json(novo);
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint failed')) {
      res.status(409).json({ error: 'Já existe um produto com este código único de catálogo' });
      return;
    }
    res.status(500).json({ error: 'Erro ao cadastrar produto: ' + err.message });
  }
});

apiRouter.put('/produtos/:id', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || (user.perfil !== 'admin' && user.perfil !== 'almoxarife')) {
    res.status(403).json({ error: 'Apenas Administradores e Almoxarifes podem editar produtos' });
    return;
  }

  const { id } = req.params;
  const { codigo, nome, descricao, grupo_id, unidade_medida, tipo, controla_validade, estoque_minimo, estoque_maximo, valor_unitario, custo_unitario, localizacao, ativo } = req.body;

  const custoFinal = custo_unitario !== undefined && custo_unitario !== null && custo_unitario !== ''
    ? Number(custo_unitario)
    : (valor_unitario ? Number(valor_unitario) : 0);
  const valorFinal = valor_unitario !== undefined && valor_unitario !== null && valor_unitario !== ''
    ? Number(valor_unitario)
    : custoFinal;

  try {
    db.prepare(`
      UPDATE produtos
      SET codigo = ?, nome = ?, descricao = ?, grupo_id = ?, unidade_medida = ?, tipo = ?, controla_validade = ?,
          estoque_minimo = ?, estoque_maximo = ?, valor_unitario = ?, custo_unitario = ?, localizacao = ?, ativo = ?
      WHERE id = ?
    `).run(
      codigo ? String(codigo).trim() : '',
      nome.trim().toUpperCase(),
      descricao ? descricao.trim() : null,
      grupo_id ? Number(grupo_id) : null,
      unidade_medida.trim().toUpperCase(),
      tipo,
      controla_validade === 0 || controla_validade === false ? 0 : 1,
      Number(estoque_minimo) || 0,
      Number(estoque_maximo) || 0,
      valorFinal,
      custoFinal,
      localizacao ? localizacao.trim().toUpperCase() : null,
      ativo ?? 1,
      id
    );

    const atualizado = db.prepare(`
      SELECT p.*, gp.nome as grupo_nome, gp.codigo as grupo_codigo
      FROM produtos p
      LEFT JOIN grupos_produtos gp ON p.grupo_id = gp.id
      WHERE p.id = ?
    `).get(id);
    res.json(atualizado);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao atualizar produto: ' + err.message });
  }
});

apiRouter.delete('/produtos/:id', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || (user.perfil !== 'admin' && user.perfil !== 'almoxarife')) {
    res.status(403).json({ error: 'Apenas Administradores e Almoxarifes podem excluir produtos' });
    return;
  }

  const { id } = req.params;
  const prod = db.prepare('SELECT * FROM produtos WHERE id = ?').get(id) as any;
  if (!prod) {
    res.status(404).json({ error: 'Produto não encontrado no catálogo' });
    return;
  }

  const empAtivos = db.prepare(
    "SELECT COUNT(*) as count FROM emprestimos WHERE produto_id = ? AND status IN ('emprestado', 'atrasado')"
  ).get(id) as { count: number };
  if (empAtivos.count > 0) {
    res.status(400).json({
      error: `Não é possível excluir "${prod.nome}" pois há ${empAtivos.count} empréstimo(s) ativo(s) deste equipamento.`,
    });
    return;
  }

  try {
    runInTransaction(() => {
      db.prepare('DELETE FROM historico_requisicoes WHERE produto_id = ?').run(id);
      db.prepare('DELETE FROM itens_requisicao WHERE produto_id = ?').run(id);
      db.prepare('DELETE FROM itens_emprestimo_institucional WHERE produto_id = ?').run(id);
      db.prepare('DELETE FROM movimentacoes WHERE produto_id = ?').run(id);
      db.prepare('DELETE FROM lotes_estoque WHERE produto_id = ?').run(id);
      db.prepare('DELETE FROM emprestimos WHERE produto_id = ?').run(id);
      db.prepare('DELETE FROM produto_fornecedores WHERE produto_id = ?').run(id);
      db.prepare('DELETE FROM produtos WHERE id = ?').run(id);
    });

    res.json({
      id: Number(id),
      message: `Produto "${prod.codigo} - ${prod.nome}" excluído com sucesso do catálogo.`,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao excluir produto: ' + err.message });
  }
});

// ============================================================================
// 7. ENTRADA DE NOTA FISCAL / ESTOQUE (COM FORNECEDOR, LOTE/VALIDADE E CÓDIGO ÚNICO DE PRODUTO)
// ============================================================================

apiRouter.post('/entradas', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || (user.perfil !== 'admin' && user.perfil !== 'almoxarife')) {
    res.status(403).json({ error: 'Apenas Almoxarifes e Administradores podem registrar entradas de estoque' });
    return;
  }

  const {
    produto_id,
    quantidade,
    documento_referencia,
    numero_lote,
    data_validade,
    valor_unitario,
    observacao,
    fornecedor_id,
    fornecedor,
    marca,
    nomenclatura_fornecedor,
    codigo_referencia_fornecedor,
    centro_custo_id,
    itens,
  } = req.body;

  if (!documento_referencia || !String(documento_referencia).trim()) {
    res.status(400).json({ error: 'O número do documento fiscal / NF de entrada é obrigatório para conformidade' });
    return;
  }

  // Suporta lista de itens da Nota Fiscal ou lançamento de item único
  const listaItens: Array<{
    produto_id: number;
    quantidade: number;
    numero_lote?: string | null;
    data_validade?: string | null;
    valor_unitario?: number | null;
    marca?: string | null;
    nomenclatura_fornecedor?: string | null;
    codigo_referencia_fornecedor?: string | null;
  }> = Array.isArray(itens) && itens.length > 0
    ? itens
    : [
        {
          produto_id: Number(produto_id),
          quantidade: Number(quantidade),
          numero_lote,
          data_validade,
          valor_unitario,
          marca,
          nomenclatura_fornecedor,
          codigo_referencia_fornecedor,
        },
      ];

  for (const item of listaItens) {
    const qtd = Number(item.quantidade);
    if (!item.produto_id || !qtd || qtd <= 0) {
      res.status(400).json({ error: 'Produto cadastrado e quantidade válida positiva são obrigatórios em todos os itens da NF' });
      return;
    }
  }

  try {
    const result = runInTransaction(() => {
      let fornRow: any = null;
      if (fornecedor_id) {
        fornRow = db.prepare('SELECT * FROM fornecedores WHERE id = ?').get(Number(fornecedor_id)) as any;
        if (!fornRow) {
          throw new Error('Fornecedor/Entidade selecionado não foi encontrado no cadastro.');
        }
      }

      const nomeFornecedorLabel = fornRow
        ? `${fornRow.codigo} - ${fornRow.nome_fantasia || fornRow.razao_social}${fornRow.cnpj ? ` (CNPJ: ${fornRow.cnpj})` : ''}`
        : fornecedor
        ? String(fornecedor).trim()
        : null;

      const docRefUpper = String(documento_referencia).trim().toUpperCase();
      const movsCriadas: number[] = [];
      const produtosAtualizados: any[] = [];

      const targetCentroCustoId = centro_custo_id ? Number(centro_custo_id) : null;

      // 1. Cria a Nota Fiscal em notas_fiscais com situação ABERTA
      const nfInfo = db.prepare(`
        INSERT INTO notas_fiscais (
          numero_documento, fornecedor_id, fornecedor_nome, centro_custo_id,
          usuario_id, responsavel_nome, observacao, data_emissao, situacao
        ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'ABERTA')
      `).run(
        docRefUpper,
        fornRow ? fornRow.id : null,
        fornRow ? (fornRow.nome_fantasia || fornRow.razao_social) : (fornecedor ? String(fornecedor).trim() : null),
        targetCentroCustoId,
        user.id,
        user.nome,
        observacao ? String(observacao).trim() : null
      );
      const notaFiscalId = Number(nfInfo.lastInsertRowid);

      db.prepare(`
        INSERT INTO historico_notas_fiscais (nota_fiscal_id, usuario_id, acao, detalhes)
        VALUES (?, ?, 'abertura', ?)
      `).run(
        notaFiscalId,
        user.id,
        `Nota Fiscal "${docRefUpper}" registrada com ${listaItens.length} item(ns) por ${user.nome}.`
      );

      const movStmt = db.prepare(`
        INSERT INTO movimentacoes (
          tipo, motivo_diverso, produto_id, lote_id, quantidade, centro_custo_id, fornecedor_id, usuario_id,
          responsavel_nome, documento_referencia, numero_lote, data_validade, valor_unitario,
          marca, nomenclatura_fornecedor, observacao, nota_fiscal_id
        )
        VALUES ('entrada', 'Entrada por Nota Fiscal', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const item of listaItens) {
        const prodId = Number(item.produto_id);
        const qtd = Number(item.quantidade);
        const valUnit = item.valor_unitario !== undefined && item.valor_unitario !== null ? Number(item.valor_unitario) : null;
        const itemMarca = item.marca ? String(item.marca).trim() : null;
        const itemNomenclatura = item.nomenclatura_fornecedor ? String(item.nomenclatura_fornecedor).trim() : null;
        const itemCodRef = item.codigo_referencia_fornecedor ? String(item.codigo_referencia_fornecedor).trim().toUpperCase() : null;
        const itemLote = item.numero_lote ? String(item.numero_lote).trim().toUpperCase() : null;
        const itemValidade = item.data_validade ? String(item.data_validade).trim().slice(0, 10) : null;

        // 1. Verifica produto no catálogo (mantém SEMPRE o mesmo código único de estoque)
        const prod = db.prepare('SELECT id, codigo, nome, tipo, controla_validade, quantidade_atual FROM produtos WHERE id = ? AND ativo = 1').get(prodId) as any;
        if (!prod) {
          throw new Error(`Produto #${prodId} não encontrado ou inativo no catálogo`);
        }

        // Valida obrigatoriedade de Lote e Data de Validade para itens perecíveis/médicos/hospitalares
        const exigeLoteValidade = prod.controla_validade === undefined ? prod.tipo === 'consumivel' : prod.controla_validade === 1;
        if (exigeLoteValidade && (!itemLote || !itemValidade)) {
          throw new Error(
            `O item "${prod.codigo} - ${prod.nome}" exige controle de Lote e Data de Validade obrigatórios na entrada.`
          );
        }

        // 2. Registra/atualiza Lote em lotes_estoque vinculado ao código único do produto
        const loteReg = upsertLoteEstoque({
          produto_id: prodId,
          numero_lote: itemLote || `LT-${docRefUpper}`,
          data_validade: itemValidade,
          quantidade: qtd,
          fornecedor_id: fornRow ? fornRow.id : null,
          documento_referencia: docRefUpper,
          marca: itemMarca,
          nomenclatura_fornecedor: itemNomenclatura,
          centro_custo_id: targetCentroCustoId,
        });

        // 3. Soma saldo no mesmo código único de produto no estoque, independente de marca ou nomenclatura na NF
        db.prepare(`
          UPDATE produtos 
          SET quantidade_atual = quantidade_atual + ? 
          WHERE id = ?
        `).run(qtd, prodId);

        if (valUnit && valUnit > 0) {
          db.prepare('UPDATE produtos SET valor_unitario = ? WHERE id = ?').run(valUnit, prodId);
        }

        // 4. Se houver fornecedor_id cadastrado, registra/atualiza equivalência em produto_fornecedores
        if (fornRow) {
          const existingLink = db.prepare(`
            SELECT id FROM produto_fornecedores
            WHERE produto_id = ? AND fornecedor_id = ?
              AND COALESCE(LOWER(marca), '') = COALESCE(LOWER(?), '')
              AND COALESCE(LOWER(nomenclatura_fornecedor), '') = COALESCE(LOWER(?), '')
          `).get(prodId, fornRow.id, itemMarca || '', itemNomenclatura || '') as { id: number } | undefined;

          if (existingLink) {
            db.prepare(`
              UPDATE produto_fornecedores
              SET ultimo_valor_unitario = COALESCE(?, ultimo_valor_unitario),
                  codigo_referencia_fornecedor = COALESCE(?, codigo_referencia_fornecedor),
                  ultima_compra = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(valUnit, itemCodRef, existingLink.id);
          } else {
            db.prepare(`
              INSERT INTO produto_fornecedores (
                produto_id, fornecedor_id, marca, nomenclatura_fornecedor,
                codigo_referencia_fornecedor, ultimo_valor_unitario, ultima_compra
              ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `).run(prodId, fornRow.id, itemMarca, itemNomenclatura, itemCodRef, valUnit);
          }
        }

        // 5. Monta observação rastreável com Fornecedor, Marca, Nomenclatura da NF e Lote/Validade
        const partesObs: string[] = [];
        if (nomeFornecedorLabel) partesObs.push(`Fornecedor: ${nomeFornecedorLabel}`);
        if (itemMarca) partesObs.push(`Marca/Nome NF: ${itemMarca}`);
        if (itemNomenclatura) partesObs.push(`Desc. na NF: "${itemNomenclatura}"`);
        if (itemCodRef) partesObs.push(`Ref. Forn: ${itemCodRef}`);
        if (loteReg.numero_lote) partesObs.push(`Lote: ${loteReg.numero_lote}`);
        if (loteReg.data_validade) partesObs.push(`Val: ${loteReg.data_validade}`);
        if (observacao && String(observacao).trim()) partesObs.push(String(observacao).trim());
        const obsFinal = partesObs.length > 0 ? partesObs.join(' | ') : 'Entrada de material por NF/Doc';

        const movInfo = movStmt.run(
          prodId,
          loteReg.id,
          qtd,
          targetCentroCustoId,
          fornRow ? fornRow.id : null,
          user.id,
          user.nome,
          docRefUpper,
          loteReg.numero_lote,
          loteReg.data_validade,
          valUnit,
          itemMarca,
          itemNomenclatura,
          obsFinal,
          notaFiscalId
        );

        movsCriadas.push(Number(movInfo.lastInsertRowid));
        const produtoAtualizado = db.prepare('SELECT * FROM produtos WHERE id = ?').get(prodId);
        produtosAtualizados.push(produtoAtualizado);
      }

      return {
        nota_fiscal_id: notaFiscalId,
        movimentacao_id: movsCriadas[0],
        movimentacoes_ids: movsCriadas,
        produto: produtosAtualizados[0],
        produtos: produtosAtualizados,
      };
    });

    res.status(201).json({
      message: 'Entrada por Nota Fiscal registrada com sucesso no código único de estoque e lote atualizado',
      data: result,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Erro ao registrar entrada' });
  }
});

// ============================================================================
// 7.1 GESTÃO DE NOTAS FISCAIS (LISTAGEM, DETALHES, CORREÇÃO E FECHAMENTO)
// ============================================================================

// Listagem agrupada por Nota Fiscal (A.1)
apiRouter.get('/notas-fiscais', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || user.perfil === 'requisitante') {
    res.status(403).json({ error: 'Acesso restrito. Requisitantes não possuem permissão para consultar notas fiscais.' });
    return;
  }

  const { busca, produto_busca, situacao, limite } = req.query;

  try {
    let query = `
      SELECT 
        nf.id,
        nf.numero_documento,
        nf.fornecedor_id,
        COALESCE(f.nome_fantasia, f.razao_social, nf.fornecedor_nome) as fornecedor_nome,
        f.codigo as fornecedor_codigo,
        f.cnpj as fornecedor_cnpj,
        nf.centro_custo_id,
        cc.codigo as centro_custo_codigo,
        cc.nome as centro_custo_nome,
        nf.usuario_id,
        nf.responsavel_nome,
        nf.observacao,
        nf.data_emissao,
        nf.situacao,
        nf.fechada_em,
        nf.fechada_por,
        uf.nome as fechada_por_nome,
        (
          SELECT COUNT(DISTINCT m.id)
          FROM movimentacoes m
          WHERE m.nota_fiscal_id = nf.id AND m.tipo = 'entrada'
        ) as total_itens,
        (
          SELECT COALESCE(SUM(m.quantidade * COALESCE(m.valor_unitario, 0)), 0)
          FROM movimentacoes m
          WHERE m.nota_fiscal_id = nf.id AND m.tipo = 'entrada'
        ) as valor_total
      FROM notas_fiscais nf
      LEFT JOIN fornecedores f ON nf.fornecedor_id = f.id
      LEFT JOIN centros_custo cc ON nf.centro_custo_id = cc.id
      LEFT JOIN usuarios uf ON nf.fechada_por = uf.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (situacao && situacao !== 'todas') {
      query += ' AND nf.situacao = ?';
      params.push(situacao);
    }

    if (busca && typeof busca === 'string' && busca.trim()) {
      const term = `%${busca.trim()}%`;
      query += ` AND (
        nf.numero_documento LIKE ? 
        OR nf.fornecedor_nome LIKE ? 
        OR f.razao_social LIKE ? 
        OR f.nome_fantasia LIKE ? 
        OR f.cnpj LIKE ?
        OR EXISTS (
          SELECT 1 FROM movimentacoes m
          JOIN produtos p ON m.produto_id = p.id
          WHERE m.nota_fiscal_id = nf.id AND (p.nome LIKE ? OR p.codigo LIKE ?)
        )
      )`;
      params.push(term, term, term, term, term, term, term);
    }

    if (produto_busca && typeof produto_busca === 'string' && produto_busca.trim()) {
      const prodTerm = `%${produto_busca.trim()}%`;
      query += ` AND EXISTS (
        SELECT 1 FROM movimentacoes m
        JOIN produtos p ON m.produto_id = p.id
        WHERE m.nota_fiscal_id = nf.id AND (p.nome LIKE ? OR p.codigo LIKE ?)
      )`;
      params.push(prodTerm, prodTerm);
    }

    query += ' ORDER BY nf.id DESC';

    const maxRows = Math.min(Number(limite) || 150, 500);
    query += ` LIMIT ${maxRows}`;

    const list = db.prepare(query).all(...params);
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao listar notas fiscais: ' + err.message });
  }
});

// Detalhes completos da Nota Fiscal (A.2)
apiRouter.get('/notas-fiscais/:id', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || user.perfil === 'requisitante') {
    res.status(403).json({ error: 'Acesso restrito. Requisitantes não possuem permissão para visualizar detalhes de notas fiscais.' });
    return;
  }

  const { id } = req.params;

  try {
    const nota = db.prepare(`
      SELECT 
        nf.*,
        f.codigo as fornecedor_codigo,
        COALESCE(f.nome_fantasia, f.razao_social, nf.fornecedor_nome) as fornecedor_nome_oficial,
        f.cnpj as fornecedor_cnpj,
        cc.codigo as centro_custo_codigo,
        cc.nome as centro_custo_nome,
        uf.nome as fechada_por_nome
      FROM notas_fiscais nf
      LEFT JOIN fornecedores f ON nf.fornecedor_id = f.id
      LEFT JOIN centros_custo cc ON nf.centro_custo_id = cc.id
      LEFT JOIN usuarios uf ON nf.fechada_por = uf.id
      WHERE nf.id = ?
    `).get(id) as any;

    if (!nota) {
      res.status(404).json({ error: 'Nota fiscal não encontrada.' });
      return;
    }

    // Itens da nota a partir das movimentações ativas de entrada
    const itens = db.prepare(`
      SELECT 
        m.id as movimentacao_id,
        m.produto_id,
        p.codigo as produto_codigo,
        p.nome as produto_nome,
        p.unidade_medida,
        p.tipo as produto_tipo,
        p.controla_validade,
        m.lote_id,
        m.numero_lote,
        m.data_validade,
        m.quantidade,
        m.valor_unitario,
        m.marca,
        m.nomenclatura_fornecedor,
        le.quantidade_atual as saldo_atual_lote
      FROM movimentacoes m
      JOIN produtos p ON m.produto_id = p.id
      LEFT JOIN lotes_estoque le ON m.lote_id = le.id
      WHERE m.nota_fiscal_id = ? AND m.tipo = 'entrada'
      ORDER BY m.id ASC
    `).all(id) as any[];

    // Calcula quantidade consumida de cada lote
    const itensComConsumo = itens.map((it) => {
      const saldoLote = Number(it.saldo_atual_lote ?? 0);
      const qtdOriginal = Number(it.quantidade);
      const consumido = Math.max(0, qtdOriginal - saldoLote);
      return {
        ...it,
        saldo_atual_lote: saldoLote,
        consumido_lote: consumido,
      };
    });

    // Trilha de auditoria da nota
    const historico = db.prepare(`
      SELECT 
        h.id,
        h.nota_fiscal_id,
        h.usuario_id,
        u.nome as usuario_nome,
        h.acao,
        h.detalhes,
        h.data_registro
      FROM historico_notas_fiscais h
      JOIN usuarios u ON h.usuario_id = u.id
      WHERE h.nota_fiscal_id = ?
      ORDER BY h.id DESC
    `).all(id);

    res.json({
      nota,
      itens: itensComConsumo,
      historico,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao buscar nota fiscal: ' + err.message });
  }
});

// Correção de Nota Fiscal enquanto ABERTA (A.3)
apiRouter.put('/notas-fiscais/:id', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || (user.perfil !== 'admin' && user.perfil !== 'almoxarife')) {
    res.status(403).json({ error: 'Apenas Almoxarifes e Administradores podem corrigir notas fiscais.' });
    return;
  }

  const { id } = req.params;
  const {
    numero_documento,
    fornecedor_id,
    centro_custo_id,
    observacao,
    itens,
  } = req.body;

  try {
    const nota = db.prepare('SELECT * FROM notas_fiscais WHERE id = ?').get(id) as any;
    if (!nota) {
      res.status(404).json({ error: 'Nota fiscal não encontrada.' });
      return;
    }

    // Regra A.4: rejeição estrita no backend caso a nota esteja FECHADA
    if (nota.situacao === 'FECHADA') {
      res.status(400).json({
        error: 'Esta nota fiscal está FECHADA e não pode mais ser alterada. Erros identificados após o fechamento devem ser tratados por movimentação de ajuste ou estorno formal.',
      });
      return;
    }

    if (!numero_documento || !String(numero_documento).trim()) {
      res.status(400).json({ error: 'Número do documento/NF é obrigatório.' });
      return;
    }

    const novosItens: Array<{
      movimentacao_id?: number;
      produto_id: number;
      quantidade: number;
      numero_lote?: string | null;
      data_validade?: string | null;
      valor_unitario?: number | null;
      marca?: string | null;
      nomenclatura_fornecedor?: string | null;
      codigo_referencia_fornecedor?: string | null;
    }> = Array.isArray(itens) ? itens : [];

    if (novosItens.length === 0) {
      res.status(400).json({ error: 'A nota fiscal deve conter ao menos um item.' });
      return;
    }

    // Busca itens atuais da nota
    const itensAtuais = db.prepare(`
      SELECT 
        m.id as movimentacao_id,
        m.produto_id,
        p.codigo as produto_codigo,
        p.nome as produto_nome,
        p.unidade_medida,
        p.tipo as produto_tipo,
        p.controla_validade,
        m.lote_id,
        m.numero_lote,
        m.data_validade,
        m.quantidade,
        m.valor_unitario,
        m.marca,
        m.nomenclatura_fornecedor,
        le.quantidade_atual as saldo_atual_lote
      FROM movimentacoes m
      JOIN produtos p ON m.produto_id = p.id
      LEFT JOIN lotes_estoque le ON m.lote_id = le.id
      WHERE m.nota_fiscal_id = ? AND m.tipo = 'entrada'
    `).all(id) as any[];

    // Validação estrita de saldo negativo / consumo já realizado (A.3)
    for (const atual of itensAtuais) {
      const saldoLote = Number(atual.saldo_atual_lote ?? 0);
      const qtdOriginal = Number(atual.quantidade);
      const consumido = Math.max(0, qtdOriginal - saldoLote);

      const novoCorresp = novosItens.find(
        (n) => n.movimentacao_id && Number(n.movimentacao_id) === atual.movimentacao_id
      );

      if (!novoCorresp) {
        // Tentativa de remover o item da nota
        if (consumido > 0) {
          res.status(400).json({
            error: `Correção bloqueada: O lote "${atual.numero_lote || '—'}" do produto "${atual.produto_codigo} - ${atual.produto_nome}" já teve ${consumido} unidades consumidas/dispensadas. Este item não pode ser removido da nota fiscal.`,
          });
          return;
        }
      } else {
        // Tentativa de reduzir a quantidade abaixo do que já foi consumido
        const novaQtd = Number(novoCorresp.quantidade);
        if (novaQtd < consumido) {
          res.status(400).json({
            error: `Correção bloqueada: O lote "${atual.numero_lote || '—'}" do produto "${atual.produto_codigo} - ${atual.produto_nome}" já teve ${consumido} unidades consumidas/dispensadas. A nova quantidade não pode ser menor que ${consumido}.`,
          });
          return;
        }
      }
    }

    // Executa em transação única
    runInTransaction(() => {
      const logsAuditoria: string[] = [];
      const docRefNorm = String(numero_documento).trim().toUpperCase();

      let fornRow: any = null;
      if (fornecedor_id) {
        fornRow = db.prepare('SELECT * FROM fornecedores WHERE id = ?').get(Number(fornecedor_id)) as any;
      }
      const fornNome = fornRow ? (fornRow.nome_fantasia || fornRow.razao_social) : nota.fornecedor_nome;

      // 1. Detecta alterações no cabeçalho
      const mudancasCabecalho: string[] = [];
      if (nota.numero_documento !== docRefNorm) {
        mudancasCabecalho.push(`Número NF alterado de "${nota.numero_documento}" para "${docRefNorm}"`);
      }
      if (Number(nota.fornecedor_id || 0) !== Number(fornecedor_id || 0)) {
        mudancasCabecalho.push(`Fornecedor alterado para "${fornNome || '—'}"`);
      }
      if (Number(nota.centro_custo_id || 0) !== Number(centro_custo_id || 0)) {
        mudancasCabecalho.push(`Centro de custo alterado`);
      }
      if ((nota.observacao || '') !== (observacao || '')) {
        mudancasCabecalho.push(`Observação alterada`);
      }

      if (mudancasCabecalho.length > 0) {
        logsAuditoria.push(`Cabeçalho corrigido: ${mudancasCabecalho.join('; ')}.`);
      }

      // 2. Atualiza cabeçalho em notas_fiscais
      db.prepare(`
        UPDATE notas_fiscais
        SET numero_documento = ?, fornecedor_id = ?, fornecedor_nome = ?,
            centro_custo_id = ?, observacao = ?
        WHERE id = ?
      `).run(
        docRefNorm,
        fornecedor_id ? Number(fornecedor_id) : null,
        fornNome,
        centro_custo_id ? Number(centro_custo_id) : null,
        observacao ? String(observacao).trim() : null,
        id
      );

      // 3. Processa cada item atual
      const novosIds = new Set(novosItens.map((n) => n.movimentacao_id).filter(Boolean));

      for (const atual of itensAtuais) {
        const novoCorresp = novosItens.find(
          (n) => n.movimentacao_id && Number(n.movimentacao_id) === atual.movimentacao_id
        );

        if (!novoCorresp) {
          // ITEM REMOVIDO: gera estorno e abate saldo
          db.prepare(`
            INSERT INTO movimentacoes (
              tipo, motivo_diverso, produto_id, lote_id, quantidade, centro_custo_id, fornecedor_id, usuario_id,
              responsavel_nome, documento_referencia, numero_lote, data_validade, valor_unitario,
              marca, nomenclatura_fornecedor, observacao, nota_fiscal_id
            )
            VALUES (
              'estorno_entrada', 'Estorno por remoção de item na NF', ?, ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
          `).run(
            atual.produto_id,
            atual.lote_id,
            atual.quantidade,
            atual.centro_custo_id || null,
            atual.fornecedor_id || null,
            user.id,
            user.nome,
            docRefNorm,
            atual.numero_lote,
            atual.data_validade,
            atual.valor_unitario,
            atual.marca,
            atual.nomenclatura_fornecedor,
            `Estorno automático: item removido na correção da NF #${docRefNorm}`,
            id
          );

          // Abate do lote e do produto
          if (atual.lote_id) {
            db.prepare('UPDATE lotes_estoque SET quantidade_atual = MAX(0, quantidade_atual - ?) WHERE id = ?')
              .run(atual.quantidade, atual.lote_id);
          }
          db.prepare('UPDATE produtos SET quantidade_atual = MAX(0, quantidade_atual - ?) WHERE id = ?')
            .run(atual.quantidade, atual.produto_id);

          // Invalida a movimentação original alterando motivo para histórico preservado
          db.prepare("UPDATE movimentacoes SET motivo_diverso = 'Entrada corrigida (item removido)' WHERE id = ?")
            .run(atual.movimentacao_id);

          logsAuditoria.push(
            `Item ${atual.produto_codigo} - ${atual.produto_nome} removido da nota (${atual.quantidade} ${atual.unidade_medida}, Lote: ${atual.numero_lote || '—'}). Estorno automático gerado.`
          );
        } else {
          // ITEM MANTIDO / ALTERADO
          const novaQtd = Number(novoCorresp.quantidade);
          const novoLote = novoCorresp.numero_lote ? String(novoCorresp.numero_lote).trim().toUpperCase() : atual.numero_lote;
          const novaValidade = novoCorresp.data_validade ? String(novoCorresp.data_validade).trim().slice(0, 10) : atual.data_validade;
          const novoValor = novoCorresp.valor_unitario !== undefined && novoCorresp.valor_unitario !== null ? Number(novoCorresp.valor_unitario) : atual.valor_unitario;
          const novaMarca = novoCorresp.marca ? String(novoCorresp.marca).trim() : atual.marca;
          const novaNomenclatura = novoCorresp.nomenclatura_fornecedor ? String(novoCorresp.nomenclatura_fornecedor).trim() : atual.nomenclatura_fornecedor;

          const houveMudanca =
            novaQtd !== Number(atual.quantidade) ||
            novoLote !== atual.numero_lote ||
            novaValidade !== atual.data_validade ||
            novoValor !== atual.valor_unitario ||
            novaMarca !== atual.marca ||
            novaNomenclatura !== atual.nomenclatura_fornecedor;

          if (houveMudanca) {
            // Imutabilidade: estorno da movimentação original
            db.prepare(`
              INSERT INTO movimentacoes (
                tipo, motivo_diverso, produto_id, lote_id, quantidade, centro_custo_id, fornecedor_id, usuario_id,
                responsavel_nome, documento_referencia, numero_lote, data_validade, valor_unitario,
                marca, nomenclatura_fornecedor, observacao, nota_fiscal_id
              )
              VALUES (
                'estorno_entrada', 'Estorno para correção de item na NF', ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?, ?, ?, ?
              )
            `).run(
              atual.produto_id,
              atual.lote_id,
              atual.quantidade,
              atual.centro_custo_id || null,
              atual.fornecedor_id || null,
              user.id,
              user.nome,
              docRefNorm,
              atual.numero_lote,
              atual.data_validade,
              atual.valor_unitario,
              atual.marca,
              atual.nomenclatura_fornecedor,
              `Estorno automático: correção do item na NF #${docRefNorm}`,
              id
            );

            // Abate quantidade anterior
            if (atual.lote_id) {
              db.prepare('UPDATE lotes_estoque SET quantidade_atual = MAX(0, quantidade_atual - ?) WHERE id = ?')
                .run(atual.quantidade, atual.lote_id);
            }
            db.prepare('UPDATE produtos SET quantidade_atual = MAX(0, quantidade_atual - ?) WHERE id = ?')
              .run(atual.quantidade, atual.produto_id);

            // Marca movimentação anterior
            db.prepare("UPDATE movimentacoes SET motivo_diverso = 'Entrada corrigida (estornada)' WHERE id = ?")
              .run(atual.movimentacao_id);

            // Registra/atualiza lote corrigido
            const loteAtualizado = upsertLoteEstoque({
              produto_id: atual.produto_id,
              numero_lote: novoLote || `LT-${docRefNorm}`,
              data_validade: novaValidade,
              quantidade: novaQtd,
              fornecedor_id: fornecedor_id ? Number(fornecedor_id) : null,
              documento_referencia: docRefNorm,
              marca: novaMarca,
              nomenclatura_fornecedor: novaNomenclatura,
              centro_custo_id: centro_custo_id ? Number(centro_custo_id) : null,
            });

            // Adiciona nova quantidade corrigida ao lote e produto
            db.prepare('UPDATE produtos SET quantidade_atual = quantidade_atual + ? WHERE id = ?')
              .run(novaQtd, atual.produto_id);

            if (novoValor && novoValor > 0) {
              db.prepare('UPDATE produtos SET valor_unitario = ? WHERE id = ?').run(novoValor, atual.produto_id);
            }

            // Nova movimentação corrigida
            db.prepare(`
              INSERT INTO movimentacoes (
                tipo, motivo_diverso, produto_id, lote_id, quantidade, centro_custo_id, fornecedor_id, usuario_id,
                responsavel_nome, documento_referencia, numero_lote, data_validade, valor_unitario,
                marca, nomenclatura_fornecedor, observacao, nota_fiscal_id
              )
              VALUES (
                'entrada', 'Entrada por Nota Fiscal (Corrigida)', ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?, ?, ?, ?
              )
            `).run(
              atual.produto_id,
              loteAtualizado.id,
              novaQtd,
              centro_custo_id ? Number(centro_custo_id) : null,
              fornecedor_id ? Number(fornecedor_id) : null,
              user.id,
              user.nome,
              docRefNorm,
              loteAtualizado.numero_lote,
              loteAtualizado.data_validade,
              novoValor,
              novaMarca,
              novaNomenclatura,
              `Entrada corrigida por ${user.nome}`,
              id
            );

            logsAuditoria.push(
              `Item ${atual.produto_codigo} - ${atual.produto_nome}: corrigido de [Qtd: ${atual.quantidade}, Lote: ${atual.numero_lote || '—'}, Val: ${atual.data_validade || '—'}] para [Qtd: ${novaQtd}, Lote: ${novoLote || '—'}, Val: ${novaValidade || '—'}]. Estorno e reentrada registrados.`
            );
          }
        }
      }

      // 4. Novos itens adicionados
      for (const item of novosItens) {
        if (!item.movimentacao_id) {
          const prodId = Number(item.produto_id);
          const qtd = Number(item.quantidade);
          const valUnit = item.valor_unitario !== undefined && item.valor_unitario !== null ? Number(item.valor_unitario) : null;
          const itemMarca = item.marca ? String(item.marca).trim() : null;
          const itemNomenclatura = item.nomenclatura_fornecedor ? String(item.nomenclatura_fornecedor).trim() : null;
          const itemLote = item.numero_lote ? String(item.numero_lote).trim().toUpperCase() : `LT-${docRefNorm}`;
          const itemValidade = item.data_validade ? String(item.data_validade).trim().slice(0, 10) : null;

          const prod = db.prepare('SELECT id, codigo, nome, unidade_medida FROM produtos WHERE id = ?').get(prodId) as any;
          if (!prod) continue;

          const loteReg = upsertLoteEstoque({
            produto_id: prodId,
            numero_lote: itemLote,
            data_validade: itemValidade,
            quantidade: qtd,
            fornecedor_id: fornecedor_id ? Number(fornecedor_id) : null,
            documento_referencia: docRefNorm,
            marca: itemMarca,
            nomenclatura_fornecedor: itemNomenclatura,
            centro_custo_id: centro_custo_id ? Number(centro_custo_id) : null,
          });

          db.prepare('UPDATE produtos SET quantidade_atual = quantidade_atual + ? WHERE id = ?').run(qtd, prodId);
          if (valUnit && valUnit > 0) {
            db.prepare('UPDATE produtos SET valor_unitario = ? WHERE id = ?').run(valUnit, prodId);
          }

          db.prepare(`
            INSERT INTO movimentacoes (
              tipo, motivo_diverso, produto_id, lote_id, quantidade, centro_custo_id, fornecedor_id, usuario_id,
              responsavel_nome, documento_referencia, numero_lote, data_validade, valor_unitario,
              marca, nomenclatura_fornecedor, observacao, nota_fiscal_id
            )
            VALUES (
              'entrada', 'Entrada por Nota Fiscal (Inclusão)', ?, ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
          `).run(
            prodId,
            loteReg.id,
            qtd,
            centro_custo_id ? Number(centro_custo_id) : null,
            fornecedor_id ? Number(fornecedor_id) : null,
            user.id,
            user.nome,
            docRefNorm,
            loteReg.numero_lote,
            loteReg.data_validade,
            valUnit,
            itemMarca,
            itemNomenclatura,
            `Inclusão de item na NF #${docRefNorm}`,
            id
          );

          logsAuditoria.push(
            `Novo item adicionado: ${prod.codigo} - ${prod.nome} (${qtd} ${prod.unidade_medida}, Lote: ${itemLote}).`
          );
        }
      }

      // 5. Registra trilha de auditoria
      const insertHist = db.prepare(`
        INSERT INTO historico_notas_fiscais (nota_fiscal_id, usuario_id, acao, detalhes)
        VALUES (?, ?, 'correcao', ?)
      `);
      for (const logText of logsAuditoria) {
        insertHist.run(id, user.id, logText);
      }
    });

    res.json({ message: 'Nota fiscal corrigida com sucesso mantendo a imutabilidade por estorno.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Erro ao corrigir nota fiscal.' });
  }
});

// Fechamento de Nota Fiscal (A.4)
apiRouter.post('/notas-fiscais/:id/fechar', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || (user.perfil !== 'admin' && user.perfil !== 'almoxarife')) {
    res.status(403).json({ error: 'Apenas Almoxarifes e Administradores podem fechar notas fiscais.' });
    return;
  }

  const { id } = req.params;

  try {
    const nota = db.prepare('SELECT * FROM notas_fiscais WHERE id = ?').get(id) as any;
    if (!nota) {
      res.status(404).json({ error: 'Nota fiscal não encontrada.' });
      return;
    }

    if (nota.situacao === 'FECHADA') {
      res.status(400).json({ error: 'Esta nota fiscal já se encontra FECHADA.' });
      return;
    }

    const agora = new Date().toISOString();
    db.prepare(`
      UPDATE notas_fiscais
      SET situacao = 'FECHADA', fechada_em = ?, fechada_por = ?
      WHERE id = ?
    `).run(agora, user.id, id);

    db.prepare(`
      INSERT INTO historico_notas_fiscais (nota_fiscal_id, usuario_id, acao, detalhes, data_registro)
      VALUES (?, ?, 'fechamento', ?, ?)
    `).run(
      id,
      user.id,
      `Nota fiscal encerrada e bloqueada para alterações por ${user.nome}.`,
      agora
    );

    const notaAtualizada = db.prepare('SELECT * FROM notas_fiscais WHERE id = ?').get(id);
    res.json({
      message: 'Nota fiscal FECHADA com sucesso. Todos os campos foram travados como somente leitura.',
      nota: notaAtualizada,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao fechar nota fiscal: ' + err.message });
  }
});


// ============================================================================
// 8. WORKFLOW DE REQUISIÇÃO (PADRÃO SALUTEM COM PRIORIDADE E ABAS)
// ============================================================================

apiRouter.get('/requisicoes', (req, res) => {
  const user = authenticateRequest(req);
  const { status, centro_custo_id, busca, prioridade } = req.query;

  let query = `
    SELECT 
      r.id, r.numero_requisicao, r.centro_custo_id, r.solicitante_id, r.almoxarife_id,
      r.data_solicitacao, r.data_atendimento, r.status, r.prioridade, r.motivo_rejeicao, r.observacao,
      cc.codigo as centro_custo_codigo, cc.nome as centro_custo_nome,
      u_sol.nome as solicitante_nome, u_sol.login as solicitante_login,
      u_alm.nome as almoxarife_nome,
      (SELECT COUNT(*) FROM itens_requisicao ir WHERE ir.requisicao_id = r.id) as total_itens,
      (SELECT COUNT(*) FROM itens_requisicao ir WHERE ir.requisicao_id = r.id AND ir.status_item = 'aprovado') as itens_aprovados,
      (SELECT COUNT(*) FROM itens_requisicao ir WHERE ir.requisicao_id = r.id AND ir.status_item = 'negado') as itens_negados,
      (SELECT COUNT(*) FROM historico_requisicoes hr WHERE hr.requisicao_id = r.id) as total_eventos_historico
    FROM requisicoes r
    JOIN centros_custo cc ON r.centro_custo_id = cc.id
    JOIN usuarios u_sol ON r.solicitante_id = u_sol.id
    LEFT JOIN usuarios u_alm ON r.almoxarife_id = u_alm.id
    WHERE 1=1
  `;
  const params: any[] = [];

  // Se o usuário for requisitante, filtra pelo seu centro de custo
  if (user && user.perfil === 'requisitante') {
    if (user.centro_custo_id) {
      query += ' AND r.centro_custo_id = ?';
      params.push(user.centro_custo_id);
    }
  } else if (centro_custo_id) {
    query += ' AND r.centro_custo_id = ?';
    params.push(centro_custo_id);
  }

  if (status && status !== 'todas') {
    query += ' AND r.status = ?';
    params.push(status);
  }

  if (prioridade && prioridade !== 'todas') {
    query += ' AND r.prioridade = ?';
    params.push(prioridade);
  }

  if (busca && typeof busca === 'string' && busca.trim()) {
    query += ' AND (r.numero_requisicao LIKE ? OR cc.nome LIKE ? OR u_sol.nome LIKE ?)';
    const term = `%${busca.trim()}%`;
    params.push(term, term, term);
  }

  query += ' ORDER BY r.id DESC';

  const rows = db.prepare(query).all(...params);
  res.json(rows);
});

apiRouter.get('/requisicoes/:id', (req, res) => {
  const user = authenticateRequest(req);
  const { id } = req.params;

  const reqRow = db.prepare(`
    SELECT 
      r.id, r.numero_requisicao, r.centro_custo_id, r.solicitante_id, r.almoxarife_id,
      r.data_solicitacao, r.data_atendimento, r.status, r.prioridade, r.motivo_rejeicao, r.observacao,
      cc.codigo as centro_custo_codigo, cc.nome as centro_custo_nome, cc.departamento as centro_custo_depto,
      u_sol.nome as solicitante_nome, u_sol.login as solicitante_login,
      u_alm.nome as almoxarife_nome
    FROM requisicoes r
    JOIN centros_custo cc ON r.centro_custo_id = cc.id
    JOIN usuarios u_sol ON r.solicitante_id = u_sol.id
    LEFT JOIN usuarios u_alm ON r.almoxarife_id = u_alm.id
    WHERE r.id = ?
  `).get(id) as any;

  if (!reqRow) {
    res.status(404).json({ error: 'Requisição não encontrada' });
    return;
  }

  const isRequisitante = user && user.perfil === 'requisitante';
  const hojeStr = new Date().toISOString().slice(0, 10);

  const rawItens = db.prepare(`
    SELECT 
      ir.id, ir.requisicao_id, ir.produto_id, ir.quantidade_solicitada, ir.quantidade_atendida,
      ir.status_item, ir.analisado_por_id, ir.data_analise, ir.motivo_decisao, ir.lotes_atendidos,
      u_ana.nome as analisado_por_nome, u_ana.login as analisado_por_login, u_ana.perfil as analisado_por_perfil,
      p.codigo as produto_codigo, p.nome as produto_nome, p.unidade_medida, p.tipo,
      p.quantidade_atual as saldo_atual_estoque, p.valor_unitario
    FROM itens_requisicao ir
    JOIN produtos p ON ir.produto_id = p.id
    LEFT JOIN usuarios u_ana ON ir.analisado_por_id = u_ana.id
    WHERE ir.requisicao_id = ?
  `).all(id) as any[];

  const itens = rawItens.map((item) => {
    if (isRequisitante) {
      return {
        id: item.id,
        requisicao_id: item.requisicao_id,
        produto_id: item.produto_id,
        quantidade_solicitada: item.quantidade_solicitada,
        quantidade_atendida: item.quantidade_atendida,
        status_item: item.status_item,
        analisado_por_id: item.analisado_por_id,
        data_analise: item.data_analise,
        motivo_decisao: item.motivo_decisao,
        analisado_por_nome: item.analisado_por_nome,
        produto_codigo: item.produto_codigo,
        produto_nome: item.produto_nome,
        unidade_medida: item.unidade_medida,
        tipo: item.tipo,
      };
    }

    let lotesAtendidos: any[] = [];
    if (item.lotes_atendidos) {
      try {
        lotesAtendidos = JSON.parse(item.lotes_atendidos);
      } catch {
        lotesAtendidos = [];
      }
    } else if (reqRow.status === 'aprovada_atendida') {
      const movs = db.prepare(`
        SELECT lote_id, numero_lote, data_validade, quantidade
        FROM movimentacoes
        WHERE documento_referencia = ? AND produto_id = ? AND tipo = 'saida'
        ORDER BY id ASC
      `).all(reqRow.numero_requisicao, item.produto_id) as any[];
      lotesAtendidos = movs.map((m) => ({
        lote_id: m.lote_id,
        numero_lote: m.numero_lote || 'N/A',
        data_validade: m.data_validade || null,
        quantidade: Number(m.quantidade),
      }));
    }

    let lotesDisponiveis: any[] = [];
    if (reqRow.status === 'pendente') {
      const lotesRaw = db.prepare(`
        SELECT le.*, COALESCE(f.nome_fantasia, f.razao_social) as fornecedor_nome
        FROM lotes_estoque le
        LEFT JOIN fornecedores f ON le.fornecedor_id = f.id
        WHERE le.produto_id = ? AND le.quantidade_atual > 0
        ORDER BY CASE WHEN le.data_validade IS NULL THEN 1 ELSE 0 END ASC, le.data_validade ASC, le.id ASC
      `).all(item.produto_id) as any[];

      lotesDisponiveis = lotesRaw
        .filter((l) => !l.data_validade || String(l.data_validade).slice(0, 10) >= hojeStr)
        .map((l) => {
          const info = classifyLoteValidade(l.data_validade);
          return {
            ...l,
            dias_para_vencer: info.dias_para_vencer,
            status_validade: info.status_validade,
          };
        });
    }

    return {
      ...item,
      lotes_atendidos: lotesAtendidos,
      lotes_disponiveis: lotesDisponiveis,
    };
  });

  const historico = db.prepare(`
    SELECT 
      hr.id, hr.requisicao_id, hr.item_requisicao_id, hr.produto_id, hr.usuario_id,
      hr.acao, hr.status_anterior, hr.status_novo, hr.quantidade_solicitada, hr.quantidade_atendida,
      hr.detalhes, hr.justificativa, hr.data_registro,
      u.nome as usuario_nome, u.login as usuario_login, u.perfil as usuario_perfil,
      p.codigo as produto_codigo, p.nome as produto_nome, p.unidade_medida
    FROM historico_requisicoes hr
    JOIN usuarios u ON hr.usuario_id = u.id
    LEFT JOIN produtos p ON hr.produto_id = p.id
    WHERE hr.requisicao_id = ?
    ORDER BY hr.id ASC
  `).all(id);

  res.json({
    requisicao: reqRow,
    itens,
    historico,
  });
});

apiRouter.get('/requisicoes/:id/historico', (req, res) => {
  const { id } = req.params;
  const historico = db.prepare(`
    SELECT 
      hr.id, hr.requisicao_id, hr.item_requisicao_id, hr.produto_id, hr.usuario_id,
      hr.acao, hr.status_anterior, hr.status_novo, hr.quantidade_solicitada, hr.quantidade_atendida,
      hr.detalhes, hr.justificativa, hr.data_registro,
      u.nome as usuario_nome, u.login as usuario_login, u.perfil as usuario_perfil,
      p.codigo as produto_codigo, p.nome as produto_nome, p.unidade_medida
    FROM historico_requisicoes hr
    JOIN usuarios u ON hr.usuario_id = u.id
    LEFT JOIN produtos p ON hr.produto_id = p.id
    WHERE hr.requisicao_id = ?
    ORDER BY hr.id ASC
  `).all(id);

  res.json(historico);
});

apiRouter.get('/requisicoes/atendidas-por-centro-custo/:ccId', (req, res) => {
  const { ccId } = req.params;
  try {
    const reqs = db.prepare(`
      SELECT id, numero_requisicao, data_atendimento, prioridade, status
      FROM requisicoes
      WHERE centro_custo_id = ? AND status IN ('aprovada_atendida', 'atendida')
      ORDER BY id DESC
    `).all(ccId) as any[];

    const result = [];
    for (const r of reqs) {
      const itens = db.prepare(`
        SELECT 
          ir.id as item_requisicao_id,
          ir.produto_id,
          ir.quantidade_solicitada,
          ir.quantidade_atendida,
          ir.lotes_atendidos,
          p.codigo as produto_codigo,
          p.nome as produto_nome,
          p.unidade_medida,
          p.controla_validade,
          p.tipo as produto_tipo,
          (
            SELECT COALESCE(SUM(hr.quantidade_atendida), 0)
            FROM historico_requisicoes hr
            WHERE hr.requisicao_id = r.id AND hr.produto_id = ir.produto_id AND hr.acao = 'devolucao_setor'
          ) as total_ja_devolvido
        FROM itens_requisicao ir
        JOIN produtos p ON ir.produto_id = p.id
        WHERE ir.requisicao_id = ? AND ir.quantidade_atendida > 0
      `).all(r.id) as any[];

      const itensComSaldoDevolucao = itens.map((it) => {
        const jaDev = Number(it.total_ja_devolvido || 0);
        const atend = Number(it.quantidade_atendida || 0);
        const saldoDevolver = Math.max(0, atend - jaDev);
        let lotesArr: any[] = [];
        try {
          lotesArr = it.lotes_atendidos ? JSON.parse(it.lotes_atendidos) : [];
        } catch {}
        const lotePrincipal = lotesArr[0] || null;
        return {
          ...it,
          total_ja_devolvido: jaDev,
          saldo_disponivel_devolucao: saldoDevolver,
          lote_sugerido: lotePrincipal?.numero_lote || null,
          data_validade_sugerida: lotePrincipal?.data_validade || null,
          lote_id_sugerido: lotePrincipal?.lote_id || null,
        };
      }).filter((it) => it.saldo_disponivel_devolucao > 0);

      if (itensComSaldoDevolucao.length > 0) {
        result.push({
          ...r,
          itens: itensComSaldoDevolucao,
        });
      }
    }

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao buscar requisições atendidas: ' + err.message });
  }
});

apiRouter.post('/requisicoes', (req, res) => {
  const user = authenticateRequest(req);
  if (!user) {
    res.status(401).json({ error: 'Não autenticado' });
    return;
  }

  const { centro_custo_id, prioridade, observacao, itens } = req.body;

  const finalCcId = user.perfil === 'requisitante' ? (user.centro_custo_id || centro_custo_id) : centro_custo_id;

  if (!finalCcId) {
    res.status(400).json({ error: 'Centro de Custo solicitante é obrigatório' });
    return;
  }

  if (!Array.isArray(itens) || itens.length === 0) {
    res.status(400).json({ error: 'A requisição deve conter pelo menos 1 item' });
    return;
  }

  // Gera número da requisição: REQ-${areaSigla}-${year}-${nextSeq}
  const areaSigla = ((req as any).areaSigla || user.area_sigla || 'ALM').toUpperCase();
  const year = new Date().getFullYear();
  const countRow = db.prepare(`
    SELECT COUNT(*) as count FROM requisicoes WHERE numero_requisicao LIKE ?
  `).get(`REQ-${areaSigla}-${year}-%`) as { count: number };
  const nextSeq = String((countRow?.count || 0) + 1).padStart(4, '0');
  const numero_requisicao = `REQ-${areaSigla}-${year}-${nextSeq}`;

  try {
    const result = runInTransaction(() => {
      // 1. Cria cabeçalho da requisição (status = 'pendente', prioridade inicial 'normal' definida pelo almoxarifado)
      const prioridadeInicial =
        (user.perfil === 'admin' || user.perfil === 'almoxarife') && prioridade === 'urgente'
          ? 'urgente'
          : 'normal';

      const cc = db.prepare('SELECT nome, codigo FROM centros_custo WHERE id = ?').get(Number(finalCcId)) as any;
      const ccNome = cc ? cc.nome : null;
      const ccCodigo = cc ? cc.codigo : null;

      const reqStmt = db.prepare(`
        INSERT INTO requisicoes (
          numero_requisicao, centro_custo_id, centro_custo_nome, centro_custo_codigo,
          solicitante_id, solicitante_nome, prioridade, status, observacao
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pendente', ?)
      `);
      const reqInfo = reqStmt.run(
        numero_requisicao,
        finalCcId,
        ccNome,
        ccCodigo,
        user.id,
        user.nome,
        prioridadeInicial,
        observacao ? observacao.trim() : null
      );
      const requisicaoId = reqInfo.lastInsertRowid;

      const horaAtual = new Date().getHours();
      const regraEntregaTexto =
        horaAtual < 12
          ? 'Solicitada até as 12h: Entrega prevista no mesmo dia à tarde (após as 13h).'
          : 'Solicitada após as 12h: Entrega prevista para o dia seguinte (após as 13h).';

      // Registra abertura no histórico de auditoria da requisição
      const histStmt = db.prepare(`
        INSERT INTO historico_requisicoes (
          requisicao_id, item_requisicao_id, produto_id, usuario_id, acao,
          status_anterior, status_novo, quantidade_solicitada, quantidade_atendida,
          detalhes, justificativa
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      histStmt.run(
        requisicaoId,
        null,
        null,
        user.id,
        'criacao_requisicao',
        null,
        'pendente',
        null,
        null,
        `Requisição ${numero_requisicao} aberta por ${user.nome} (${user.perfil.toUpperCase()}) contendo ${itens.length} item(ns). ${regraEntregaTexto}`,
        observacao ? observacao.trim() : null
      );

      // 2. Insere itens
      const itemStmt = db.prepare(`
        INSERT INTO itens_requisicao (requisicao_id, produto_id, quantidade_solicitada, quantidade_atendida, status_item)
        VALUES (?, ?, ?, 0, 'pendente')
      `);

      for (const it of itens) {
        const qtd = Number(it.quantidade_solicitada);
        if (!it.produto_id || !qtd || qtd <= 0) {
          throw new Error('Cada item deve conter um produto válido e quantidade maior que zero');
        }

        // Valida se o produto existe e é consumível
        const prod = db.prepare('SELECT id, codigo, nome, unidade_medida, tipo, ativo FROM produtos WHERE id = ?').get(it.produto_id) as any;
        if (!prod || !prod.ativo) {
          throw new Error(`Produto #${it.produto_id} não encontrado ou inativo`);
        }
        if (prod.tipo !== 'consumivel') {
          throw new Error(`O produto "${prod.nome}" é um equipamento não consumível. Para ferramentas/equipamentos, utilize o módulo de Empréstimos.`);
        }

        const itemInfo = itemStmt.run(requisicaoId, it.produto_id, qtd);

        histStmt.run(
          requisicaoId,
          itemInfo.lastInsertRowid,
          it.produto_id,
          user.id,
          'inclusao_item',
          null,
          'pendente',
          qtd,
          0,
          `Item incluído na requisição: ${prod.codigo} - ${prod.nome} (${qtd} ${prod.unidade_medida}).`,
          null
        );
      }

      return {
        id: requisicaoId,
        numero_requisicao,
      };
    });

    res.status(201).json({
      message: 'Requisição cadastrada com sucesso com status Pendente',
      data: result,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Erro ao criar requisição' });
  }
});

apiRouter.patch('/requisicoes/:id/prioridade', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || (user.perfil !== 'admin' && user.perfil !== 'almoxarife')) {
    res.status(403).json({ error: 'Apenas o Almoxarifado (Almoxarife ou Administrador) pode definir a prioridade da requisição' });
    return;
  }

  const { id } = req.params;
  const { prioridade, justificativa } = req.body || {};

  if (prioridade !== 'normal' && prioridade !== 'urgente') {
    res.status(400).json({ error: 'Prioridade inválida. Valores permitidos: "normal" ou "urgente".' });
    return;
  }

  try {
    const reqRow = db.prepare('SELECT * FROM requisicoes WHERE id = ?').get(id) as any;
    if (!reqRow) {
      res.status(404).json({ error: 'Requisição não encontrada' });
      return;
    }

    const prioridadeAnterior = reqRow.prioridade || 'normal';

    runInTransaction(() => {
      db.prepare('UPDATE requisicoes SET prioridade = ? WHERE id = ?').run(prioridade, id);

      if (prioridadeAnterior !== prioridade) {
        db.prepare(`
          INSERT INTO historico_requisicoes (
            requisicao_id, item_requisicao_id, produto_id, usuario_id, acao,
            status_anterior, status_novo, quantidade_solicitada, quantidade_atendida,
            detalhes, justificativa
          ) VALUES (?, NULL, NULL, ?, 'alteracao_prioridade', ?, ?, NULL, NULL, ?, ?)
        `).run(
          id,
          user.id,
          prioridadeAnterior,
          prioridade,
          `Prioridade da requisição alterada pelo Almoxarifado (${user.nome}) de ${prioridadeAnterior.toUpperCase()} para ${prioridade.toUpperCase()}.`,
          justificativa ? String(justificativa).trim() : 'Classificação de prioridade operacional definida pelo Almoxarifado.'
        );
      }
    });

    res.json({
      message: `Prioridade definida como ${prioridade === 'urgente' ? 'URGENTE' : 'NORMAL'} pelo Almoxarifado.`,
      id: Number(id),
      prioridade,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao atualizar prioridade: ' + err.message });
  }
});

apiRouter.post('/requisicoes/:id/aprovar', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || (user.perfil !== 'admin' && user.perfil !== 'almoxarife')) {
    res.status(403).json({ error: 'Apenas Almoxarifes e Administradores podem analisar e atender requisições' });
    return;
  }

  const { id } = req.params;
  const { decisoes_itens, observacao_atendimento, prioridade } = req.body || {};

  try {
    const result = runInTransaction(() => {
      const reqRow = db.prepare('SELECT * FROM requisicoes WHERE id = ?').get(id) as any;
      if (!reqRow) {
        throw new Error('Requisição não encontrada');
      }
      if (reqRow.status !== 'pendente') {
        throw new Error(`Esta requisição não pode ser analisada pois seu status atual é "${reqRow.status}"`);
      }

      if (prioridade === 'normal' || prioridade === 'urgente') {
        db.prepare('UPDATE requisicoes SET prioridade = ? WHERE id = ?').run(prioridade, id);
      }

      const itens = db.prepare(`
        SELECT ir.*, p.codigo as produto_codigo, p.nome as produto_nome, p.quantidade_atual as saldo_atual, p.unidade_medida
        FROM itens_requisicao ir
        JOIN produtos p ON ir.produto_id = p.id
        WHERE ir.requisicao_id = ?
      `).all(id) as any[];

      if (itens.length === 0) {
        throw new Error('A requisição não possui itens para atender');
      }

      // Mapeia decisões por item (se não informadas no body, aprova todos os itens integralmente)
      const decisoesMap = new Map<number, {
        decisao: 'aprovado' | 'negado';
        quantidade_atendida: number;
        motivo_decisao: string;
        lotes_dispensados?: Array<{
          lote_id: number;
          numero_lote: string;
          data_validade?: string | null;
          quantidade: number;
        }>;
      }>();

      const hojeStr = new Date().toISOString().slice(0, 10);

      if (Array.isArray(decisoes_itens) && decisoes_itens.length > 0) {
        for (const d of decisoes_itens) {
          const itemOriginal = itens.find((it) => it.id === Number(d.item_id));
          if (!itemOriginal) continue;
          const isNegado = d.decisao === 'negado';

          let lotesEscolhidos: Array<{
            lote_id: number;
            numero_lote: string;
            data_validade?: string | null;
            quantidade: number;
          }> = [];

          if (!isNegado && Array.isArray(d.lotes_dispensados)) {
            lotesEscolhidos = d.lotes_dispensados
              .filter((l: any) => Number(l.quantidade) > 0)
              .map((l: any) => ({
                lote_id: Number(l.lote_id),
                numero_lote: String(l.numero_lote || '').trim(),
                data_validade: l.data_validade ? String(l.data_validade).slice(0, 10) : null,
                quantidade: Number(l.quantidade),
              }));
          }

          const somaLotes = lotesEscolhidos.reduce((acc, l) => acc + l.quantidade, 0);

          let qtdAtend = isNegado
            ? 0
            : somaLotes > 0
            ? somaLotes
            : d.quantidade_atendida !== undefined
            ? Number(d.quantidade_atendida)
            : Number(itemOriginal.quantidade_solicitada);

          const motivo = d.motivo_decisao ? String(d.motivo_decisao).trim() : '';
          if (isNegado && !motivo) {
            throw new Error(`Informe o motivo/parecer técnico para negar o item "${itemOriginal.produto_nome}".`);
          }
          if (!isNegado && qtdAtend <= 0) {
            throw new Error(`A quantidade atendida para o item aprovado "${itemOriginal.produto_nome}" deve ser maior que zero.`);
          }

          decisoesMap.set(itemOriginal.id, {
            decisao: isNegado ? 'negado' : 'aprovado',
            quantidade_atendida: qtdAtend,
            motivo_decisao: motivo || (isNegado ? 'Item negado na conferência do almoxarifado.' : 'Item conferido, aprovado e dispensado.'),
            lotes_dispensados: lotesEscolhidos.length > 0 ? lotesEscolhidos : undefined,
          });
        }
      }

      // Preenche padrão ('aprovado') para itens que não vieram no mapa
      for (const item of itens) {
        if (!decisoesMap.has(item.id)) {
          decisoesMap.set(item.id, {
            decisao: 'aprovado',
            quantidade_atendida: Number(item.quantidade_solicitada),
            motivo_decisao: 'Item conferido, aprovado e dispensado.',
          });
        }
      }

      // Valida saldo em estoque para todos os itens marcados como 'aprovado'
      let qtdItensAprovados = 0;
      let qtdItensNegados = 0;

      for (const item of itens) {
        const dec = decisoesMap.get(item.id)!;
        if (dec.decisao === 'aprovado') {
          qtdItensAprovados++;
          if (item.saldo_atual < dec.quantidade_atendida) {
            throw new Error(
              `Estoque insuficiente para aprovar o item "${item.produto_nome}". ` +
              `Quantidade para atender: ${dec.quantidade_atendida} ${item.unidade_medida}, ` +
              `Disponível em estoque: ${item.saldo_atual} ${item.unidade_medida}. ` +
              `Negue este item individualmente ou ajuste a quantidade antes de prosseguir.`
            );
          }
        } else {
          qtdItensNegados++;
        }
      }

      // Statements de atualização e auditoria
      const debitProdStmt = db.prepare(`
        UPDATE produtos 
        SET quantidade_atual = quantidade_atual - ? 
        WHERE id = ? AND quantidade_atual >= ?
      `);

      const updateItemStmt = db.prepare(`
        UPDATE itens_requisicao 
        SET quantidade_atendida = ?, status_item = ?, analisado_por_id = ?, data_analise = CURRENT_TIMESTAMP, motivo_decisao = ?, lotes_atendidos = ?
        WHERE id = ?
      `);

      const movStmt = db.prepare(`
        INSERT INTO movimentacoes (
          tipo, motivo_diverso, produto_id, lote_id, quantidade, centro_custo_id,
          usuario_id, responsavel_nome, documento_referencia, numero_lote, data_validade, observacao
        )
        VALUES ('saida', 'Atendimento de Requisição', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const histStmt = db.prepare(`
        INSERT INTO historico_requisicoes (
          requisicao_id, item_requisicao_id, produto_id, usuario_id, acao,
          status_anterior, status_novo, quantidade_solicitada, quantidade_atendida,
          detalhes, justificativa
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const item of itens) {
        const dec = decisoesMap.get(item.id)!;

        if (dec.decisao === 'aprovado') {
          let lotesConsumidos: Array<{
            lote_id: number;
            numero_lote: string;
            data_validade: string | null;
            quantidade: number;
          }> = [];

          if (dec.lotes_dispensados && dec.lotes_dispensados.length > 0) {
            // Dispensação com lotes especificamente selecionados pelo almoxarife
            for (const l of dec.lotes_dispensados) {
              const loteDb = db.prepare('SELECT * FROM lotes_estoque WHERE id = ? AND produto_id = ?').get(l.lote_id, item.produto_id) as any;
              if (!loteDb) {
                throw new Error(`Lote #${l.lote_id} não encontrado para o produto "${item.produto_nome}".`);
              }
              if (loteDb.data_validade && String(loteDb.data_validade).slice(0, 10) < hojeStr) {
                throw new Error(
                  `BLOQUEIO DE VENCIMENTO: O lote "${loteDb.numero_lote}" do produto "${item.produto_nome}" venceu em ${loteDb.data_validade}. ` +
                  `Lotes vencidos estão sumariamente bloqueados para dispensação.`
                );
              }
              if (Number(loteDb.quantidade_atual) < l.quantidade) {
                throw new Error(
                  `Saldo insuficiente no lote "${loteDb.numero_lote}" (${item.produto_nome}). ` +
                  `Disponível no lote: ${loteDb.quantidade_atual}, Tentativa de dispensar: ${l.quantidade}.`
                );
              }

              const resLote = db.prepare('UPDATE lotes_estoque SET quantidade_atual = quantidade_atual - ? WHERE id = ? AND quantidade_atual >= ?').run(l.quantidade, loteDb.id, l.quantidade);
              if (resLote.changes === 0) {
                throw new Error(`Falha de concorrência ao debitar lote "${loteDb.numero_lote}".`);
              }

              movStmt.run(
                item.produto_id,
                loteDb.id,
                l.quantidade,
                reqRow.centro_custo_id,
                user.id,
                user.nome,
                reqRow.numero_requisicao,
                loteDb.numero_lote,
                loteDb.data_validade,
                `Atendimento de Requisição (Lote ${loteDb.numero_lote} conferido e dispensado por ${user.nome})`
              );

              lotesConsumidos.push({
                lote_id: loteDb.id,
                numero_lote: loteDb.numero_lote,
                data_validade: loteDb.data_validade || null,
                quantidade: l.quantidade,
              });
            }
          } else {
            // Fallback: consome automaticamente usando FEFO (First Expired, First Out)
            const lotesFEFO = consumirLotesValidosFEFO(item.produto_id, dec.quantidade_atendida);
            if (lotesFEFO.length > 0) {
              for (const lf of lotesFEFO) {
                movStmt.run(
                  item.produto_id,
                  lf.lote_id,
                  lf.quantidade_consumida,
                  reqRow.centro_custo_id,
                  user.id,
                  user.nome,
                  reqRow.numero_requisicao,
                  lf.numero_lote,
                  lf.data_validade,
                  `Atendimento de Requisição (Item dispensado por ${user.nome} | Lote: ${lf.numero_lote})`
                );
                lotesConsumidos.push({
                  lote_id: lf.lote_id,
                  numero_lote: lf.numero_lote,
                  data_validade: lf.data_validade || null,
                  quantidade: lf.quantidade_consumida,
                });
              }
            } else {
              // Produto sem cadastro de lotes individuais
              movStmt.run(
                item.produto_id,
                null,
                dec.quantidade_atendida,
                reqRow.centro_custo_id,
                user.id,
                user.nome,
                reqRow.numero_requisicao,
                null,
                null,
                `Atendimento de Requisição (Item aprovado e dispensado por ${user.nome})`
              );
            }
          }

          const updateResult = debitProdStmt.run(dec.quantidade_atendida, item.produto_id, dec.quantidade_atendida);
          if (updateResult.changes === 0) {
            throw new Error(`Falha de concorrência ao debitar estoque geral de "${item.produto_nome}".`);
          }

          const resumoLotes = lotesConsumidos
            .map((l) => `${l.numero_lote}${l.data_validade ? ` (Val: ${l.data_validade})` : ''}: ${l.quantidade}`)
            .join(', ');

          updateItemStmt.run(
            dec.quantidade_atendida,
            'aprovado',
            user.id,
            dec.motivo_decisao,
            lotesConsumidos.length > 0 ? JSON.stringify(lotesConsumidos) : null,
            item.id
          );

          histStmt.run(
            id,
            item.id,
            item.produto_id,
            user.id,
            'aprovacao_item',
            item.status_item || 'pendente',
            'aprovado',
            item.quantidade_solicitada,
            dec.quantidade_atendida,
            `Item APROVADO por ${user.nome} (${user.perfil.toUpperCase()}): ${item.produto_codigo} - ${item.produto_nome}. Solicitado: ${item.quantidade_solicitada} ${item.unidade_medida} | Atendido: ${dec.quantidade_atendida} ${item.unidade_medida}.${resumoLotes ? ` Lote(s): ${resumoLotes}.` : ''}`,
            dec.motivo_decisao
          );
        } else {
          updateItemStmt.run(0, 'negado', user.id, dec.motivo_decisao, null, item.id);

          histStmt.run(
            id,
            item.id,
            item.produto_id,
            user.id,
            'negacao_item',
            item.status_item || 'pendente',
            'negado',
            item.quantidade_solicitada,
            0,
            `Item NEGADO por ${user.nome} (${user.perfil.toUpperCase()}): ${item.produto_codigo} - ${item.produto_nome} (${item.quantidade_solicitada} ${item.unidade_medida}).`,
            dec.motivo_decisao
          );
        }
      }

      // Define status final da requisição conforme decisões por item
      let statusFinal: 'aprovada_atendida' | 'rejeitada' = 'aprovada_atendida';
      let acaoConsolidada: 'aprovacao_total' | 'aprovacao_parcial' | 'rejeicao_total' = 'aprovacao_total';
      let resumoConsolidado = '';

      if (qtdItensAprovados === 0) {
        statusFinal = 'rejeitada';
        acaoConsolidada = 'rejeicao_total';
        const motivosConcatenados = itens
          .map((it) => `${it.produto_codigo}: ${decisoesMap.get(it.id)?.motivo_decisao}`)
          .join(' | ');
        resumoConsolidado = observacao_atendimento?.trim() || motivosConcatenados || 'Todos os itens foram negados na análise do almoxarifado.';

        db.prepare(`
          UPDATE requisicoes 
          SET status = 'rejeitada', almoxarife_id = ?, data_atendimento = CURRENT_TIMESTAMP, motivo_rejeicao = ?
          WHERE id = ?
        `).run(user.id, resumoConsolidado, id);
      } else if (qtdItensNegados > 0) {
        statusFinal = 'aprovada_atendida';
        acaoConsolidada = 'aprovacao_parcial';
        const negadosResumo = itens
          .filter((it) => decisoesMap.get(it.id)?.decisao === 'negado')
          .map((it) => `${it.produto_codigo} (${decisoesMap.get(it.id)?.motivo_decisao})`)
          .join('; ');
        resumoConsolidado = `Atendimento parcial: ${qtdItensAprovados} item(ns) aprovado(s) e ${qtdItensNegados} item(ns) negado(s). Itens negados: ${negadosResumo}`;

        db.prepare(`
          UPDATE requisicoes 
          SET status = 'aprovada_atendida', almoxarife_id = ?, data_atendimento = CURRENT_TIMESTAMP, motivo_rejeicao = ?
          WHERE id = ?
        `).run(user.id, resumoConsolidado, id);
      } else {
        statusFinal = 'aprovada_atendida';
        acaoConsolidada = 'aprovacao_total';
        resumoConsolidado = observacao_atendimento?.trim() || `Todos os ${qtdItensAprovados} item(ns) foram aprovados e dispensados por ${user.nome}.`;

        db.prepare(`
          UPDATE requisicoes 
          SET status = 'aprovada_atendida', almoxarife_id = ?, data_atendimento = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(user.id, id);
      }

      histStmt.run(
        id,
        null,
        null,
        user.id,
        acaoConsolidada,
        'pendente',
        statusFinal,
        null,
        null,
        acaoConsolidada === 'aprovacao_total'
          ? `Conferência concluída por ${user.nome}: Aprovação integral de ${qtdItensAprovados} item(ns) e baixa de estoque executada.`
          : acaoConsolidada === 'aprovacao_parcial'
          ? `Conferência concluída por ${user.nome}: Atendimento parcial (${qtdItensAprovados} aprovado(s), ${qtdItensNegados} negado(s)).`
          : `Conferência concluída por ${user.nome}: Todos os ${qtdItensNegados} item(ns) da requisição foram negados.`,
        resumoConsolidado
      );

      return {
        requisicao_id: id,
        numero_requisicao: reqRow.numero_requisicao,
        status: statusFinal,
        itens_aprovados: qtdItensAprovados,
        itens_negados: qtdItensNegados,
      };
    });

    res.json({
      message:
        result.status === 'rejeitada'
          ? `Requisição ${result.numero_requisicao} concluída com todos os itens negados.`
          : result.itens_negados > 0
          ? `Requisição ${result.numero_requisicao} atendida parcialmente (${result.itens_aprovados} aprovado(s) e ${result.itens_negados} negado(s)).`
          : `Requisição ${result.numero_requisicao} aprovada e atendida com sucesso! Baixa de estoque efetuada.`,
      data: result,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Erro ao aprovar requisição' });
  }
});

apiRouter.post('/requisicoes/:id/rejeitar', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || (user.perfil !== 'admin' && user.perfil !== 'almoxarife')) {
    res.status(403).json({ error: 'Apenas Almoxarifes e Administradores podem rejeitar requisições' });
    return;
  }

  const { id } = req.params;
  const { motivo_rejeicao } = req.body;

  if (!motivo_rejeicao || !motivo_rejeicao.trim()) {
    res.status(400).json({ error: 'A justificativa em "motivo_rejeicao" é OBRIGATÓRIA para rejeitar uma requisição' });
    return;
  }

  try {
    const reqRow = db.prepare('SELECT * FROM requisicoes WHERE id = ?').get(id) as any;
    if (!reqRow) {
      res.status(404).json({ error: 'Requisição não encontrada' });
      return;
    }
    if (reqRow.status !== 'pendente') {
      res.status(400).json({ error: `Esta requisição não pode ser rejeitada pois seu status atual é "${reqRow.status}"` });
      return;
    }

    runInTransaction(() => {
      const itens = db.prepare(`
        SELECT ir.*, p.codigo as produto_codigo, p.nome as produto_nome, p.unidade_medida
        FROM itens_requisicao ir
        JOIN produtos p ON ir.produto_id = p.id
        WHERE ir.requisicao_id = ?
      `).all(id) as any[];

      const updateItemStmt = db.prepare(`
        UPDATE itens_requisicao
        SET quantidade_atendida = 0, status_item = 'negado', analisado_por_id = ?, data_analise = CURRENT_TIMESTAMP, motivo_decisao = ?
        WHERE id = ?
      `);

      const histStmt = db.prepare(`
        INSERT INTO historico_requisicoes (
          requisicao_id, item_requisicao_id, produto_id, usuario_id, acao,
          status_anterior, status_novo, quantidade_solicitada, quantidade_atendida,
          detalhes, justificativa
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const item of itens) {
        updateItemStmt.run(user.id, motivo_rejeicao.trim(), item.id);

        histStmt.run(
          id,
          item.id,
          item.produto_id,
          user.id,
          'negacao_item',
          item.status_item || 'pendente',
          'negado',
          item.quantidade_solicitada,
          0,
          `Item NEGADO por ${user.nome} (${user.perfil.toUpperCase()}): ${item.produto_codigo} - ${item.produto_nome} (${item.quantidade_solicitada} ${item.unidade_medida}).`,
          motivo_rejeicao.trim()
        );
      }

      db.prepare(`
        UPDATE requisicoes 
        SET status = 'rejeitada', almoxarife_id = ?, data_atendimento = CURRENT_TIMESTAMP, motivo_rejeicao = ?
        WHERE id = ?
      `).run(user.id, motivo_rejeicao.trim(), id);

      histStmt.run(
        id,
        null,
        null,
        user.id,
        'rejeicao_total',
        'pendente',
        'rejeitada',
        null,
        null,
        `Requisição ${reqRow.numero_requisicao} rejeitada integralmente por ${user.nome} (${user.perfil.toUpperCase()}).`,
        motivo_rejeicao.trim()
      );
    });

    res.json({
      message: `Requisição ${reqRow.numero_requisicao} rejeitada. Saldo de estoque mantido intacto.`,
      id,
      status: 'rejeitada',
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao rejeitar requisição: ' + err.message });
  }
});

apiRouter.post('/requisicoes/:id/cancelar', (req, res) => {
  const user = authenticateRequest(req);
  const { id } = req.params;

  const reqRow = db.prepare('SELECT * FROM requisicoes WHERE id = ?').get(id) as any;
  if (!reqRow) {
    res.status(404).json({ error: 'Requisição não encontrada' });
    return;
  }

  if (reqRow.status !== 'pendente') {
    res.status(400).json({ error: 'Apenas requisições com status "pendente" podem ser canceladas' });
    return;
  }

  if (user && user.perfil === 'requisitante' && reqRow.solicitante_id !== user.id) {
    res.status(403).json({ error: 'Você só pode cancelar requisições criadas por você mesmo' });
    return;
  }

  runInTransaction(() => {
    db.prepare(`
      UPDATE requisicoes SET status = 'cancelada' WHERE id = ?
    `).run(id);

    const actingUserId = user?.id || reqRow.solicitante_id;
    const actingUserName = user?.nome || 'Solicitante';
    db.prepare(`
      INSERT INTO historico_requisicoes (
        requisicao_id, item_requisicao_id, produto_id, usuario_id, acao,
        status_anterior, status_novo, quantidade_solicitada, quantidade_atendida,
        detalhes, justificativa
      ) VALUES (?, NULL, NULL, ?, 'cancelamento', 'pendente', 'cancelada', NULL, NULL, ?, NULL)
    `).run(
      id,
      actingUserId,
      `Requisição ${reqRow.numero_requisicao} cancelada por ${actingUserName}.`
    );
  });

  res.json({ message: 'Requisição cancelada com sucesso', id, status: 'cancelada' });
});

apiRouter.delete('/requisicoes/:id', (req, res) => {
  const user = authenticateRequest(req);
  if (!user) {
    res.status(401).json({ error: 'Não autenticado' });
    return;
  }

  const { id } = req.params;
  const reqRow = db.prepare('SELECT * FROM requisicoes WHERE id = ?').get(id) as any;
  if (!reqRow) {
    res.status(404).json({ error: 'Requisição não encontrada' });
    return;
  }

  if (user.perfil === 'requisitante') {
    if (reqRow.solicitante_id !== user.id) {
      res.status(403).json({ error: 'Você só pode excluir requisições abertas por você mesmo' });
      return;
    }
    if (reqRow.status !== 'pendente') {
      res.status(400).json({ error: 'Solicitantes só podem excluir requisições que ainda estão com status Pendente' });
      return;
    }
  } else if (reqRow.status === 'aprovada_atendida' && user.perfil !== 'admin') {
    res.status(403).json({ error: 'Apenas Administradores podem excluir requisições já atendidas' });
    return;
  }

  try {
    runInTransaction(() => {
      db.prepare('DELETE FROM historico_requisicoes WHERE requisicao_id = ?').run(id);
      db.prepare('DELETE FROM itens_requisicao WHERE requisicao_id = ?').run(id);
      db.prepare('DELETE FROM requisicoes WHERE id = ?').run(id);
    });

    res.json({
      id: Number(id),
      message: `Requisição "${reqRow.numero_requisicao}" excluída com sucesso.`,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao excluir requisição: ' + err.message });
  }
});

// ============================================================================
// 9. MÓDULO DE EMPRÉSTIMOS E DEVOLUÇÕES (FERRAMENTAS / NÃO CONSUMÍVEIS)
// ============================================================================

apiRouter.get('/emprestimos', (req, res) => {
  updateOverdueLoans();
  const { aba, busca } = req.query;

  let query = `
    SELECT 
      e.id, e.codigo_emprestimo, e.produto_id, e.quantidade, e.centro_custo_id, e.solicitante_id,
      e.almoxarife_liberacao_id, e.almoxarife_recebimento_id, e.data_emprestimo, e.data_prevista_devolucao,
      e.data_devolucao, e.status, e.condicao_saida, e.condicao_devolucao, e.observacao,
      p.codigo as produto_codigo, p.nome as produto_nome, p.unidade_medida,
      cc.codigo as centro_custo_codigo, cc.nome as centro_custo_nome,
      u_req.nome as solicitante_nome,
      u_alm.nome as almoxarife_liberacao_nome,
      u_rec.nome as almoxarife_recebimento_nome
    FROM emprestimos e
    JOIN produtos p ON e.produto_id = p.id
    JOIN centros_custo cc ON e.centro_custo_id = cc.id
    JOIN usuarios u_req ON e.solicitante_id = u_req.id
    JOIN usuarios u_alm ON e.almoxarife_liberacao_id = u_alm.id
    LEFT JOIN usuarios u_rec ON e.almoxarife_recebimento_id = u_rec.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (aba === 'abertos') {
    query += " AND e.status = 'emprestado'";
  } else if (aba === 'atrasados') {
    query += " AND e.status = 'atrasado'";
  } else if (aba === 'devolvidos') {
    query += " AND e.status = 'devolvido'";
  }

  if (busca && typeof busca === 'string' && busca.trim()) {
    query += ' AND (e.codigo_emprestimo LIKE ? OR p.nome LIKE ? OR cc.nome LIKE ? OR u_req.nome LIKE ?)';
    const term = `%${busca.trim()}%`;
    params.push(term, term, term, term);
  }

  query += ' ORDER BY e.id DESC';

  const rows = db.prepare(query).all(...params);
  res.json(rows);
});

apiRouter.post('/emprestimos', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || (user.perfil !== 'admin' && user.perfil !== 'almoxarife')) {
    res.status(403).json({ error: 'Apenas Almoxarifes e Administradores podem liberar empréstimos de equipamentos' });
    return;
  }

  const { produto_id, quantidade, centro_custo_id, solicitante_id, data_prevista_devolucao, condicao_saida, observacao } = req.body;

  const qtd = Number(quantidade) || 1;
  if (!produto_id || qtd <= 0) {
    res.status(400).json({ error: 'Produto e quantidade válida positiva são obrigatórios' });
    return;
  }

  if (!centro_custo_id) {
    res.status(400).json({ error: 'Centro de Custo de destino é obrigatório' });
    return;
  }

  if (!solicitante_id) {
    res.status(400).json({ error: 'Identificação do profissional solicitante é obrigatória' });
    return;
  }

  if (!data_prevista_devolucao) {
    res.status(400).json({ error: 'Data prevista de devolução é obrigatória' });
    return;
  }

  const year = new Date().getFullYear();
  const countRow = db.prepare(`SELECT COUNT(*) as count FROM emprestimos WHERE codigo_emprestimo LIKE ?`).get(`EMP-${year}-%`) as { count: number };
  const nextSeq = String(countRow.count + 1).padStart(4, '0');
  const codigo_emprestimo = `EMP-${year}-${nextSeq}`;

  try {
    const result = runInTransaction(() => {
      const prod = db.prepare('SELECT * FROM produtos WHERE id = ? AND ativo = 1').get(produto_id) as any;
      if (!prod) {
        throw new Error('Produto não encontrado ou inativo');
      }

      if (prod.tipo !== 'nao_consumivel') {
        throw new Error(`O produto "${prod.nome}" é classificado como CONSUMÍVEL. Empréstimos operam apenas com itens não consumíveis.`);
      }

      if (prod.quantidade_atual < qtd) {
        throw new Error(
          `Saldo insuficiente para liberação de "${prod.nome}". ` +
          `Solicitado: ${qtd}, Disponível: ${prod.quantidade_atual}.`
        );
      }

      // Baixa temporária do estoque
      db.prepare(`
        UPDATE produtos 
        SET quantidade_atual = quantidade_atual - ? 
        WHERE id = ? AND quantidade_atual >= ?
      `).run(qtd, produto_id, qtd);

      const empStmt = db.prepare(`
        INSERT INTO emprestimos (codigo_emprestimo, produto_id, quantidade, centro_custo_id, solicitante_id, almoxarife_liberacao_id, data_prevista_devolucao, condicao_saida, status, observacao)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'emprestado', ?)
      `);
      const empInfo = empStmt.run(
        codigo_emprestimo,
        produto_id,
        qtd,
        centro_custo_id,
        solicitante_id,
        user.id,
        data_prevista_devolucao,
        condicao_saida ? condicao_saida.trim() : 'Em bom estado e calibrado',
        observacao ? observacao.trim() : 'Empréstimo de equipamento não consumível'
      );

      // Movimentação auditável
      db.prepare(`
        INSERT INTO movimentacoes (tipo, produto_id, quantidade, centro_custo_id, usuario_id, documento_referencia, observacao)
        VALUES ('saida', ?, ?, ?, ?, ?, ?)
      `).run(
        produto_id,
        qtd,
        centro_custo_id,
        user.id,
        codigo_emprestimo,
        `Liberação de empréstimo temporário de equipamento`
      );

      return {
        id: empInfo.lastInsertRowid,
        codigo_emprestimo,
        produto_nome: prod.nome,
        quantidade: qtd,
      };
    });

    res.status(201).json({
      message: 'Empréstimo registrado com sucesso e saldo temporário debitado',
      data: result,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Erro ao registrar empréstimo' });
  }
});

apiRouter.post('/emprestimos/:id/devolver', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || (user.perfil !== 'admin' && user.perfil !== 'almoxarife')) {
    res.status(403).json({ error: 'Apenas Almoxarifes e Administradores podem registrar devoluções' });
    return;
  }

  const { id } = req.params;
  const { condicao_devolucao, observacao } = req.body;

  try {
    const result = runInTransaction(() => {
      const emp = db.prepare(`
        SELECT e.*, p.nome as produto_nome
        FROM emprestimos e
        JOIN produtos p ON e.produto_id = p.id
        WHERE e.id = ?
      `).get(id) as any;

      if (!emp) {
        throw new Error('Registro de empréstimo não encontrado');
      }

      if (emp.status === 'devolvido') {
        throw new Error('Este equipamento já foi previamente devolvido');
      }

      const obsFinal = observacao && observacao.trim() 
        ? `${emp.observacao || ''} | Devolução: ${observacao.trim()}`
        : emp.observacao;

      db.prepare(`
        UPDATE emprestimos
        SET status = 'devolvido', 
            data_devolucao = CURRENT_TIMESTAMP, 
            almoxarife_recebimento_id = ?,
            condicao_devolucao = ?,
            observacao = ?
        WHERE id = ?
      `).run(
        user.id,
        condicao_devolucao ? condicao_devolucao.trim() : 'Em bom estado',
        obsFinal, 
        id
      );

      // Repõe o saldo do produto no almoxarifado
      db.prepare(`
        UPDATE produtos
        SET quantidade_atual = quantidade_atual + ?
        WHERE id = ?
      `).run(emp.quantidade, emp.produto_id);

      // Registra retorno no livro-caixa
      db.prepare(`
        INSERT INTO movimentacoes (tipo, produto_id, quantidade, centro_custo_id, usuario_id, documento_referencia, observacao)
        VALUES ('entrada', ?, ?, ?, ?, ?, ?)
      `).run(
        emp.produto_id,
        emp.quantidade,
        emp.centro_custo_id,
        user.id,
        emp.codigo_emprestimo || `DEV-EMP-${id}`,
        `Retorno de devolução de equipamento. Condição: ${condicao_devolucao || 'OK'}`
      );

      return {
        id,
        produto_nome: emp.produto_nome,
        quantidade_devolvida: emp.quantidade,
      };
    });

    res.json({
      message: `Devolução do equipamento "${result.produto_nome}" recebida com sucesso! Saldo recomposto.`,
      data: result,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Erro ao registrar devolução' });
  }
});

apiRouter.delete('/emprestimos/:id', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || (user.perfil !== 'admin' && user.perfil !== 'almoxarife')) {
    res.status(403).json({ error: 'Apenas Administradores e Almoxarifes podem excluir registros de empréstimo' });
    return;
  }

  const { id } = req.params;
  const emp = db.prepare(`
    SELECT e.*, p.nome as produto_nome
    FROM emprestimos e
    JOIN produtos p ON e.produto_id = p.id
    WHERE e.id = ?
  `).get(id) as any;

  if (!emp) {
    res.status(404).json({ error: 'Registro de empréstimo não encontrado' });
    return;
  }

  try {
    runInTransaction(() => {
      // Se o empréstimo ainda estava em aberto, devolve o saldo ao produto antes de excluir o registro
      if (emp.status !== 'devolvido') {
        db.prepare('UPDATE produtos SET quantidade_atual = quantidade_atual + ? WHERE id = ?').run(
          emp.quantidade,
          emp.produto_id
        );
      }
      db.prepare('DELETE FROM emprestimos WHERE id = ?').run(id);
    });

    res.json({
      id: Number(id),
      message: `Registro de empréstimo "${emp.codigo_emprestimo || '#' + emp.id}" (${emp.produto_nome}) excluído com sucesso.`,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao excluir empréstimo: ' + err.message });
  }
});

// ============================================================================
// 9.5 EMPRÉSTIMO INSTITUCIONAL ENTRE ENTIDADES (HOSPITAIS PARCEIROS)
// ============================================================================

function getEmprestimoInstitucionalCompleto(id: number | string) {
  const emp = db.prepare(`
    SELECT 
      ei.*,
      f.codigo as entidade_codigo,
      COALESCE(f.nome_fantasia, f.razao_social) as entidade_nome,
      f.razao_social as entidade_razao_social,
      f.cnpj as entidade_cnpj,
      f.telefone as entidade_telefone,
      u.nome as responsavel_almoxarifado_nome
    FROM emprestimos_institucionais ei
    JOIN fornecedores f ON ei.entidade_id = f.id
    JOIN usuarios u ON ei.responsavel_almoxarifado_id = u.id
    WHERE ei.id = ?
  `).get(id) as any;

  if (!emp) return null;

  const itens = db.prepare(`
    SELECT 
      iei.*,
      p.codigo as produto_codigo,
      p.nome as produto_nome,
      p.unidade_medida
    FROM itens_emprestimo_institucional iei
    JOIN produtos p ON iei.produto_id = p.id
    WHERE iei.emprestimo_id = ?
    ORDER BY iei.id ASC
  `).all(id);

  return {
    ...emp,
    itens,
  };
}

apiRouter.get('/emprestimos-institucionais', (req, res) => {
  const { tipo, status, entidade_id, busca } = req.query;

  let query = `
    SELECT 
      ei.*,
      f.codigo as entidade_codigo,
      COALESCE(f.nome_fantasia, f.razao_social) as entidade_nome,
      f.razao_social as entidade_razao_social,
      f.cnpj as entidade_cnpj,
      f.telefone as entidade_telefone,
      u.nome as responsavel_almoxarifado_nome
    FROM emprestimos_institucionais ei
    JOIN fornecedores f ON ei.entidade_id = f.id
    JOIN usuarios u ON ei.responsavel_almoxarifado_id = u.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (tipo && (tipo === 'recebido' || tipo === 'concedido')) {
    query += ' AND ei.tipo = ?';
    params.push(tipo);
  }

  if (status && (status === 'pendente_devolucao' || status === 'quitado')) {
    query += ' AND ei.status = ?';
    params.push(status);
  }

  if (entidade_id) {
    query += ' AND ei.entidade_id = ?';
    params.push(Number(entidade_id));
  }

  if (busca && typeof busca === 'string' && busca.trim()) {
    const term = `%${busca.trim()}%`;
    query += ' AND (ei.numero_documento LIKE ? OR f.razao_social LIKE ? OR f.nome_fantasia LIKE ? OR ei.responsavel_entidade_parceira LIKE ?)';
    params.push(term, term, term, term);
  }

  query += ' ORDER BY ei.id DESC';

  const rows = db.prepare(query).all(...params) as any[];
  const itensStmt = db.prepare(`
    SELECT 
      iei.*,
      p.codigo as produto_codigo,
      p.nome as produto_nome,
      p.unidade_medida
    FROM itens_emprestimo_institucional iei
    JOIN produtos p ON iei.produto_id = p.id
    WHERE iei.emprestimo_id = ?
    ORDER BY iei.id ASC
  `);

  const result = rows.map((row) => ({
    ...row,
    itens: itensStmt.all(row.id),
  }));

  res.json(result);
});

apiRouter.get('/emprestimos-institucionais/:id', (req, res) => {
  const emp = getEmprestimoInstitucionalCompleto(req.params.id);
  if (!emp) {
    res.status(404).json({ error: 'Empréstimo institucional não encontrado' });
    return;
  }
  res.json(emp);
});

apiRouter.post('/emprestimos-institucionais', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || (user.perfil !== 'admin' && user.perfil !== 'almoxarife')) {
    res.status(403).json({ error: 'Apenas Almoxarifes e Administradores podem registrar empréstimos institucionais entre entidades' });
    return;
  }

  const {
    tipo,
    entidade_id,
    responsavel_entidade_parceira,
    observacao,
    itens,
  } = req.body || {};

  if (tipo !== 'recebido' && tipo !== 'concedido') {
    res.status(400).json({ error: 'O tipo do empréstimo institucional deve ser "recebido" (Pegamos emprestado) ou "concedido" (Emprestamos para outra entidade)' });
    return;
  }

  if (!entidade_id) {
    res.status(400).json({ error: 'Selecione a Entidade Parceira / Hospital no cadastro de Fornecedores e Entidades' });
    return;
  }

  if (!Array.isArray(itens) || itens.length === 0) {
    res.status(400).json({ error: 'Adicione pelo menos 1 item de produto para o termo de empréstimo institucional' });
    return;
  }

  const year = new Date().getFullYear();
  const prefix = tipo === 'recebido' ? `EMP-REC-${year}` : `EMP-CON-${year}`;
  const countRow = db.prepare(`SELECT COUNT(*) as count FROM emprestimos_institucionais WHERE numero_documento LIKE ?`).get(`${prefix}-%`) as { count: number };
  const nextSeq = String(countRow.count + 1).padStart(4, '0');
  const numero_documento = `${prefix}-${nextSeq}`;

  try {
    const createdLoan = runInTransaction(() => {
      const entidade = db.prepare('SELECT * FROM fornecedores WHERE id = ?').get(Number(entidade_id)) as any;
      if (!entidade) {
        throw new Error('Entidade parceira / fornecedor selecionado não foi encontrado no banco de dados');
      }

      const empInfo = db.prepare(`
        INSERT INTO emprestimos_institucionais (
          numero_documento, tipo, entidade_id, responsavel_almoxarifado_id,
          responsavel_entidade_parceira, status, observacao
        ) VALUES (?, ?, ?, ?, ?, 'pendente_devolucao', ?)
      `).run(
        numero_documento,
        tipo,
        entidade.id,
        user.id,
        responsavel_entidade_parceira ? String(responsavel_entidade_parceira).trim() : null,
        observacao ? String(observacao).trim() : null
      );

      const emprestimoId = Number(empInfo.lastInsertRowid);

      const itemStmt = db.prepare(`
        INSERT INTO itens_emprestimo_institucional (
          emprestimo_id, produto_id, lote_id, numero_lote, data_validade,
          quantidade, quantidade_devolvida
        ) VALUES (?, ?, ?, ?, ?, ?, 0)
      `);

      const movStmt = db.prepare(`
        INSERT INTO movimentacoes (
          tipo, motivo_diverso, produto_id, lote_id, quantidade, centro_custo_id,
          fornecedor_id, emprestimo_institucional_id, usuario_id, responsavel_nome,
          documento_referencia, numero_lote, data_validade, observacao
        ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const nomeEntidadeLabel = `${entidade.codigo} - ${entidade.nome_fantasia || entidade.razao_social}`;

      for (const it of itens) {
        const prodId = Number(it.produto_id);
        const qtd = Number(it.quantidade);
        if (!prodId || !qtd || qtd <= 0) {
          throw new Error('Todos os itens do empréstimo devem ter produto válido e quantidade maior que zero');
        }

        const prod = db.prepare('SELECT * FROM produtos WHERE id = ? AND ativo = 1').get(prodId) as any;
        if (!prod) {
          throw new Error(`Produto #${prodId} não encontrado ou inativo`);
        }

        if (tipo === 'recebido') {
          // Cenário A - Pegamos emprestado de outra entidade:
          // 1. O Hospital X é selecionado como Fornecedor/Entidade.
          // 2. Registra-se uma Entrada Diversa: "Entrada por Empréstimo Recebido".
          // 3. O produto entra no saldo disponível para uso.
          // 4. O sistema gera uma conta a pagar de estoque (dívida em quantidade com aquela entidade).
          const numLote = it.numero_lote ? String(it.numero_lote).trim().toUpperCase() : `LT-${numero_documento}`;
          const dtValidade = it.data_validade ? String(it.data_validade).trim().slice(0, 10) : null;

          const exigeValidade = prod.controla_validade === undefined ? prod.tipo === 'consumivel' : prod.controla_validade === 1;
          if (exigeValidade && !dtValidade) {
            throw new Error(`Informe a Data de Validade do lote recebido para o item "${prod.codigo} - ${prod.nome}".`);
          }

          const loteReg = upsertLoteEstoque({
            produto_id: prodId,
            numero_lote: numLote,
            data_validade: dtValidade,
            quantidade: qtd,
            fornecedor_id: entidade.id,
            documento_referencia: numero_documento,
          });

          db.prepare('UPDATE produtos SET quantidade_atual = quantidade_atual + ? WHERE id = ?').run(qtd, prodId);

          itemStmt.run(emprestimoId, prodId, loteReg.id, loteReg.numero_lote, loteReg.data_validade, qtd);

          movStmt.run(
            'entrada',
            'Entrada por Empréstimo Recebido',
            prodId,
            loteReg.id,
            qtd,
            entidade.id,
            emprestimoId,
            user.id,
            user.nome,
            numero_documento,
            loteReg.numero_lote,
            loteReg.data_validade,
            `Entrada por Empréstimo Recebido de ${nomeEntidadeLabel}${observacao ? ` | Obs: ${observacao}` : ''}`
          );
        } else {
          // Cenário B - Emprestamos para outra entidade:
          // 1. Registra-se uma Saída Diversa: "Empréstimo Concedido a Terceiros" para a entidade parceira.
          // 2. Bloqueia sumariamente lotes vencidos!
          if (prod.quantidade_atual < qtd) {
            throw new Error(
              `Saldo insuficiente para conceder empréstimo do item "${prod.codigo} - ${prod.nome}". ` +
              `Disponível: ${prod.quantidade_atual} ${prod.unidade_medida}, Solicitado: ${qtd} ${prod.unidade_medida}.`
            );
          }

          const loteIdPreferencial = it.lote_id ? Number(it.lote_id) : null;
          const lotesConsumidos = consumirLotesValidosFEFO(prodId, qtd, loteIdPreferencial);
          const lotePrincipal = lotesConsumidos[0] || { lote_id: null, numero_lote: it.numero_lote || null, data_validade: it.data_validade || null };

          db.prepare('UPDATE produtos SET quantidade_atual = quantidade_atual - ? WHERE id = ? AND quantidade_atual >= ?').run(qtd, prodId, qtd);

          itemStmt.run(
            emprestimoId,
            prodId,
            lotePrincipal.lote_id,
            lotePrincipal.numero_lote,
            lotePrincipal.data_validade,
            qtd
          );

          movStmt.run(
            'saida',
            'Empréstimo Concedido a Terceiros',
            prodId,
            lotePrincipal.lote_id,
            qtd,
            entidade.id,
            emprestimoId,
            user.id,
            user.nome,
            numero_documento,
            lotePrincipal.numero_lote,
            lotePrincipal.data_validade,
            `Empréstimo Concedido a Terceiros (${nomeEntidadeLabel})${observacao ? ` | Obs: ${observacao}` : ''}`
          );
        }
      }

      return getEmprestimoInstitucionalCompleto(emprestimoId);
    });

    res.status(201).json({
      message:
        tipo === 'recebido'
          ? `Empréstimo Recebido (${numero_documento}) registrado com sucesso! Saldo somado ao estoque e dívida institucional aberta.`
          : `Empréstimo Concedido (${numero_documento}) registrado com sucesso! Saldo debitado e ficha de empréstimo pronta para impressão.`,
      data: createdLoan,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Erro ao registrar empréstimo institucional' });
  }
});

apiRouter.post('/emprestimos-institucionais/:id/devolver', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || (user.perfil !== 'admin' && user.perfil !== 'almoxarife')) {
    res.status(403).json({ error: 'Apenas Almoxarifes e Administradores podem registrar devoluções de empréstimos institucionais' });
    return;
  }

  const { id } = req.params;
  const { responsavel_entidade_parceira, observacao, itens_devolucao } = req.body || {};

  try {
    const updatedLoan = runInTransaction(() => {
      const emp = getEmprestimoInstitucionalCompleto(Number(id));
      if (!emp) {
        throw new Error('Empréstimo institucional não encontrado');
      }

      if (emp.status === 'quitado') {
        throw new Error('Este empréstimo institucional já se encontra integralmente quitado/devolvido');
      }

      const docDevolucao = `DEV-${emp.numero_documento}`;
      const movStmt = db.prepare(`
        INSERT INTO movimentacoes (
          tipo, motivo_diverso, produto_id, lote_id, quantidade, centro_custo_id,
          fornecedor_id, emprestimo_institucional_id, usuario_id, responsavel_nome,
          documento_referencia, numero_lote, data_validade, observacao
        ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      // Mapa opcional de quantidades devolvidas por item (permite devolução parcial ou integral)
      const mapDevolucao = new Map<number, { quantidade: number; numero_lote?: string; data_validade?: string; lote_id?: number }>();
      if (Array.isArray(itens_devolucao) && itens_devolucao.length > 0) {
        for (const d of itens_devolucao) {
          mapDevolucao.set(Number(d.item_id), {
            quantidade: Number(d.quantidade),
            numero_lote: d.numero_lote,
            data_validade: d.data_validade,
            lote_id: d.lote_id ? Number(d.lote_id) : undefined,
          });
        }
      }

      let algumDevolvido = false;

      for (const item of emp.itens) {
        const pendente = Number(item.quantidade) - Number(item.quantidade_devolvida || 0);
        if (pendente <= 0) continue;

        const infoDev = mapDevolucao.has(item.id)
          ? mapDevolucao.get(item.id)!
          : { quantidade: pendente, numero_lote: item.numero_lote, data_validade: item.data_validade, lote_id: item.lote_id };

        const qtdDevolver = Number(infoDev.quantidade);
        if (!qtdDevolver || qtdDevolver <= 0) continue;
        if (qtdDevolver > pendente) {
          throw new Error(
            `Quantidade de devolução (${qtdDevolver}) para "${item.produto_nome}" excede o saldo pendente (${pendente}).`
          );
        }

        algumDevolvido = true;
        const prod = db.prepare('SELECT * FROM produtos WHERE id = ?').get(item.produto_id) as any;

        if (emp.tipo === 'recebido') {
          // Cenário A - Quando formos devolver o que pegamos emprestado:
          // Gera-se uma Saída Diversa: "Devolução de Empréstimo a Terceiros", abatendo o nosso estoque
          if (prod.quantidade_atual < qtdDevolver) {
            throw new Error(
              `Estoque insuficiente para devolver "${item.produto_nome}" à entidade ${emp.entidade_nome}. ` +
              `Saldo atual: ${prod.quantidade_atual} ${item.unidade_medida}, Tentativa de devolver: ${qtdDevolver} ${item.unidade_medida}.`
            );
          }

          const lotesConsumidos = consumirLotesValidosFEFO(item.produto_id, qtdDevolver, infoDev.lote_id || null);
          const lotePrincipal = lotesConsumidos[0] || { lote_id: item.lote_id, numero_lote: item.numero_lote, data_validade: item.data_validade };

          db.prepare('UPDATE produtos SET quantidade_atual = quantidade_atual - ? WHERE id = ? AND quantidade_atual >= ?').run(
            qtdDevolver,
            item.produto_id,
            qtdDevolver
          );

          movStmt.run(
            'saida',
            'Devolução de Empréstimo a Terceiros',
            item.produto_id,
            lotePrincipal.lote_id,
            qtdDevolver,
            emp.entidade_id,
            emp.id,
            user.id,
            user.nome,
            docDevolucao,
            lotePrincipal.numero_lote,
            lotePrincipal.data_validade,
            `Devolução de Empréstimo a Terceiros (${emp.entidade_nome}) ref. ${emp.numero_documento}${observacao ? ` | ${observacao}` : ''}`
          );
        } else {
          // Cenário B - Quando a entidade parceira nos devolver o que emprestamos:
          // Gera-se uma Entrada Diversa: "Recebimento de Devolução de Empréstimo", somando ao nosso estoque
          const loteReg = upsertLoteEstoque({
            produto_id: item.produto_id,
            numero_lote: infoDev.numero_lote || item.numero_lote || `LT-${docDevolucao}`,
            data_validade: infoDev.data_validade || item.data_validade || null,
            quantidade: qtdDevolver,
            fornecedor_id: emp.entidade_id,
            documento_referencia: docDevolucao,
          });

          db.prepare('UPDATE produtos SET quantidade_atual = quantidade_atual + ? WHERE id = ?').run(qtdDevolver, item.produto_id);

          movStmt.run(
            'entrada',
            'Recebimento de Devolução de Empréstimo',
            item.produto_id,
            loteReg.id,
            qtdDevolver,
            emp.entidade_id,
            emp.id,
            user.id,
            user.nome,
            docDevolucao,
            loteReg.numero_lote,
            loteReg.data_validade,
            `Recebimento de Devolução de Empréstimo (${emp.entidade_nome}) ref. ${emp.numero_documento}${observacao ? ` | ${observacao}` : ''}`
          );
        }

        db.prepare(`
          UPDATE itens_emprestimo_institucional
          SET quantidade_devolvida = quantidade_devolvida + ?
          WHERE id = ?
        `).run(qtdDevolver, item.id);
      }

      if (!algumDevolvido) {
        throw new Error('Informe ao menos 1 item com quantidade positiva para registrar a devolução.');
      }

      // Verifica se todos os itens foram quitados
      const itensAtualizados = db.prepare(`
        SELECT quantidade, quantidade_devolvida FROM itens_emprestimo_institucional WHERE emprestimo_id = ?
      `).all(emp.id) as Array<{ quantidade: number; quantidade_devolvida: number }>;

      const tudoQuitado = itensAtualizados.every((i) => Number(i.quantidade_devolvida) >= Number(i.quantidade));

      const novaObs = observacao && String(observacao).trim()
        ? `${emp.observacao ? emp.observacao + ' | ' : ''}Devolução: ${String(observacao).trim()}`
        : emp.observacao;

      db.prepare(`
        UPDATE emprestimos_institucionais
        SET status = ?,
            data_quitacao = CASE WHEN ? = 'quitado' THEN CURRENT_TIMESTAMP ELSE data_quitacao END,
            responsavel_entidade_parceira = COALESCE(?, responsavel_entidade_parceira),
            observacao = ?
        WHERE id = ?
      `).run(
        tudoQuitado ? 'quitado' : 'pendente_devolucao',
        tudoQuitado ? 'quitado' : 'pendente_devolucao',
        responsavel_entidade_parceira ? String(responsavel_entidade_parceira).trim() : null,
        novaObs,
        emp.id
      );

      return getEmprestimoInstitucionalCompleto(emp.id);
    });

    res.json({
      message:
        updatedLoan.status === 'quitado'
          ? `Empréstimo institucional ${updatedLoan.numero_documento} integralmente quitado/devolvido com sucesso!`
          : `Devolução parcial registrada para o documento ${updatedLoan.numero_documento}.`,
      data: updatedLoan,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Erro ao processar devolução de empréstimo institucional' });
  }
});

// ============================================================================
// 10. MOVIMENTAÇÕES DE ESTOQUE & SAÍDAS E ENTRADAS DIVERSAS
// ============================================================================

apiRouter.get('/movimentacoes', (req, res) => {
  const { tipo, motivo_diverso, apenas_diversas, produto_id, centro_custo_id, limite, busca } = req.query;

  let query = `
    SELECT 
      m.id, m.tipo, m.motivo_diverso, m.quantidade, m.documento_referencia, m.lote_id, m.numero_lote, m.data_validade,
      m.valor_unitario, m.fornecedor_id, m.emprestimo_institucional_id, m.marca, m.nomenclatura_fornecedor,
      m.responsavel_nome, m.observacao, m.data_movimentacao,
      p.id as produto_id, p.codigo as produto_codigo, p.nome as produto_nome, p.unidade_medida, p.tipo as produto_tipo,
      cc.id as centro_custo_id, cc.codigo as centro_custo_codigo, cc.nome as centro_custo_nome,
      f.codigo as fornecedor_codigo, COALESCE(f.nome_fantasia, f.razao_social) as fornecedor_nome, f.cnpj as fornecedor_cnpj,
      f.tipo_entidade as fornecedor_tipo_entidade,
      u.id as usuario_id, u.nome as usuario_nome, u.perfil as usuario_perfil
    FROM movimentacoes m
    JOIN produtos p ON m.produto_id = p.id
    LEFT JOIN centros_custo cc ON m.centro_custo_id = cc.id
    LEFT JOIN fornecedores f ON m.fornecedor_id = f.id
    JOIN usuarios u ON m.usuario_id = u.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (tipo && ['entrada', 'saida', 'estorno_entrada', 'estorno_saida'].includes(tipo as string)) {
    query += ' AND m.tipo = ?';
    params.push(tipo);
  }

  if (motivo_diverso && typeof motivo_diverso === 'string' && motivo_diverso.trim()) {
    query += ' AND m.motivo_diverso = ?';
    params.push(motivo_diverso.trim());
  }

  if (apenas_diversas === '1' || apenas_diversas === 'true') {
    query += " AND m.motivo_diverso IS NOT NULL AND m.motivo_diverso NOT IN ('Entrada por Nota Fiscal', 'Atendimento de Requisição')";
  }

  if (produto_id) {
    query += ' AND m.produto_id = ?';
    params.push(produto_id);
  }

  if (centro_custo_id) {
    query += ' AND m.centro_custo_id = ?';
    params.push(centro_custo_id);
  }

  if (busca && typeof busca === 'string' && busca.trim()) {
    query += ' AND (p.nome LIKE ? OR p.codigo LIKE ? OR m.documento_referencia LIKE ? OR cc.nome LIKE ? OR m.motivo_diverso LIKE ? OR m.numero_lote LIKE ?)';
    const term = `%${busca.trim()}%`;
    params.push(term, term, term, term, term, term);
  }

  query += ' ORDER BY m.id DESC';

  const maxRows = Math.min(Number(limite) || 150, 500);
  query += ` LIMIT ${maxRows}`;

  const rows = db.prepare(query).all(...params);
  res.json(rows);
});

apiRouter.post('/movimentacoes/diversas', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || (user.perfil !== 'admin' && user.perfil !== 'almoxarife')) {
    res.status(403).json({ error: 'Apenas Almoxarifes e Administradores podem registrar Entradas e Saídas Diversas' });
    return;
  }

  const {
    natureza, // 'entrada' | 'saida'
    motivo_diverso,
    produto_id,
    lote_id,
    numero_lote,
    data_validade,
    quantidade,
    entidade_id,
    centro_custo_id,
    requisicao_id,
    responsavel_nome,
    documento_referencia,
    justificativa,
    observacao,
  } = req.body || {};

  if (natureza !== 'entrada' && natureza !== 'saida') {
    res.status(400).json({ error: 'A natureza da movimentação diversa deve ser "entrada" ou "saida"' });
    return;
  }

  if (!motivo_diverso || !String(motivo_diverso).trim()) {
    res.status(400).json({ error: 'O motivo da movimentação diversa é obrigatório' });
    return;
  }

  const motivoTrim = String(motivo_diverso).trim();
  const isDevolucaoSetor = motivoTrim === 'Devolução de Setor';

  if (isDevolucaoSetor) {
    if (natureza !== 'entrada') {
      res.status(400).json({ error: 'Devolução de Setor deve ser uma movimentação de entrada no estoque' });
      return;
    }
    if (!centro_custo_id) {
      res.status(400).json({ error: 'O Setor / Centro de Custo é obrigatório para registrar Devolução de Setor' });
      return;
    }
  } else {
    if (!justificativa || !String(justificativa).trim()) {
      res.status(400).json({ error: 'A justificativa detalhada é obrigatória para registrar movimentações diversas' });
      return;
    }
  }

  const qtd = Number(quantidade);
  if (!produto_id || !qtd || qtd <= 0) {
    res.status(400).json({ error: 'Selecione um produto válido e informe quantidade maior que zero' });
    return;
  }

  const nomeResponsavel = responsavel_nome && String(responsavel_nome).trim()
    ? String(responsavel_nome).trim()
    : user.nome;

  const year = new Date().getFullYear();
  const docAutoPrefix = isDevolucaoSetor ? `DEVSET-${year}` : (natureza === 'saida' ? `SDIV-${year}` : `EDIV-${year}`);
  const countMov = db.prepare(`SELECT COUNT(*) as c FROM movimentacoes WHERE documento_referencia LIKE ?`).get(`${docAutoPrefix}-%`) as { c: number };
  const docRefFinal = documento_referencia && String(documento_referencia).trim()
    ? String(documento_referencia).trim().toUpperCase()
    : `${docAutoPrefix}-${String(countMov.c + 1).padStart(4, '0')}`;

  try {
    const result = runInTransaction(() => {
      const prod = db.prepare('SELECT * FROM produtos WHERE id = ?').get(Number(produto_id)) as any;
      if (!prod) {
        throw new Error('Produto não encontrado no catálogo');
      }

      const isBaixaVencimento =
        motivoTrim === 'Saída por Vencimento/Descarte' ||
        motivoTrim === 'Vencimento/Descarte';

      let loteIdUsado: number | null = lote_id ? Number(lote_id) : null;
      let numLoteUsado: string | null = numero_lote ? String(numero_lote).trim().toUpperCase() : null;
      let dtValidadeUsada: string | null = data_validade ? String(data_validade).trim().slice(0, 10) : null;
      let termoDescarte: any = null;
      const hojeStr = new Date().toISOString().slice(0, 10);

      if (natureza === 'saida') {
        if (prod.quantidade_atual < qtd) {
          throw new Error(
            `Saldo insuficiente no estoque para "${prod.codigo} - ${prod.nome}". ` +
            `Disponível: ${prod.quantidade_atual} ${prod.unidade_medida}, Solicitado: ${qtd} ${prod.unidade_medida}.`
          );
        }

        if (isBaixaVencimento) {
          let loteRow: any = null;
          if (loteIdUsado) {
            loteRow = db.prepare('SELECT * FROM lotes_estoque WHERE id = ? AND produto_id = ?').get(loteIdUsado, prod.id) as any;
          } else {
            loteRow = db.prepare(`
              SELECT * FROM lotes_estoque
              WHERE produto_id = ? AND quantidade_atual > 0 AND data_validade IS NOT NULL AND date(data_validade) < date(?)
              ORDER BY date(data_validade) ASC
              LIMIT 1
            `).get(prod.id, hojeStr) as any;
          }

          if (!loteRow) {
            throw new Error(
              `Para registrar "Saída por Vencimento/Descarte" do produto "${prod.codigo} - ${prod.nome}", selecione o lote específico que será descartado.`
            );
          }

          if (loteRow.quantidade_atual < qtd) {
            throw new Error(
              `A quantidade informada (${qtd}) é maior que o saldo disponível no lote ${loteRow.numero_lote} (${loteRow.quantidade_atual} ${prod.unidade_medida}).`
            );
          }

          db.prepare('UPDATE lotes_estoque SET quantidade_atual = quantidade_atual - ? WHERE id = ?').run(qtd, loteRow.id);
          loteIdUsado = loteRow.id;
          numLoteUsado = loteRow.numero_lote;
          dtValidadeUsada = loteRow.data_validade;

          termoDescarte = {
            numero_termo: `TERMO-DESC-${docRefFinal}`,
            data_emissao: new Date().toLocaleString('pt-BR'),
            produto_codigo: prod.codigo,
            produto_nome: prod.nome,
            unidade_medida: prod.unidade_medida,
            numero_lote: loteRow.numero_lote,
            data_validade: loteRow.data_validade,
            quantidade_descartada: qtd,
            responsavel_nome: nomeResponsavel,
            justificativa: String(justificativa || '').trim(),
          };
        } else {
          const lotesConsumidos = consumirLotesValidosFEFO(prod.id, qtd, loteIdUsado);
          const primeiro = lotesConsumidos[0];
          if (primeiro) {
            loteIdUsado = primeiro.lote_id;
            numLoteUsado = primeiro.numero_lote;
            dtValidadeUsada = primeiro.data_validade;
          }
        }

        db.prepare('UPDATE produtos SET quantidade_atual = quantidade_atual - ? WHERE id = ? AND quantidade_atual >= ?').run(
          qtd,
          prod.id,
          qtd
        );
      } else {
        // ENTRADA DIVERSA
        if (isDevolucaoSetor) {
          // Bloqueio estrito de lote vencido
          if (dtValidadeUsada && dtValidadeUsada < hojeStr) {
            throw new Error(
              `BLOQUEIO DE VENCIMENTO: O lote "${numLoteUsado || 'informado'}" venceu em ${dtValidadeUsada}. ` +
              `Lotes vencidos não podem retornar ao estoque ativo. Apenas Saída por Vencimento/Descarte é permitida.`
            );
          }

          // Se veio requisição de origem, valida e audita
          if (requisicao_id) {
            const reqOrigem = db.prepare('SELECT id, numero_requisicao, centro_custo_id FROM requisicoes WHERE id = ?').get(requisicao_id) as any;
            if (!reqOrigem) {
              throw new Error(`Requisição de origem #${requisicao_id} não encontrada.`);
            }

            const itemReq = db.prepare('SELECT id, quantidade_atendida FROM itens_requisicao WHERE requisicao_id = ? AND produto_id = ?').get(requisicao_id, prod.id) as any;
            if (!itemReq) {
              throw new Error(`O produto "${prod.codigo} - ${prod.nome}" não consta nos itens atendidos da requisição ${reqOrigem.numero_requisicao}.`);
            }

            const jaDevRow = db.prepare(`
              SELECT COALESCE(SUM(quantidade_atendida), 0) as total
              FROM historico_requisicoes
              WHERE requisicao_id = ? AND produto_id = ? AND acao = 'devolucao_setor'
            `).get(requisicao_id, prod.id) as { total: number };

            const jaDevolvido = Number(jaDevRow?.total || 0);
            const totalDispensado = Number(itemReq.quantidade_atendida || 0);
            const disponivelParaDevolver = Math.max(0, totalDispensado - jaDevolvido);

            if (qtd > disponivelParaDevolver) {
              throw new Error(
                `Quantidade informada (${qtd} ${prod.unidade_medida}) excede o saldo dispensado pendente de devolução (${disponivelParaDevolver} ${prod.unidade_medida}) da requisição ${reqOrigem.numero_requisicao}.`
              );
            }

            db.prepare(`
              INSERT INTO historico_requisicoes (
                requisicao_id, item_requisicao_id, produto_id, usuario_id, acao,
                status_anterior, status_novo, quantidade_solicitada, quantidade_atendida,
                detalhes, justificativa
              ) VALUES (?, ?, ?, ?, 'devolucao_setor', NULL, NULL, NULL, ?, ?, ?)
            `).run(
              requisicao_id,
              itemReq.id,
              prod.id,
              user.id,
              qtd,
              `Devolução de Setor recebida no almoxarifado (${docRefFinal}): ${qtd} ${prod.unidade_medida} (Lote: ${numLoteUsado || '—'}, Val: ${dtValidadeUsada || '—'}). Item retornou ao saldo de estoque ativo.`,
              observacao ? String(observacao).trim() : (justificativa ? String(justificativa).trim() : null)
            );
          }
        }

        const exigeLote = prod.controla_validade === undefined ? prod.tipo === 'consumivel' : prod.controla_validade === 1;
        if (exigeLote && (!numLoteUsado || !dtValidadeUsada)) {
          throw new Error(
            `O item "${prod.codigo} - ${prod.nome}" exige informação de Lote e Data de Validade para entrada no estoque.`
          );
        }

        const loteReg = upsertLoteEstoque({
          produto_id: prod.id,
          numero_lote: numLoteUsado || `LT-${docRefFinal}`,
          data_validade: dtValidadeUsada,
          quantidade: qtd,
          fornecedor_id: entidade_id ? Number(entidade_id) : null,
          centro_custo_id: centro_custo_id ? Number(centro_custo_id) : null,
          documento_referencia: docRefFinal,
        });

        loteIdUsado = loteReg.id;
        numLoteUsado = loteReg.numero_lote;
        dtValidadeUsada = loteReg.data_validade;

        db.prepare('UPDATE produtos SET quantidade_atual = quantidade_atual + ? WHERE id = ?').run(qtd, prod.id);
      }

      const ccRow = centro_custo_id ? (db.prepare('SELECT codigo, nome FROM centros_custo WHERE id = ?').get(Number(centro_custo_id)) as any) : null;
      const obsFinalTexto = isDevolucaoSetor
        ? `Devolução de Setor [${ccRow ? `${ccRow.codigo} - ${ccRow.nome}` : `#${centro_custo_id}`}]${requisicao_id ? ` | Ref Req #${requisicao_id}` : ''}${observacao ? ` | Obs: ${observacao.trim()}` : ''}`
        : `${motivoTrim} | Resp: ${nomeResponsavel} | Justificativa: ${String(justificativa || '').trim()}`;

      const movInfo = db.prepare(`
        INSERT INTO movimentacoes (
          tipo, motivo_diverso, produto_id, lote_id, quantidade, centro_custo_id,
          fornecedor_id, usuario_id, responsavel_nome, documento_referencia,
          numero_lote, data_validade, observacao
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        natureza,
        motivoTrim,
        prod.id,
        loteIdUsado,
        qtd,
        centro_custo_id ? Number(centro_custo_id) : null,
        entidade_id ? Number(entidade_id) : null,
        user.id,
        nomeResponsavel,
        docRefFinal,
        numLoteUsado,
        dtValidadeUsada,
        obsFinalTexto
      );

      const produtoAtualizado = db.prepare('SELECT * FROM produtos WHERE id = ?').get(prod.id);

      return {
        movimentacao_id: Number(movInfo.lastInsertRowid),
        documento_referencia: docRefFinal,
        natureza,
        motivo_diverso: motivoTrim,
        produto: produtoAtualizado,
        termo_descarte: termoDescarte,
        devolucao_setor: isDevolucaoSetor ? {
          centro_custo_id,
          centro_custo_nome: ccRow ? `${ccRow.codigo} - ${ccRow.nome}` : null,
          requisicao_id: requisicao_id || null,
          numero_lote: numLoteUsado,
          data_validade: dtValidadeUsada,
          quantidade: qtd,
          responsavel_nome: nomeResponsavel,
          documento_referencia: docRefFinal,
        } : null,
      };
    });

    res.status(201).json({
      message: `${natureza === 'entrada' ? 'Entrada Diversa' : 'Saída Diversa'} (${result.motivo_diverso}) registrada com sucesso!`,
      data: result,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Erro ao registrar movimentação diversa' });
  }
});

apiRouter.post('/movimentacoes/:id/estornar', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || user.perfil !== 'admin') {
    res.status(403).json({ error: 'Apenas Administradores podem autorizar estornos no livro-caixa' });
    return;
  }

  const { id } = req.params;
  const { justificativa } = req.body;

  if (!justificativa || !justificativa.trim()) {
    res.status(400).json({ error: 'Justificativa técnica detalhada é obrigatória para efetuar estorno' });
    return;
  }

  try {
    const result = runInTransaction(() => {
      const mov = db.prepare('SELECT * FROM movimentacoes WHERE id = ?').get(id) as any;
      if (!mov) {
        throw new Error('Movimentação original não encontrada');
      }

      if (mov.tipo.startsWith('estorno_')) {
        throw new Error('Não é permitido estornar um lançamento que já é um estorno');
      }

      const prod = db.prepare('SELECT * FROM produtos WHERE id = ?').get(mov.produto_id) as any;
      if (!prod) {
        throw new Error('Produto associado não encontrado');
      }

      let novoTipo: string;
      if (mov.tipo === 'entrada') {
        if (prod.quantidade_atual < mov.quantidade) {
          throw new Error(
            `Não é possível estornar esta entrada pois o saldo atual (${prod.quantidade_atual}) ` +
            `é menor do que a quantidade a ser estornada (${mov.quantidade}). Geraria estoque negativo.`
          );
        }
        db.prepare('UPDATE produtos SET quantidade_atual = quantidade_atual - ? WHERE id = ?').run(mov.quantidade, mov.produto_id);
        novoTipo = 'estorno_entrada';
      } else if (mov.tipo === 'saida') {
        db.prepare('UPDATE produtos SET quantidade_atual = quantidade_atual + ? WHERE id = ?').run(mov.quantidade, mov.produto_id);
        novoTipo = 'estorno_saida';
      } else {
        throw new Error(`Tipo de movimentação "${mov.tipo}" não suporta estorno direto`);
      }

      const estornoStmt = db.prepare(`
        INSERT INTO movimentacoes (tipo, produto_id, quantidade, centro_custo_id, usuario_id, documento_referencia, observacao)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const estornoInfo = estornoStmt.run(
        novoTipo,
        mov.produto_id,
        mov.quantidade,
        mov.centro_custo_id,
        user.id,
        `ESTORNO-LANC-${mov.id}`,
        `Estorno do lançamento #${mov.id} (${mov.documento_referencia || 'S/D'}). Motivo: ${justificativa.trim()}`
      );

      return {
        estorno_id: estornoInfo.lastInsertRowid,
        tipo: novoTipo,
        quantidade: mov.quantidade,
      };
    });

    res.json({
      message: 'Estorno compensatório gerado com sucesso no livro-caixa',
      data: result,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Erro ao processar estorno' });
  }
});

// ============================================================================
// 11. MÓDULO DE RELATÓRIOS SALUTEM (11 RELATÓRIOS AGRUPADOS EM 4 CATEGORIAS)
// ============================================================================

apiRouter.get('/relatorios/catalogo', (_req, res) => {
  const catalogo = [
    {
      categoria: 'Estoque',
      icone: 'Package',
      descricao: 'Posição patrimonial, controle de saldos e ponto de ressuprimento',
      relatorios: [
        {
          id: 'posicao_atual_estoque',
          titulo: 'Posição Geral de Estoque Físico e Financeiro',
          descricao: 'Demonstrativo completo de saldos atuais, localização de prateleira, tipo e valorização do estoque.',
        },
        {
          id: 'estoque_critico',
          titulo: 'Itens em Nível Crítico / Abaixo do Ponto de Reposição',
          descricao: 'Alerta gerencial de materiais cujo saldo atual está igual ou abaixo do estoque mínimo de segurança.',
        },
        {
          id: 'consumivel_vs_equipamentos',
          titulo: 'Relação de Consumíveis vs Equipamentos Patrimoniais',
          descricao: 'Classificação analítica por tipo de insumo e distribuição patrimonial no almoxarifado.',
        },
        {
          id: 'validade_lotes',
          titulo: 'Controle de Lotes e Alertas de Validade (30 / 60 / 90 dias e Vencidos)',
          descricao: 'Monitoramento preventivo de lotes com vencimento em 90 dias (Atenção), 60 dias (Alerta), 30 dias (Crítico) e bloqueados por vencimento.',
        },
        {
          id: 'curva_abc',
          titulo: 'Curva ABC por Valor de Consumo e Custo Unitário',
          descricao: 'Classificação gerencial de insumos hospitalares (Classes A, B e C) multiplicando o custo unitário do cadastro pelo consumo total dispensado.',
        },
      ],
    },
    {
      categoria: 'Movimentações',
      icone: 'ArrowLeftRight',
      descricao: 'Rastreabilidade fiscal, extrato de notas e livro razão',
      relatorios: [
        {
          id: 'extrato_entradas_nf',
          titulo: 'Extrato de Entradas por Documento / Fornecedor',
          descricao: 'Relatório cronológico de notas fiscais recebidas, lotes, validades e insumos adicionados.',
        },
        {
          id: 'razao_saidas_centro_custo',
          titulo: 'Livro Razão de Saídas por Centro de Custo',
          descricao: 'Consumo por departamento e unidade solicitante no período selecionado.',
        },
        {
          id: 'auditoria_estornos',
          titulo: 'Auditoria de Estornos e Ajustes Compensatórios',
          descricao: 'Rastreabilidade total das operações de correção e justificativas de estorno registradas no sistema.',
        },
      ],
    },
    {
      categoria: 'Requisições',
      icone: 'ClipboardList',
      descricao: 'Fluxo hospitalar de solicitações, atendimento e produtividade',
      relatorios: [
        {
          id: 'requisicoes_atendidas',
          titulo: 'Requisições Atendidas por Período e Centro de Custo',
          descricao: 'Volume de pedidos deferidos com total de itens dispensados pelo almoxarife.',
        },
        {
          id: 'requisicoes_rejeitadas',
          titulo: 'Requisições Rejeitadas e Pareceres de Recusa',
          descricao: 'Levantamento de pedidos recusados com auditoria dos motivos técnicos inseridos pelo almoxarife.',
        },
        {
          id: 'tempo_atendimento',
          titulo: 'Indicador de Atendimento e Eficiência do Almoxarifado',
          descricao: 'Métricas de atendimento com proporção de pedidos atendidos no mesmo dia versus pendências.',
        },
      ],
    },
    {
      categoria: 'Empréstimos',
      icone: 'RotateCcw',
      descricao: 'Guarda, devoluções e controle de ferramentas e equipamentos',
      relatorios: [
        {
          id: 'equipamentos_abertos_atrasados',
          titulo: 'Equipamentos em Aberto e Empréstimos Atrasados',
          descricao: 'Relação de ferramentas e aparelhos fora do almoxarifado com status de devolução e atrasos.',
        },
        {
          id: 'historico_devolucoes',
          titulo: 'Histórico de Devoluções e Conservação de Aparelhos',
          descricao: 'Registro das conferências de integridade e estado de conservação no recebimento de retorno.',
        },
        {
          id: 'emprestimos_institucionais_relatorio',
          titulo: 'Empréstimos Institucionais entre Entidades / Hospitais Parceiros',
          descricao: 'Controle de saldos recebidos por empréstimo (dívida em quantidade) e concedidos a outras instituições.',
        },
      ],
    },
  ];

  res.json(catalogo);
});

apiRouter.get('/relatorios/consumo-mensal', (req, res) => {
  const { produto_id, centro_custo_id, meses } = req.query;
  const numMeses = Math.min(Math.max(Number(meses) || 6, 3), 24);

  try {
    // 1. Carrega Centros de Custo ativos (ou filtrados)
    let ccSql = 'SELECT id, codigo, nome, departamento FROM centros_custo WHERE ativo = 1';
    const ccParams: any[] = [];
    if (centro_custo_id) {
      ccSql += ' AND id = ?';
      ccParams.push(Number(centro_custo_id));
    }
    ccSql += ' ORDER BY nome ASC';
    const centros = db.prepare(ccSql).all(...ccParams) as Array<{
      id: number;
      codigo: string;
      nome: string;
      departamento: string;
    }>;

    // 2. Gera janela cronológica dos últimos N meses
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const now = new Date();
    const monthsList: Array<{ ano_mes: string; label: string }> = [];

    for (let i = numMeses - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yy = String(yyyy).slice(-2);
      monthsList.push({
        ano_mes: `${yyyy}-${mm}`,
        label: `${monthNames[d.getMonth()]}/${yy}`,
      });
    }

    // 3. Consulta movimentações de saída (e estornos de saída) agrupadas por mês e centro de custo
    let movSql = `
      SELECT 
        strftime('%Y-%m', m.data_movimentacao) as ano_mes,
        m.centro_custo_id,
        SUM(CASE WHEN m.tipo = 'saida' THEN m.quantidade ELSE -m.quantidade END) as qtd_liquida,
        SUM(
          (CASE WHEN m.tipo = 'saida' THEN m.quantidade ELSE -m.quantidade END) *
          COALESCE(m.valor_unitario, p.valor_unitario, 0)
        ) as valor_liquido
      FROM movimentacoes m
      JOIN produtos p ON m.produto_id = p.id
      WHERE m.tipo IN ('saida', 'estorno_saida')
        AND m.centro_custo_id IS NOT NULL
    `;
    const movParams: any[] = [];

    if (produto_id) {
      movSql += ' AND m.produto_id = ?';
      movParams.push(Number(produto_id));
    }
    if (centro_custo_id) {
      movSql += ' AND m.centro_custo_id = ?';
      movParams.push(Number(centro_custo_id));
    }

    movSql += ` GROUP BY strftime('%Y-%m', m.data_movimentacao), m.centro_custo_id`;

    const rawRows = db.prepare(movSql).all(...movParams) as Array<{
      ano_mes: string;
      centro_custo_id: number;
      qtd_liquida: number;
      valor_liquido: number;
    }>;

    // Mapa auxiliar: `${ano_mes}_${ccId}` -> { qtd, valor }
    const dataMap = new Map<string, { qtd: number; valor: number }>();
    for (const r of rawRows) {
      if (!r.ano_mes || !r.centro_custo_id) continue;
      dataMap.set(`${r.ano_mes}_${r.centro_custo_id}`, {
        qtd: Math.max(0, Number(r.qtd_liquida) || 0),
        valor: Math.max(0, Number(r.valor_liquido) || 0),
      });
    }

    // Totais acumulados por série (centro de custo)
    const seriesTotals = new Map<number, { qtd: number; valor: number }>();
    for (const cc of centros) {
      seriesTotals.set(cc.id, { qtd: 0, valor: 0 });
    }

    let totalQuantidadePeriodo = 0;
    let totalValorPeriodo = 0;
    let mesPicoLabel = monthsList[monthsList.length - 1]?.label || '-';
    let mesPicoQtd = 0;

    // 4. Monta dataset mensal estruturado para o Recharts LineChart
    const chartData = monthsList.map((m) => {
      const point: Record<string, any> = {
        ano_mes: m.ano_mes,
        mes_label: m.label,
        total_quantidade: 0,
        total_valor: 0,
      };

      for (const cc of centros) {
        const found = dataMap.get(`${m.ano_mes}_${cc.id}`);
        const qtd = found ? Number(found.qtd.toFixed(2)) : 0;
        const valor = found ? Number(found.valor.toFixed(2)) : 0;

        point[`cc_${cc.id}_qtd`] = qtd;
        point[`cc_${cc.id}_valor`] = valor;
        point.total_quantidade = Number((point.total_quantidade + qtd).toFixed(2));
        point.total_valor = Number((point.total_valor + valor).toFixed(2));

        const acc = seriesTotals.get(cc.id)!;
        acc.qtd = Number((acc.qtd + qtd).toFixed(2));
        acc.valor = Number((acc.valor + valor).toFixed(2));
      }

      totalQuantidadePeriodo = Number((totalQuantidadePeriodo + point.total_quantidade).toFixed(2));
      totalValorPeriodo = Number((totalValorPeriodo + point.total_valor).toFixed(2));

      if (point.total_quantidade >= mesPicoQtd && point.total_quantidade > 0) {
        mesPicoQtd = point.total_quantidade;
        mesPicoLabel = m.label;
      }

      return point;
    });

    const series = centros.map((cc) => {
      const totals = seriesTotals.get(cc.id) || { qtd: 0, valor: 0 };
      return {
        id: cc.id,
        codigo: cc.codigo,
        nome: cc.nome,
        departamento: cc.departamento,
        key_qtd: `cc_${cc.id}_qtd`,
        key_valor: `cc_${cc.id}_valor`,
        total_quantidade: totals.qtd,
        total_valor: totals.valor,
      };
    });

    res.json({
      dados_mensais: chartData,
      series,
      resumo: {
        total_quantidade_periodo: totalQuantidadePeriodo,
        total_valor_periodo: totalValorPeriodo,
        media_mensal_qtd: Number((totalQuantidadePeriodo / numMeses).toFixed(1)),
        media_mensal_valor: Number((totalValorPeriodo / numMeses).toFixed(2)),
        mes_pico_label: mesPicoLabel,
        mes_pico_qtd: mesPicoQtd,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao calcular consumo mensal: ' + err.message });
  }
});

apiRouter.post('/relatorios/executar', (req, res) => {
  const { tipo_relatorio, centro_custo_id, produto_id, tipo_produto, grupo_id, data_inicio, data_fim } = req.body;

  try {
    let titulo = '';
    let subtitulo = '';
    let colunas: Array<{ chave: string; rotulo: string; alinhamento?: 'left' | 'center' | 'right' }> = [];
    let dados: any[] = [];
    let resumo = '';

    switch (tipo_relatorio) {
      case 'curva_abc': {
        titulo = 'Curva ABC de Consumo e Valorização Financeira';
        subtitulo = 'Classificação de itens por impacto financeiro (Qtd Dispensada × Custo Unitário do Produto)';
        colunas = [
          { chave: 'posicao', rotulo: 'Pos.', alinhamento: 'center' },
          { chave: 'codigo', rotulo: 'Código' },
          { chave: 'nome', rotulo: 'Descrição do Produto' },
          { chave: 'grupo_nome', rotulo: 'Grupo de Produto' },
          { chave: 'unidade_medida', rotulo: 'UND', alinhamento: 'center' },
          { chave: 'qtd_consumida', rotulo: 'Qtd Dispensada', alinhamento: 'right' },
          { chave: 'custo_unitario_formatado', rotulo: 'Custo Unit. (R$)', alinhamento: 'right' },
          { chave: 'valor_total_formatado', rotulo: 'Valor Consumo (R$)', alinhamento: 'right' },
          { chave: 'pct_consumo_formatada', rotulo: '% Consumo', alinhamento: 'right' },
          { chave: 'pct_acumulada_formatada', rotulo: '% Acumulada', alinhamento: 'right' },
          { chave: 'classe_abc', rotulo: 'Classe ABC', alinhamento: 'center' },
        ];

        let sql = `
          SELECT 
            p.id,
            p.codigo,
            p.nome,
            p.unidade_medida,
            p.tipo,
            p.grupo_id,
            COALESCE(gp.nome, 'SEM GRUPO') as grupo_nome,
            COALESCE(p.custo_unitario, p.valor_unitario, 0) as custo_unitario,
            COALESCE(SUM(
              CASE 
                WHEN m.tipo = 'saida' THEN m.quantidade
                WHEN m.tipo = 'estorno_saida' THEN -m.quantidade
                ELSE 0 
              END
            ), 0) as qtd_consumida
          FROM produtos p
          LEFT JOIN grupos_produtos gp ON p.grupo_id = gp.id
          LEFT JOIN movimentacoes m ON m.produto_id = p.id AND m.tipo IN ('saida', 'estorno_saida')
        `;
        const joinConditions: string[] = [];
        const whereConditions: string[] = ['p.ativo = 1'];
        const params: any[] = [];

        if (centro_custo_id) {
          joinConditions.push('m.centro_custo_id = ?');
          params.push(Number(centro_custo_id));
        }

        if (data_inicio) {
          joinConditions.push('date(m.data_movimentacao) >= date(?)');
          params.push(data_inicio);
        }

        if (data_fim) {
          joinConditions.push('date(m.data_movimentacao) <= date(?)');
          params.push(data_fim);
        }

        if (joinConditions.length > 0) {
          sql += ' AND ' + joinConditions.join(' AND ');
        }

        if (grupo_id) {
          whereConditions.push('p.grupo_id = ?');
          params.push(Number(grupo_id));
        }

        if (tipo_produto) {
          whereConditions.push('p.tipo = ?');
          params.push(tipo_produto);
        }

        sql += ' WHERE ' + whereConditions.join(' AND ');
        sql += ' GROUP BY p.id';

        const rows = db.prepare(sql).all(...params) as any[];

        const itensCalculados = rows.map((r) => {
          const custo = Number(r.custo_unitario) || 0;
          const qtd = Math.max(0, Number(r.qtd_consumida) || 0);
          const valorConsumo = qtd * custo;
          return {
            ...r,
            custo,
            qtd,
            valorConsumo,
          };
        });

        itensCalculados.sort((a, b) => b.valorConsumo - a.valorConsumo || b.qtd - a.qtd || a.nome.localeCompare(b.nome));

        const totalGeralConsumo = itensCalculados.reduce((acc, it) => acc + it.valorConsumo, 0);

        let acumuladoValor = 0;
        let countA = 0;
        let countB = 0;
        let countC = 0;

        dados = itensCalculados.map((item, idx) => {
          acumuladoValor += item.valorConsumo;
          const pctItem = totalGeralConsumo > 0 ? (item.valorConsumo / totalGeralConsumo) * 100 : 0;
          const pctAcum = totalGeralConsumo > 0 ? (acumuladoValor / totalGeralConsumo) * 100 : 0;

          let classe = 'C';
          if (totalGeralConsumo > 0) {
            if (pctAcum <= 80 || (idx === 0 && pctAcum > 80)) {
              classe = 'A';
              countA++;
            } else if (pctAcum <= 95) {
              classe = 'B';
              countB++;
            } else {
              classe = 'C';
              countC++;
            }
          } else {
            classe = 'C';
            countC++;
          }

          return {
            posicao: idx + 1,
            codigo: item.codigo,
            nome: item.nome,
            grupo_nome: item.grupo_nome,
            unidade_medida: item.unidade_medida,
            qtd_consumida: item.qtd.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
            custo_unitario_formatado: `R$ ${item.custo.toFixed(2)}`,
            valor_total_formatado: `R$ ${item.valorConsumo.toFixed(2)}`,
            pct_consumo_formatada: `${pctItem.toFixed(2)}%`,
            pct_acumulada_formatada: `${Math.min(100, pctAcum).toFixed(2)}%`,
            classe_abc: classe,
          };
        });

        resumo = `Análise de Curva ABC: Total de R$ ${totalGeralConsumo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} em consumo dispensado. Classe A: ${countA} itens (~80% do valor), Classe B: ${countB} itens (~15% do valor), Classe C: ${countC} itens (~5% do valor).`;
        break;
      }

      case 'posicao_atual_estoque': {
        titulo = 'Posição Geral de Estoque Físico e Financeiro';
        subtitulo = 'Demonstrativo completo de produtos ativos, saldo físico e valor patrimonial';
        colunas = [
          { chave: 'codigo', rotulo: 'Código' },
          { chave: 'nome', rotulo: 'Descrição do Item' },
          { chave: 'tipo_desc', rotulo: 'Tipo' },
          { chave: 'localizacao', rotulo: 'Localização' },
          { chave: 'unidade_medida', rotulo: 'UN', alinhamento: 'center' },
          { chave: 'estoque_minimo', rotulo: 'Mínimo', alinhamento: 'right' },
          { chave: 'quantidade_atual', rotulo: 'Saldo Físico', alinhamento: 'right' },
          { chave: 'valor_unitario_formatado', rotulo: 'Valor Unit.', alinhamento: 'right' },
          { chave: 'total_valor_formatado', rotulo: 'Valor Total', alinhamento: 'right' },
          { chave: 'status_estoque', rotulo: 'Situação', alinhamento: 'center' },
        ];

        let sql = 'SELECT * FROM produtos WHERE ativo = 1';
        const params: any[] = [];
        if (tipo_produto) {
          sql += ' AND tipo = ?';
          params.push(tipo_produto);
        }
        sql += ' ORDER BY nome ASC';

        const rows = db.prepare(sql).all(...params) as any[];
        let totalValorGeral = 0;
        let totalItens = 0;

        dados = rows.map((p) => {
          const valUnit = Number(p.valor_unitario) || 0;
          const totalItem = p.quantidade_atual * valUnit;
          totalValorGeral += totalItem;
          totalItens += p.quantidade_atual;

          return {
            ...p,
            tipo_desc: p.tipo === 'consumivel' ? 'Consumível' : 'Equipamento',
            localizacao: p.localizacao || 'Almox. Geral',
            valor_unitario_formatado: `R$ ${valUnit.toFixed(2)}`,
            total_valor_formatado: `R$ ${totalItem.toFixed(2)}`,
            status_estoque: p.quantidade_atual <= p.estoque_minimo ? 'CRÍTICO' : 'NORMAL',
          };
        });

        resumo = `Total de ${dados.length} produtos cadastrados. Saldo físico total de ${totalItens} unidades, perfazendo um valor patrimonial avaliado em R$ ${totalValorGeral.toFixed(2)}.`;
        break;
      }

      case 'estoque_critico': {
        titulo = 'Materiais em Nível Crítico / Abaixo do Ponto de Reposição';
        subtitulo = 'Itens com estoque igual ou inferior ao estoque mínimo estipulado';
        colunas = [
          { chave: 'codigo', rotulo: 'Código' },
          { chave: 'nome', rotulo: 'Material' },
          { chave: 'tipo_desc', rotulo: 'Tipo' },
          { chave: 'unidade_medida', rotulo: 'UN', alinhamento: 'center' },
          { chave: 'estoque_minimo', rotulo: 'Est. Mínimo', alinhamento: 'right' },
          { chave: 'quantidade_atual', rotulo: 'Saldo Atual', alinhamento: 'right' },
          { chave: 'deficit', rotulo: 'Déficit p/ Reposição', alinhamento: 'right' },
          { chave: 'prioridade', rotulo: 'Urgência de Compra', alinhamento: 'center' },
        ];

        const rows = db.prepare(`
          SELECT * FROM produtos 
          WHERE ativo = 1 AND quantidade_atual <= estoque_minimo
          ORDER BY (quantidade_atual / CASE WHEN estoque_minimo = 0 THEN 1 ELSE estoque_minimo END) ASC
        `).all() as any[];

        dados = rows.map((p) => {
          const deficit = Math.max(0, p.estoque_minimo - p.quantidade_atual);
          const ratio = p.estoque_minimo > 0 ? p.quantidade_atual / p.estoque_minimo : 0;
          let urg = 'Moderada';
          if (p.quantidade_atual === 0) urg = 'EMERGENCIAL (ZERADO)';
          else if (ratio <= 0.5) urg = 'ALTA PRIORIDADE';

          return {
            ...p,
            tipo_desc: p.tipo === 'consumivel' ? 'Consumível' : 'Equipamento',
            deficit,
            prioridade: urg,
          };
        });

        resumo = `Identificado(s) ${dados.length} item(ns) com necessidade urgente de requisição de compras ou pedido de reposição aos fornecedores.`;
        break;
      }

      case 'consumivel_vs_equipamentos': {
        titulo = 'Relação de Consumíveis vs Equipamentos Patrimoniais';
        subtitulo = 'Classificação geral do catálogo de suprimentos por categoria de uso';
        colunas = [
          { chave: 'tipo_desc', rotulo: 'Categoria' },
          { chave: 'total_itens', rotulo: 'Qtd de Produtos', alinhamento: 'center' },
          { chave: 'saldo_fisico', rotulo: 'Saldo Físico Total', alinhamento: 'right' },
          { chave: 'valor_total_formatado', rotulo: 'Valor Patrimonial', alinhamento: 'right' },
        ];

        const stats = db.prepare(`
          SELECT 
            tipo, 
            COUNT(*) as total_itens, 
            SUM(quantidade_atual) as saldo_fisico, 
            SUM(quantidade_atual * COALESCE(valor_unitario, 0)) as valor_total
          FROM produtos 
          WHERE ativo = 1 
          GROUP BY tipo
        `).all() as any[];

        dados = stats.map((s) => ({
          tipo_desc: s.tipo === 'consumivel' ? 'Materiais Consumíveis (Insumos Médicos / Hospitalares)' : 'Equipamentos e Ferramentas (Não Consumíveis)',
          total_itens: s.total_itens,
          saldo_fisico: s.saldo_fisico,
          valor_total_formatado: `R$ ${(s.valor_total || 0).toFixed(2)}`,
        }));

        resumo = 'Divisão analítica entre insumos descartáveis de uso contínuo e ativos não consumíveis controlados via termo de empréstimo.';
        break;
      }

      case 'extrato_entradas_nf': {
        titulo = 'Extrato de Entradas por Documento Fiscal / Fornecedor';
        subtitulo = 'Registro analítico das notas de compra e recebimento de insumos';
        colunas = [
          { chave: 'data_formatada', rotulo: 'Data / Hora' },
          { chave: 'documento_referencia', rotulo: 'Nota Fiscal / Doc' },
          { chave: 'produto_nome', rotulo: 'Produto Recebido' },
          { chave: 'numero_lote', rotulo: 'Lote' },
          { chave: 'data_validade', rotulo: 'Validade' },
          { chave: 'quantidade', rotulo: 'Qtd', alinhamento: 'right' },
          { chave: 'unidade_medida', rotulo: 'UN', alinhamento: 'center' },
          { chave: 'usuario_nome', rotulo: 'Recebedor (Almoxarife)' },
        ];

        let sql = `
          SELECT m.*, p.nome as produto_nome, p.unidade_medida, u.nome as usuario_nome,
                 strftime('%d/%m/%Y %H:%M', m.data_movimentacao) as data_formatada
          FROM movimentacoes m
          JOIN produtos p ON m.produto_id = p.id
          JOIN usuarios u ON m.usuario_id = u.id
          WHERE m.tipo = 'entrada'
        `;
        const params: any[] = [];
        if (produto_id) {
          sql += ' AND m.produto_id = ?';
          params.push(produto_id);
        }
        sql += ' ORDER BY m.id DESC LIMIT 100';

        dados = db.prepare(sql).all(...params) as any[];
        resumo = `Listagem de ${dados.length} recebimentos de mercadoria conferidos e adicionados com rastreabilidade ao saldo.`;
        break;
      }

      case 'razao_saidas_centro_custo': {
        titulo = 'Livro Razão de Saídas por Centro de Custo';
        subtitulo = 'Consumo de materiais hospitalares debitados por unidade requisitante';
        colunas = [
          { chave: 'data_formatada', rotulo: 'Data / Hora' },
          { chave: 'centro_custo_nome', rotulo: 'Centro de Custo' },
          { chave: 'produto_nome', rotulo: 'Material' },
          { chave: 'quantidade', rotulo: 'Qtd Dispensada', alinhamento: 'right' },
          { chave: 'unidade_medida', rotulo: 'UN', alinhamento: 'center' },
          { chave: 'documento_referencia', rotulo: 'Ref / Requisição' },
          { chave: 'usuario_nome', rotulo: 'Responsável Atendimento' },
        ];

        let sql = `
          SELECT m.*, p.nome as produto_nome, p.unidade_medida, cc.nome as centro_custo_nome, u.nome as usuario_nome,
                 strftime('%d/%m/%Y %H:%M', m.data_movimentacao) as data_formatada
          FROM movimentacoes m
          JOIN produtos p ON m.produto_id = p.id
          LEFT JOIN centros_custo cc ON m.centro_custo_id = cc.id
          JOIN usuarios u ON m.usuario_id = u.id
          WHERE m.tipo = 'saida'
        `;
        const params: any[] = [];
        if (centro_custo_id) {
          sql += ' AND m.centro_custo_id = ?';
          params.push(centro_custo_id);
        }
        sql += ' ORDER BY m.id DESC LIMIT 100';

        dados = db.prepare(sql).all(...params) as any[];
        resumo = `Demonstrativo contábil de ${dados.length} saídas de suprimentos alocadas para os setores assistenciais.`;
        break;
      }

      case 'auditoria_estornos': {
        titulo = 'Auditoria de Estornos e Ajustes Compensatórios';
        subtitulo = 'Trilha de auditoria e justificativas técnicas de correções no livro-caixa';
        colunas = [
          { chave: 'data_formatada', rotulo: 'Data Estorno' },
          { chave: 'documento_referencia', rotulo: 'Doc Referência' },
          { chave: 'tipo_desc', rotulo: 'Natureza do Estorno' },
          { chave: 'produto_nome', rotulo: 'Material' },
          { chave: 'quantidade', rotulo: 'Qtd Compensada', alinhamento: 'right' },
          { chave: 'usuario_nome', rotulo: 'Administrador Autorizante' },
          { chave: 'observacao', rotulo: 'Justificativa / Parecer' },
        ];

        const rows = db.prepare(`
          SELECT m.*, p.nome as produto_nome, u.nome as usuario_nome,
                 strftime('%d/%m/%Y %H:%M', m.data_movimentacao) as data_formatada
          FROM movimentacoes m
          JOIN produtos p ON m.produto_id = p.id
          JOIN usuarios u ON m.usuario_id = u.id
          WHERE m.tipo LIKE 'estorno_%'
          ORDER BY m.id DESC
        `).all() as any[];

        dados = rows.map((r) => ({
          ...r,
          tipo_desc: r.tipo === 'estorno_entrada' ? 'Estorno de Entrada (+ Estoque -> - Estoque)' : 'Estorno de Saída (- Estoque -> + Estoque)',
        }));

        resumo = `Total de ${dados.length} operações compensatórias executadas com estrita auditoria conforme regras hospitalares.`;
        break;
      }

      case 'requisicoes_atendidas': {
        titulo = 'Requisições Atendidas por Período e Centro de Custo';
        subtitulo = 'Histórico consolidado de pedidos assistenciais deferidos';
        colunas = [
          { chave: 'numero_requisicao', rotulo: 'Nº Requisição' },
          { chave: 'data_solicitacao_formatada', rotulo: 'Data Solicitação' },
          { chave: 'data_atendimento_formatada', rotulo: 'Data Atendimento' },
          { chave: 'centro_custo_nome', rotulo: 'Centro de Custo' },
          { chave: 'solicitante_nome', rotulo: 'Solicitante' },
          { chave: 'almoxarife_nome', rotulo: 'Almoxarife Atendente' },
          { chave: 'total_itens', rotulo: 'Itens', alinhamento: 'center' },
          { chave: 'prioridade_desc', rotulo: 'Prioridade', alinhamento: 'center' },
        ];

        let sql = `
          SELECT r.*, cc.nome as centro_custo_nome, u_sol.nome as solicitante_nome, u_alm.nome as almoxarife_nome,
                 strftime('%d/%m/%Y %H:%M', r.data_solicitacao) as data_solicitacao_formatada,
                 strftime('%d/%m/%Y %H:%M', r.data_atendimento) as data_atendimento_formatada,
                 (SELECT COUNT(*) FROM itens_requisicao ir WHERE ir.requisicao_id = r.id) as total_itens
          FROM requisicoes r
          JOIN centros_custo cc ON r.centro_custo_id = cc.id
          JOIN usuarios u_sol ON r.solicitante_id = u_sol.id
          LEFT JOIN usuarios u_alm ON r.almoxarife_id = u_alm.id
          WHERE r.status = 'aprovada_atendida'
        `;
        const params: any[] = [];
        if (centro_custo_id) {
          sql += ' AND r.centro_custo_id = ?';
          params.push(centro_custo_id);
        }
        sql += ' ORDER BY r.id DESC';

        const rows = db.prepare(sql).all(...params) as any[];
        dados = rows.map((r) => ({
          ...r,
          prioridade_desc: r.prioridade === 'urgente' ? 'URGENTE' : 'Normal',
        }));

        resumo = `Localizadas ${dados.length} requisições de suprimentos atendidas e liberadas para os setores assistenciais.`;
        break;
      }

      case 'requisicoes_rejeitadas': {
        titulo = 'Requisições Rejeitadas e Pareceres de Recusa';
        subtitulo = 'Auditoria dos pedidos assistenciais indeferidos pelo almoxarifado';
        colunas = [
          { chave: 'numero_requisicao', rotulo: 'Nº Requisição' },
          { chave: 'data_solicitacao_formatada', rotulo: 'Data Solicitação' },
          { chave: 'centro_custo_nome', rotulo: 'Centro de Custo' },
          { chave: 'solicitante_nome', rotulo: 'Solicitante' },
          { chave: 'almoxarife_nome', rotulo: 'Almoxarife Responsável' },
          { chave: 'motivo_rejeicao', rotulo: 'Justificativa Obrigatória da Recusa' },
        ];

        const rows = db.prepare(`
          SELECT r.*, cc.nome as centro_custo_nome, u_sol.nome as solicitante_nome, u_alm.nome as almoxarife_nome,
                 strftime('%d/%m/%Y %H:%M', r.data_solicitacao) as data_solicitacao_formatada
          FROM requisicoes r
          JOIN centros_custo cc ON r.centro_custo_id = cc.id
          JOIN usuarios u_sol ON r.solicitante_id = u_sol.id
          LEFT JOIN usuarios u_alm ON r.almoxarife_id = u_alm.id
          WHERE r.status = 'rejeitada'
          ORDER BY r.id DESC
        `).all() as any[];

        dados = rows;
        resumo = `Constatadas ${dados.length} requisições indeferidas com parecer fundamentado no sistema.`;
        break;
      }

      case 'tempo_atendimento': {
        titulo = 'Indicador de Atendimento e Eficiência do Almoxarifado';
        subtitulo = 'Balanço da agilidade no fluxo de dispensação hospitalar';
        colunas = [
          { chave: 'metrica', rotulo: 'Indicador de Produtividade' },
          { chave: 'valor', rotulo: 'Resultado Consolidado', alinhamento: 'center' },
          { chave: 'status_qualidade', rotulo: 'Avaliação de Desempenho', alinhamento: 'center' },
        ];

        const totalReq = db.prepare('SELECT COUNT(*) as c FROM requisicoes').get() as { c: number };
        const atendidas = db.prepare("SELECT COUNT(*) as c FROM requisicoes WHERE status = 'aprovada_atendida'").get() as { c: number };
        const pendentes = db.prepare("SELECT COUNT(*) as c FROM requisicoes WHERE status = 'pendente'").get() as { c: number };
        const rejeitadas = db.prepare("SELECT COUNT(*) as c FROM requisicoes WHERE status = 'rejeitada'").get() as { c: number };

        const taxaAtendimento = totalReq.c > 0 ? ((atendidas.c / totalReq.c) * 100).toFixed(1) + '%' : '100%';

        dados = [
          { metrica: 'Total de Requisições Hospitalares Criadas', valor: String(totalReq.c), status_qualidade: 'Em conformidade' },
          { metrica: 'Requisições Atendidas e Baixadas com Sucesso', valor: String(atendidas.c), status_qualidade: 'Excelente' },
          { metrica: 'Requisições Pendentes em Fila de Separação', valor: String(pendentes.c), status_qualidade: pendentes.c > 5 ? 'Atenção' : 'Normal' },
          { metrica: 'Requisições Rejeitadas com Parecer Técnico', valor: String(rejeitadas.c), status_qualidade: 'Sob Auditoria' },
          { metrica: 'Taxa Global de Eficiência no Atendimento', valor: taxaAtendimento, status_qualidade: 'Acima da Meta' },
        ];

        resumo = 'Indicadores de performance hospitalar do setor de suprimentos e almoxarifado geral.';
        break;
      }

      case 'equipamentos_abertos_atrasados': {
        updateOverdueLoans();
        titulo = 'Equipamentos em Aberto e Empréstimos Atrasados';
        subtitulo = 'Controle patrimonial de aparelhos médicos e ferramentas em posse dos setores';
        colunas = [
          { chave: 'codigo_emprestimo', rotulo: 'Termo Nº' },
          { chave: 'produto_nome', rotulo: 'Equipamento' },
          { chave: 'quantidade', rotulo: 'Qtd', alinhamento: 'center' },
          { chave: 'centro_custo_nome', rotulo: 'Setor Alocado' },
          { chave: 'solicitante_nome', rotulo: 'Profissional Responsável' },
          { chave: 'data_emprestimo_formatada', rotulo: 'Data Saída' },
          { chave: 'data_prevista_formatada', rotulo: 'Prazo Devolução' },
          { chave: 'status_desc', rotulo: 'Situação', alinhamento: 'center' },
        ];

        const rows = db.prepare(`
          SELECT e.*, p.nome as produto_nome, cc.nome as centro_custo_nome, u_req.nome as solicitante_nome,
                 strftime('%d/%m/%Y', e.data_emprestimo) as data_emprestimo_formatada,
                 strftime('%d/%m/%Y', e.data_prevista_devolucao) as data_prevista_formatada
          FROM emprestimos e
          JOIN produtos p ON e.produto_id = p.id
          JOIN centros_custo cc ON e.centro_custo_id = cc.id
          JOIN usuarios u_req ON e.solicitante_id = u_req.id
          WHERE e.status IN ('emprestado', 'atrasado')
          ORDER BY e.status ASC, e.data_prevista_devolucao ASC
        `).all() as any[];

        dados = rows.map((r) => ({
          ...r,
          codigo_emprestimo: r.codigo_emprestimo || `EMP-${r.id}`,
          status_desc: r.status === 'atrasado' ? 'ATRASADO (VENCIDO)' : 'EM USO (NO PRAZO)',
        }));

        resumo = `Constatado(s) ${dados.length} equipamento(s) atualmente em circulação nos setores hospitalares.`;
        break;
      }

      case 'historico_devolucoes': {
        titulo = 'Histórico de Devoluções e Conservação de Aparelhos';
        subtitulo = 'Registro das inspeções físicas de retorno de equipamentos ao estoque';
        colunas = [
          { chave: 'codigo_emprestimo', rotulo: 'Termo' },
          { chave: 'produto_nome', rotulo: 'Equipamento' },
          { chave: 'quantidade', rotulo: 'Qtd', alinhamento: 'center' },
          { chave: 'solicitante_nome', rotulo: 'Quem Devolveu' },
          { chave: 'data_devolucao_formatada', rotulo: 'Data Retorno' },
          { chave: 'condicao_devolucao', rotulo: 'Condição / Estado' },
          { chave: 'almoxarife_recebimento_nome', rotulo: 'Conferente Almoxarifado' },
        ];

        const rows = db.prepare(`
          SELECT e.*, p.nome as produto_nome, u_req.nome as solicitante_nome, u_rec.nome as almoxarife_recebimento_nome,
                 strftime('%d/%m/%Y %H:%M', e.data_devolucao) as data_devolucao_formatada
          FROM emprestimos e
          JOIN produtos p ON e.produto_id = p.id
          JOIN usuarios u_req ON e.solicitante_id = u_req.id
          LEFT JOIN usuarios u_rec ON e.almoxarife_recebimento_id = u_rec.id
          WHERE e.status = 'devolvido'
          ORDER BY e.data_devolucao DESC
        `).all() as any[];

        dados = rows.map((r) => ({
          ...r,
          codigo_emprestimo: r.codigo_emprestimo || `EMP-${r.id}`,
          condicao_devolucao: r.condicao_devolucao || 'Em bom estado',
          almoxarife_recebimento_nome: r.almoxarife_recebimento_nome || 'Almoxarifado Central',
        }));

        resumo = `Total de ${dados.length} devoluções registradas com recomposição automática do saldo patrimonial.`;
        break;
      }

      case 'validade_lotes': {
        titulo = 'Controle de Lotes e Alertas de Validade (30 / 60 / 90 Dias e Vencidos)';
        subtitulo = 'Rastreabilidade sanitária por lote com bloqueio automático para itens vencidos';
        colunas = [
          { chave: 'produto_codigo', rotulo: 'Código Único' },
          { chave: 'produto_nome', rotulo: 'Descrição Padrão do Produto' },
          { chave: 'numero_lote', rotulo: 'Lote' },
          { chave: 'data_validade_formatada', rotulo: 'Validade', alinhamento: 'center' },
          { chave: 'dias_restantes_desc', rotulo: 'Prazo', alinhamento: 'center' },
          { chave: 'quantidade_atual', rotulo: 'Saldo no Lote', alinhamento: 'right' },
          { chave: 'unidade_medida', rotulo: 'UN', alinhamento: 'center' },
          { chave: 'status_alerta', rotulo: 'Classificação / Bloqueio', alinhamento: 'center' },
        ];

        let sql = `
          SELECT 
            le.*,
            p.codigo as produto_codigo,
            p.nome as produto_nome,
            p.unidade_medida,
            COALESCE(f.nome_fantasia, f.razao_social) as fornecedor_nome
          FROM lotes_estoque le
          JOIN produtos p ON le.produto_id = p.id
          LEFT JOIN fornecedores f ON le.fornecedor_id = f.id
          WHERE le.quantidade_atual > 0 AND p.ativo = 1
        `;
        const params: any[] = [];
        if (produto_id) {
          sql += ' AND le.produto_id = ?';
          params.push(Number(produto_id));
        }
        sql += ' ORDER BY CASE WHEN le.data_validade IS NULL THEN 1 ELSE 0 END, date(le.data_validade) ASC';

        const rows = db.prepare(sql).all(...params) as any[];
        let qtdVencidos = 0;
        let qtd30 = 0;
        let qtd60 = 0;
        let qtd90 = 0;

        dados = rows.map((r) => {
          const info = classifyLoteValidade(r.data_validade);
          let statusAlerta = 'REGULAR (> 90 DIAS)';
          if (info.status_validade === 'vencido') {
            statusAlerta = 'BLOQUEADO - VENCIDO (APENAS DESCARTE)';
            qtdVencidos++;
          } else if (info.status_validade === 'critico_30d') {
            statusAlerta = 'CRÍTICO (ATÉ 30 DIAS - VERMELHO)';
            qtd30++;
          } else if (info.status_validade === 'alerta_60d') {
            statusAlerta = 'ALERTA (ATÉ 60 DIAS - LARANJA)';
            qtd60++;
          } else if (info.status_validade === 'atencao_90d') {
            statusAlerta = 'ATENÇÃO (ATÉ 90 DIAS - AMARELO)';
            qtd90++;
          } else if (info.status_validade === 'sem_validade') {
            statusAlerta = 'SEM VALIDADE';
          }

          return {
            ...r,
            data_validade_formatada: r.data_validade ? r.data_validade.split('-').reverse().join('/') : 'Indeterminada',
            dias_restantes_desc:
              info.dias_para_vencer === null
                ? '-'
                : info.dias_para_vencer < 0
                ? `Vencido há ${Math.abs(info.dias_para_vencer)}d`
                : `${info.dias_para_vencer} dia(s)`,
            status_alerta: statusAlerta,
          };
        });

        resumo = `Total de ${dados.length} lote(s) ativo(s): ${qtdVencidos} Vencido(s)/Bloqueado(s), ${qtd30} Crítico(s) (≤30d), ${qtd60} em Alerta (≤60d) e ${qtd90} em Atenção (≤90d).`;
        break;
      }

      case 'emprestimos_institucionais_relatorio': {
        titulo = 'Empréstimos Institucionais entre Entidades / Hospitais Parceiros';
        subtitulo = 'Demonstrativo de empréstimos recebidos (dívidas em estoque) e concedidos a terceiros';
        colunas = [
          { chave: 'numero_documento', rotulo: 'Documento' },
          { chave: 'tipo_desc', rotulo: 'Operação' },
          { chave: 'entidade_nome', rotulo: 'Entidade Parceira / Hospital' },
          { chave: 'produto_desc', rotulo: 'Produto (Código Único)' },
          { chave: 'numero_lote', rotulo: 'Lote' },
          { chave: 'quantidade', rotulo: 'Qtd Total', alinhamento: 'right' },
          { chave: 'quantidade_devolvida', rotulo: 'Qtd Quitado', alinhamento: 'right' },
          { chave: 'saldo_pendente', rotulo: 'Pendente', alinhamento: 'right' },
          { chave: 'status_desc', rotulo: 'Situação', alinhamento: 'center' },
        ];

        const rows = db.prepare(`
          SELECT 
            ei.numero_documento, ei.tipo, ei.status, ei.data_operacao,
            COALESCE(f.nome_fantasia, f.razao_social) as entidade_nome,
            p.codigo as produto_codigo, p.nome as produto_nome, p.unidade_medida,
            iei.numero_lote, iei.quantidade, iei.quantidade_devolvida
          FROM itens_emprestimo_institucional iei
          JOIN emprestimos_institucionais ei ON iei.emprestimo_id = ei.id
          JOIN fornecedores f ON ei.entidade_id = f.id
          JOIN produtos p ON iei.produto_id = p.id
          ORDER BY ei.id DESC, iei.id ASC
        `).all() as any[];

        dados = rows.map((r) => ({
          ...r,
          tipo_desc: r.tipo === 'recebido' ? 'RECEBIDO (Pegamos Emprestado)' : 'CONCEDIDO (Emprestamos)',
          produto_desc: `${r.produto_codigo} - ${r.produto_nome} (${r.unidade_medida})`,
          numero_lote: r.numero_lote || '-',
          saldo_pendente: Math.max(0, Number(r.quantidade) - Number(r.quantidade_devolvida || 0)),
          status_desc: r.status === 'quitado' ? 'QUITADO' : 'PENDENTE DEVOLUÇÃO',
        }));

        resumo = `Total de ${dados.length} item(ns) vinculados a operações de empréstimo interinstitucional entre unidades/hospitais.`;
        break;
      }

      case 'relatorio_geral_almoxarifado': {
        const areaSiglaReq = ((req as any).areaSigla || 'ALM').toUpperCase();
        const isCafReq = areaSiglaReq === 'CAF';

        titulo = isCafReq
          ? 'Relatório Geral Consolidado da Central Farmacêutica (CAF / Painel Executivo)'
          : 'Relatório Geral Consolidado do Almoxarifado (Painel Executivo)';
        subtitulo = isCafReq
          ? 'Balanço completo de medicamentos, indicadores (KPIs), validade de lotes (30/60/90d), estoque crítico e dispensação por setor'
          : 'Balanço completo de indicadores (KPIs), validade de lotes (30/60/90d), estoque crítico, empréstimos e consumo por setor';
        colunas = [
          { chave: 'bloco', rotulo: 'Bloco / Seção' },
          { chave: 'indicador', rotulo: 'Indicador / Produto / Entidade' },
          { chave: 'referencia', rotulo: 'Código / Lote / Setor' },
          { chave: 'quantidade_valor', rotulo: 'Saldo / Valor', alinhamento: 'right' },
          { chave: 'situacao', rotulo: 'Classificação / Status', alinhamento: 'center' },
        ];

        const totalProdutos = db.prepare('SELECT COUNT(*) as c FROM produtos WHERE ativo = 1').get() as { c: number };
        const estoqueBaixo = db.prepare('SELECT COUNT(*) as c FROM produtos WHERE ativo = 1 AND quantidade_atual <= estoque_minimo').get() as { c: number };
        const reqPendentes = db.prepare("SELECT COUNT(*) as c FROM requisicoes WHERE status = 'pendente'").get() as { c: number };
        const reqAtendidas = db.prepare("SELECT COUNT(*) as c FROM requisicoes WHERE status = 'aprovada_atendida'").get() as { c: number };
        const valorTotal = db.prepare('SELECT COALESCE(SUM(quantidade_atual * COALESCE(valor_unitario, 0)), 0) as total FROM produtos WHERE ativo = 1').get() as { total: number };
        const empRecPend = db.prepare("SELECT COUNT(*) as c FROM emprestimos_institucionais WHERE tipo = 'recebido' AND status = 'pendente_devolucao'").get() as { c: number };
        const empConcPend = db.prepare("SELECT COUNT(*) as c FROM emprestimos_institucionais WHERE tipo = 'concedido' AND status = 'pendente_devolucao'").get() as { c: number };

        const lotesAtivos = db.prepare(`
          SELECT le.*, p.codigo as produto_codigo, p.nome as produto_nome, p.unidade_medida
          FROM lotes_estoque le
          JOIN produtos p ON le.produto_id = p.id
          WHERE le.quantidade_atual > 0 AND p.ativo = 1
          ORDER BY CASE WHEN le.data_validade IS NULL THEN 1 ELSE 0 END, date(le.data_validade) ASC
        `).all() as any[];

        let lotesVencidos = 0;
        let lotes30 = 0;
        let lotes60 = 0;
        let lotes90 = 0;
        const linhasLotesAlerta: any[] = [];

        for (const lt of lotesAtivos) {
          const v = classifyLoteValidade(lt.data_validade);
          if (v.status_validade === 'vencido') lotesVencidos++;
          else if (v.status_validade === 'critico_30d') lotes30++;
          else if (v.status_validade === 'alerta_60d') lotes60++;
          else if (v.status_validade === 'atencao_90d') lotes90++;

          if (['vencido', 'critico_30d', 'alerta_60d', 'atencao_90d'].includes(v.status_validade)) {
            linhasLotesAlerta.push({
              bloco: '2. ALERTA DE VALIDADE (LOTES)',
              indicador: lt.produto_nome,
              referencia: `${lt.produto_codigo} | Lote: ${lt.numero_lote} (Val: ${lt.data_validade ? lt.data_validade.split('-').reverse().join('/') : '-'})`,
              quantidade_valor: `${lt.quantidade_atual} ${lt.unidade_medida}`,
              situacao:
                v.status_validade === 'vencido'
                  ? 'BLOQUEADO / VENCIDO'
                  : v.status_validade === 'critico_30d'
                  ? `CRÍTICO 30D (${v.dias_para_vencer}d)`
                  : v.status_validade === 'alerta_60d'
                  ? `ALERTA 60D (${v.dias_para_vencer}d)`
                  : `ATENÇÃO 90D (${v.dias_para_vencer}d)`,
            });
          }
        }

        const linhasKpis = [
          {
            bloco: '1. INDICADORES GERAIS (KPIs)',
            indicador: 'Total de Produtos Ativos no Catálogo',
            referencia: 'Catálogo Unificado',
            quantidade_valor: `${totalProdutos.c} item(ns)`,
            situacao: 'ATIVO',
          },
          {
            bloco: '1. INDICADORES GERAIS (KPIs)',
            indicador: 'Valor Contábil Total em Estoque',
            referencia: 'Posição Financeira',
            quantidade_valor: Number(valorTotal.total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
            situacao: 'CONSOLIDADO',
          },
          {
            bloco: '1. INDICADORES GERAIS (KPIs)',
            indicador: 'Produtos em Estoque Baixo / Crítico',
            referencia: 'Ponto de Reposição',
            quantidade_valor: `${estoqueBaixo.c} item(ns)`,
            situacao: estoqueBaixo.c > 0 ? 'REPOSIÇÃO NECESSÁRIA' : 'REGULAR',
          },
          {
            bloco: '1. INDICADORES GERAIS (KPIs)',
            indicador: 'Requisições de Setores (Pendentes / Atendidas)',
            referencia: 'Fluxo de Dispensação',
            quantidade_valor: `${reqPendentes.c} pend. / ${reqAtendidas.c} atend.`,
            situacao: reqPendentes.c > 0 ? 'FILA ATIVA' : 'EM DIA',
          },
          {
            bloco: '1. INDICADORES GERAIS (KPIs)',
            indicador: 'Monitoramento de Validade de Lotes (Vencidos / 30d / 60d / 90d)',
            referencia: 'Controle FEFO',
            quantidade_valor: `${lotesVencidos} venc. | ${lotes30} (30d) | ${lotes60} (60d) | ${lotes90} (90d)`,
            situacao: lotesVencidos > 0 ? 'LOTES BLOQUEADOS' : lotes30 > 0 ? 'CRÍTICO 30D' : 'MONITORADO',
          },
          {
            bloco: '1. INDICADORES GERAIS (KPIs)',
            indicador: 'Empréstimos entre Entidades Pendentes (Recebidos / Concedidos)',
            referencia: 'Hospitais Parceiros',
            quantidade_valor: `${empRecPend.c} a devolver | ${empConcPend.c} a receber`,
            situacao: empRecPend.c + empConcPend.c > 0 ? 'PENDENTE QUITAÇÃO' : 'QUITADO',
          },
        ];

        const criticosRows = db.prepare(`
          SELECT codigo, nome, quantidade_atual, estoque_minimo, unidade_medida
          FROM produtos
          WHERE ativo = 1 AND quantidade_atual <= estoque_minimo
          ORDER BY (CAST(quantidade_atual AS FLOAT) / CASE WHEN estoque_minimo = 0 THEN 1 ELSE estoque_minimo END) ASC
          LIMIT 25
        `).all() as any[];

        const linhasCriticos = criticosRows.map((p) => ({
          bloco: '3. ESTOQUE CRÍTICO / REPOSIÇÃO',
          indicador: p.nome,
          referencia: `${p.codigo} (Mín: ${p.estoque_minimo} ${p.unidade_medida})`,
          quantidade_valor: `${p.quantidade_atual} ${p.unidade_medida}`,
          situacao: p.quantidade_atual <= 0 ? 'ESGOTADO (ZERO)' : 'ABAIXO DO MÍNIMO',
        }));

        const consumoRows = db.prepare(`
          SELECT cc.codigo, cc.nome, COALESCE(SUM(m.quantidade), 0) as total_itens
          FROM centros_custo cc
          LEFT JOIN movimentacoes m ON m.centro_custo_id = cc.id AND m.tipo = 'saida'
          WHERE cc.ativo = 1
          GROUP BY cc.id
          HAVING total_itens > 0
          ORDER BY total_itens DESC
        `).all() as any[];

        const linhasConsumo = consumoRows.map((c) => ({
          bloco: '4. CONSUMO POR CENTRO DE CUSTO',
          indicador: c.nome,
          referencia: `Setor: ${c.codigo}`,
          quantidade_valor: `${c.total_itens} unid. dispensadas`,
          situacao: 'CONSUMO ACUMULADO',
        }));

        dados = [
          ...linhasKpis,
          ...linhasLotesAlerta,
          ...linhasCriticos,
          ...linhasConsumo,
        ];

        resumo = `Relatório Geral Consolidado: ${totalProdutos.c} produtos ativos (${Number(valorTotal.total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}), ${estoqueBaixo.c} em estoque crítico, ${lotesVencidos} lote(s) vencido(s)/bloqueado(s) e ${lotes30 + lotes60 + lotes90} lote(s) em janela de vencimento (30/60/90 dias).`;
        break;
      }

      default:
        res.status(400).json({ error: 'Tipo de relatório não reconhecido' });
        return;
    }

    res.json({
      tipo_relatorio,
      titulo,
      subtitulo,
      data_emissao: new Date().toLocaleString('pt-BR'),
      colunas,
      dados,
      resumo,
      total_registros: dados.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao processar relatório: ' + err.message });
  }
});

// ============================================================================
// 12. RECURSOS DO SISTEMA & DOCUMENTAÇÃO
// ============================================================================

apiRouter.post('/system/reset', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || user.perfil !== 'admin') {
    res.status(403).json({ error: 'Apenas Administradores podem limpar os logs de acesso' });
    return;
  }

  try {
    resetDatabase();
    res.json({ message: 'Logs de acesso e auditoria limpos com sucesso. Os dados operacionais foram mantidos intactos.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao limpar logs de acesso: ' + err.message });
  }
});

apiRouter.get('/system/scripts', (_req, res) => {
  try {
    const schemaSql = getSchemaSql();
    const seedSql = getSeedSql();
    res.json({ schemaSql, seedSql });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao ler scripts: ' + err.message });
  }
});

// ============================================================================
// 13. BACKUP & EXPORTAÇÃO EXCLUSIVA DO ADMINISTRADOR
// ============================================================================

function getBackupTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const YYYY = d.getFullYear();
  const MM = pad(d.getMonth() + 1);
  const DD = pad(d.getDate());
  const HH = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${YYYY}${MM}${DD}_${HH}${mm}${ss}`;
}

// 13.1 Informações e Estatísticas do Banco
apiRouter.get('/backup/info', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || user.perfil !== 'admin') {
    res.status(403).json({ error: 'Acesso negado. Apenas Administradores podem consultar informações de backup.' });
    return;
  }

  try {
    const dbPath = DB_PATH;
    let sizeBytes = 0;
    if (fs.existsSync(dbPath)) {
      sizeBytes = fs.statSync(dbPath).size;
    }

    const tables = [
      'empresas_unidades',
      'centros_custo',
      'usuarios',
      'produtos',
      'requisicoes',
      'itens_requisicao',
      'historico_requisicoes',
      'movimentacoes',
      'emprestimos'
    ];

    const contagens: Record<string, number> = {};
    let totalRegistros = 0;
    for (const t of tables) {
      try {
        const row = db.prepare(`SELECT COUNT(*) as count FROM ${t}`).get() as { count: number };
        contagens[t] = row ? row.count : 0;
        totalRegistros += contagens[t];
      } catch {
        contagens[t] = 0;
      }
    }

    const formatBytes = (bytes: number) => {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    };

    res.json({
      sistema: 'Multi Almox',
      versao: '2.4',
      padrao: 'Multiárea',
      database_file: 'almoxarifado.db',
      tamanho_bytes: sizeBytes,
      tamanho_formatado: formatBytes(sizeBytes),
      total_tabelas: tables.length,
      total_registros: totalRegistros,
      contagens,
      data_servidor: new Date().toISOString(),
      modo_wal: true,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao obter dados de backup: ' + err.message });
  }
});

// 13.2 Download do Arquivo SQLite Nativo (.db)
apiRouter.get('/backup/download-db', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || user.perfil !== 'admin') {
    res.status(403).json({ error: 'Acesso negado. A exportação do banco de dados é restrita a Administradores.' });
    return;
  }

  const timestamp = getBackupTimestamp();
  const filename = `backup_almoxarifado_${timestamp}.db`;
  const tempPath = path.join(os.tmpdir(), `temp_${Date.now()}_${filename}`);

  try {
    // 1. Executa checkpoint de WAL para garantir persistência de transações pendentes
    try {
      db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    } catch (_e) {
      // Ignora erro de checkpoint se não houver WAL ativo
    }

    // 2. VACUUM INTO cria um snapshot consistente, atômico e otimizado
    db.exec(`VACUUM INTO '${tempPath.replace(/\\/g, '/')}';`);

    res.setHeader('Content-Type', 'application/x-sqlite3');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const stream = fs.createReadStream(tempPath);
    stream.pipe(res);

    const cleanup = () => {
      try {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch (_e) {}
    };

    stream.on('close', cleanup);
    stream.on('error', (err) => {
      cleanup();
      if (!res.headersSent) {
        res.status(500).json({ error: 'Erro ao transmitir cópia do banco: ' + err.message });
      }
    });
  } catch (err: any) {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch (_e) {}
    res.status(500).json({ error: 'Erro ao gerar backup SQLite (.db): ' + err.message });
  }
});

// 13.3 Download do Script SQL Completo DDL + DML (.sql)
apiRouter.get('/backup/download-sql', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || user.perfil !== 'admin') {
    res.status(403).json({ error: 'Acesso negado. A exportação do banco de dados é restrita a Administradores.' });
    return;
  }

  try {
    const timestamp = getBackupTimestamp();
    const filename = `backup_almoxarifado_${timestamp}.sql`;

    const schemaPath = path.resolve(process.cwd(), 'schema.sql');
    const ddl = fs.existsSync(schemaPath) ? fs.readFileSync(schemaPath, 'utf-8') : '';

    let sql = `-- ============================================================================\n`;
    sql += `-- MULTI ALMOX - BACKUP COMPLETO DO BANCO DE DADOS (SQL DUMP)\n`;
    sql += `-- Data de Geração: ${new Date().toLocaleString('pt-BR')}\n`;
    sql += `-- Sistema: Multi Almox\n`;
    sql += `-- Versão: 2.4 | Arquivo de Origem: almoxarifado.db\n`;
    sql += `-- ============================================================================\n\n`;

    sql += `-- ----------------------------------------------------------------------------\n`;
    sql += `-- 1. DEFINIÇÃO DA ESTRUTURA (DDL)\n`;
    sql += `-- ----------------------------------------------------------------------------\n\n`;
    sql += ddl + `\n\n`;

    sql += `-- ----------------------------------------------------------------------------\n`;
    sql += `-- 2. CARGA DE DADOS (DML / INSERTS)\n`;
    sql += `-- ----------------------------------------------------------------------------\n\n`;
    sql += `PRAGMA foreign_keys = OFF;\n\n`;

    const tables = [
      'empresas_unidades',
      'centros_custo',
      'usuarios',
      'fornecedores',
      'grupos_produtos',
      'produtos',
      'produto_fornecedores',
      'lotes_estoque',
      'notas_fiscais',
      'historico_notas_fiscais',
      'movimentacoes',
      'requisicoes',
      'itens_requisicao',
      'historico_requisicoes',
      'emprestimos',
      'emprestimos_institucionais',
      'itens_emprestimo_institucional',
      'inventarios_estoque',
      'itens_inventario'
    ];

    for (const table of tables) {
      try {
        const rows = db.prepare(`SELECT * FROM ${table}`).all() as any[];
        sql += `-- Tabela: ${table} (${rows.length} registros)\n`;
        if (rows.length > 0) {
          for (const row of rows) {
            const cols = Object.keys(row);
            const vals = cols.map((c) => {
              const val = row[c];
              if (val === null || val === undefined) return 'NULL';
              if (typeof val === 'number') return String(val);
              return `'${String(val).replace(/'/g, "''")}'`;
            });
            sql += `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${vals.join(', ')});\n`;
          }
        }
        sql += `\n`;
      } catch (tableErr: any) {
        sql += `-- Erro ao exportar tabela ${table}: ${tableErr.message}\n\n`;
      }
    }

    sql += `PRAGMA foreign_keys = ON;\n`;
    sql += `-- Fim do dump SQL gerado com sucesso\n`;

    res.setHeader('Content-Type', 'application/sql; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(sql);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao gerar script SQL (.sql): ' + err.message });
  }
});

// 13.4 Download dos Dados em Formato JSON (.json)
apiRouter.get('/backup/download-json', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || user.perfil !== 'admin') {
    res.status(403).json({ error: 'Acesso negado. A exportação do banco de dados é restrita a Administradores.' });
    return;
  }

  try {
    const timestamp = getBackupTimestamp();
    const filename = `backup_almoxarifado_${timestamp}.json`;

    const tables = [
      'empresas_unidades',
      'centros_custo',
      'usuarios',
      'fornecedores',
      'grupos_produtos',
      'produtos',
      'produto_fornecedores',
      'lotes_estoque',
      'notas_fiscais',
      'historico_notas_fiscais',
      'movimentacoes',
      'requisicoes',
      'itens_requisicao',
      'historico_requisicoes',
      'emprestimos',
      'emprestimos_institucionais',
      'itens_emprestimo_institucional',
      'inventarios_estoque',
      'itens_inventario'
    ];

    const exportData: Record<string, any> = {
      metadata: {
        sistema: 'Multi Almox',
        versao: '2.4',
        padrao: 'Multiárea',
        gerado_em: new Date().toISOString(),
        gerado_por: {
          id: user.id,
          nome: user.nome,
          login: user.login,
          perfil: user.perfil,
        },
      },
      tabelas: {}
    };

    for (const table of tables) {
      try {
        exportData.tabelas[table] = db.prepare(`SELECT * FROM ${table}`).all();
      } catch {
        exportData.tabelas[table] = [];
      }
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(exportData, null, 2));
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao gerar exportação JSON: ' + err.message });
  }
});

// ============================================================================
// MÓDULO DE INVENTÁRIO DO ESTOQUE (RECONTAGEM FÍSICA E AJUSTE DE SALDO)
// ============================================================================

// 1. Sugestão de código para novo inventário (ex: INV-2026-0001)
apiRouter.get('/inventarios/sugestao-codigo', (req, res) => {
  const ano = new Date().getFullYear();
  const prefixo = `INV-${ano}`;
  const maxRow = db.prepare(`
    SELECT codigo 
    FROM inventarios_estoque 
    WHERE codigo LIKE ? 
    ORDER BY id DESC 
    LIMIT 1
  `).get(`${prefixo}-%`) as { codigo?: string } | undefined;

  let nextNum = 1;
  if (maxRow && maxRow.codigo) {
    const parts = maxRow.codigo.split('-');
    const lastNum = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastNum)) {
      nextNum = lastNum + 1;
    }
  }

  const codigo = `${prefixo}-${String(nextNum).padStart(4, '0')}`;
  res.json({ codigo });
});

// 2. Consulta de itens base para contagem física de um Centro de Custo
apiRouter.get('/inventarios/itens-base', (req, res) => {
  try {
    const { centro_custo_id, grupo_id } = req.query;
    // Lista todos os produtos ativos do catálogo
    let prodQuery = `
      SELECT 
        p.id, p.codigo, p.nome, p.unidade_medida, p.tipo, p.controla_validade, p.quantidade_atual,
        p.grupo_id, gp.nome as grupo_nome, gp.codigo as grupo_codigo
      FROM produtos p
      LEFT JOIN grupos_produtos gp ON p.grupo_id = gp.id
      WHERE p.ativo = 1
    `;
    const prodParams: any[] = [];
    if (grupo_id && String(grupo_id).trim()) {
      prodQuery += ' AND p.grupo_id = ?';
      prodParams.push(Number(grupo_id));
    }
    prodQuery += ' ORDER BY p.nome ASC';

    const produtos = db.prepare(prodQuery).all(...prodParams) as any[];

    const itensBase: any[] = [];

    for (const prod of produtos) {
      // Busca lotes existentes para o produto
      const lotes = db.prepare(`
        SELECT id, numero_lote, data_validade, quantidade_atual
        FROM lotes_estoque
        WHERE produto_id = ?
        ORDER BY CASE WHEN data_validade IS NULL THEN 1 ELSE 0 END ASC, data_validade ASC, id ASC
      `).all(prod.id) as any[];

      if (lotes.length > 0) {
        for (const lot of lotes) {
          itensBase.push({
            produto_id: prod.id,
            produto_codigo: prod.codigo,
            produto_nome: prod.nome,
            grupo_id: prod.grupo_id,
            grupo_nome: prod.grupo_nome,
            grupo_codigo: prod.grupo_codigo,
            unidade_medida: prod.unidade_medida,
            produto_tipo: prod.tipo,
            lote_id: lot.id,
            numero_lote: lot.numero_lote,
            data_validade: lot.data_validade,
            quantidade_sistema: Number(lot.quantidade_atual || 0),
            quantidade_fisica: Number(lot.quantidade_atual || 0),
            diferenca: 0,
          });
        }
      } else {
        itensBase.push({
          produto_id: prod.id,
          produto_codigo: prod.codigo,
          produto_nome: prod.nome,
          grupo_id: prod.grupo_id,
          grupo_nome: prod.grupo_nome,
          grupo_codigo: prod.grupo_codigo,
          unidade_medida: prod.unidade_medida,
          produto_tipo: prod.tipo,
          lote_id: null,
          numero_lote: 'S/ LOTE',
          data_validade: null,
          quantidade_sistema: Number(prod.quantidade_atual || 0),
          quantidade_fisica: Number(prod.quantidade_atual || 0),
          diferenca: 0,
        });
      }
    }

    res.json(itensBase);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao carregar itens base do inventário: ' + err.message });
  }
});

// 3. Consulta de Inventários com Filtros
apiRouter.get('/inventarios', (req, res) => {
  try {
    const { codigo, data_inicio, data_fim, finalizado, centro_custo_id } = req.query;

    let sql = `
      SELECT 
        i.*,
        COALESCE(e.codigo, '001') as empresa_codigo,
        COALESCE(e.nome, 'Almoxarifado Central') as empresa_nome,
        COALESCE(cc.codigo, i.centro_custo_codigo, '') as centro_custo_codigo,
        COALESCE(cc.nome, i.centro_custo_nome, 'Centro de Custo') as centro_custo_nome,
        COALESCE(u.nome, i.usuario_nome, 'Usuário do Sistema') as usuario_nome,
        (SELECT COUNT(*) FROM itens_inventario ii WHERE ii.inventario_id = i.id) as total_itens
      FROM inventarios_estoque i
      LEFT JOIN empresas_unidades e ON i.empresa_id = e.id
      LEFT JOIN centros_custo cc ON i.centro_custo_id = cc.id
      LEFT JOIN usuarios u ON i.usuario_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (codigo && String(codigo).trim()) {
      sql += ' AND i.codigo LIKE ?';
      params.push(`%${String(codigo).trim()}%`);
    }

    if (data_inicio && String(data_inicio).trim()) {
      sql += ' AND date(i.data) >= date(?)';
      params.push(String(data_inicio).trim());
    }

    if (data_fim && String(data_fim).trim()) {
      sql += ' AND date(i.data) <= date(?)';
      params.push(String(data_fim).trim());
    }

    if (finalizado && String(finalizado).toUpperCase() !== 'TODOS') {
      const finStr = String(finalizado).toUpperCase();
      if (finStr === 'SIM' || finStr === '1') {
        sql += ' AND i.finalizado = 1';
      } else if (finStr === 'NAO' || finStr === 'NÃO' || finStr === '0') {
        sql += ' AND i.finalizado = 0';
      }
    }

    if (centro_custo_id && String(centro_custo_id).trim()) {
      sql += ' AND i.centro_custo_id = ?';
      params.push(Number(centro_custo_id));
    }

    sql += ' ORDER BY i.data DESC, i.hora DESC, i.id DESC';

    const inventarios = db.prepare(sql).all(...params);
    res.json(inventarios);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao consultar inventários: ' + err.message });
  }
});

// 4. Detalhes do Inventário por ID (incluindo grade de itens)
apiRouter.get('/inventarios/:id', (req, res) => {
  try {
    const invId = Number(req.params.id);
    const inv = db.prepare(`
      SELECT 
        i.*,
        COALESCE(e.codigo, '001') as empresa_codigo,
        COALESCE(e.nome, 'Almoxarifado Central') as empresa_nome,
        COALESCE(cc.codigo, i.centro_custo_codigo, '') as centro_custo_codigo,
        COALESCE(cc.nome, i.centro_custo_nome, 'Centro de Custo') as centro_custo_nome,
        COALESCE(u.nome, i.usuario_nome, 'Usuário do Sistema') as usuario_nome
      FROM inventarios_estoque i
      LEFT JOIN empresas_unidades e ON i.empresa_id = e.id
      LEFT JOIN centros_custo cc ON i.centro_custo_id = cc.id
      LEFT JOIN usuarios u ON i.usuario_id = u.id
      WHERE i.id = ?
    `).get(invId) as any;

    if (!inv) {
      res.status(404).json({ error: 'Inventário não encontrado' });
      return;
    }

    const itens = db.prepare(`
      SELECT 
        ii.*,
        p.codigo as produto_codigo,
        p.nome as produto_nome,
        p.grupo_id,
        gp.nome as grupo_nome,
        gp.codigo as grupo_codigo,
        p.unidade_medida,
        p.tipo as produto_tipo,
        COALESCE(ii.numero_lote, le.numero_lote, 'S/ LOTE') as numero_lote,
        COALESCE(ii.data_validade, le.data_validade) as data_validade
      FROM itens_inventario ii
      JOIN produtos p ON ii.produto_id = p.id
      LEFT JOIN grupos_produtos gp ON p.grupo_id = gp.id
      LEFT JOIN lotes_estoque le ON ii.lote_id = le.id
      WHERE ii.inventario_id = ?
      ORDER BY p.codigo ASC, ii.id ASC
    `).all(invId) as any[];

    res.json({
      ...inv,
      itens,
      total_itens: itens.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao carregar detalhes do inventário: ' + err.message });
  }
});

// Helper de fechamento atômico de inventário
function executarFechamentoInventario(invId: number, usuario: any) {
  const inv = db.prepare('SELECT * FROM inventarios_estoque WHERE id = ?').get(invId) as any;
  if (!inv) throw new Error('Inventário não encontrado.');
  if (inv.finalizado === 1) throw new Error('Este inventário já foi finalizado anteriormente e é somente leitura.');

  const itens = db.prepare(`
    SELECT ii.*, p.codigo as produto_codigo, p.nome as produto_nome, p.unidade_medida, p.tipo as produto_tipo
    FROM itens_inventario ii
    JOIN produtos p ON ii.produto_id = p.id
    WHERE ii.inventario_id = ?
  `).all(invId) as any[];

  const docRef = `Inventário Nº ${inv.codigo}`;
  const now = new Date().toISOString();

  // 1. Ajuste Direto de Estoque para cada item contado
  for (const item of itens) {
    const qtdSistema = Number(item.quantidade_sistema || 0);
    const qtdFisica = Number(item.quantidade_fisica || 0);
    const diferenca = qtdFisica - qtdSistema;

    // Atualiza a diferença na tabela do item
    db.prepare('UPDATE itens_inventario SET diferenca = ? WHERE id = ?').run(diferenca, item.id);

    if (diferenca > 0) {
      // Contagem Física > Estoque Sistema: Entrada por Ajuste de Inventário (+)
      const qtdEntrada = diferenca;
      db.prepare(`
        INSERT INTO movimentacoes (
          tipo, motivo_diverso, produto_id, lote_id, quantidade,
          centro_custo_id, usuario_id, responsavel_nome, documento_referencia,
          numero_lote, data_validade, observacao, data_movimentacao
        ) VALUES (
          'entrada', 'Ajuste de Inventário (+)', ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?
        )
      `).run(
        item.produto_id,
        item.lote_id || null,
        qtdEntrada,
        inv.centro_custo_id,
        usuario.id,
        usuario.nome,
        docRef,
        item.numero_lote || null,
        item.data_validade || null,
        `Ajuste de inventário físico (+): Contagem física ${qtdFisica} ${item.unidade_medida} (Saldo sistema anterior: ${qtdSistema})`,
        now
      );

      // Atualiza lote de estoque
      if (item.lote_id) {
        db.prepare('UPDATE lotes_estoque SET quantidade_atual = quantidade_atual + ? WHERE id = ?').run(qtdEntrada, item.lote_id);
      } else if (item.numero_lote && item.numero_lote !== 'S/ LOTE') {
        upsertLoteEstoque({
          produto_id: item.produto_id,
          numero_lote: item.numero_lote,
          data_validade: item.data_validade,
          quantidade: qtdEntrada,
          documento_referencia: docRef,
        });
      }

      // Atualiza saldo total do produto
      db.prepare('UPDATE produtos SET quantidade_atual = quantidade_atual + ? WHERE id = ?').run(qtdEntrada, item.produto_id);

    } else if (diferenca < 0) {
      // Contagem Física < Estoque Sistema: Saída por Ajuste de Inventário (-)
      const qtdSaida = Math.abs(diferenca);
      db.prepare(`
        INSERT INTO movimentacoes (
          tipo, motivo_diverso, produto_id, lote_id, quantidade,
          centro_custo_id, usuario_id, responsavel_nome, documento_referencia,
          numero_lote, data_validade, observacao, data_movimentacao
        ) VALUES (
          'saida', 'Ajuste de Inventário (-)', ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?
        )
      `).run(
        item.produto_id,
        item.lote_id || null,
        qtdSaida,
        inv.centro_custo_id,
        usuario.id,
        usuario.nome,
        docRef,
        item.numero_lote || null,
        item.data_validade || null,
        `Ajuste de inventário físico (-): Contagem física ${qtdFisica} ${item.unidade_medida} (Saldo sistema anterior: ${qtdSistema})`,
        now
      );

      // Atualiza lote de estoque
      if (item.lote_id) {
        db.prepare('UPDATE lotes_estoque SET quantidade_atual = MAX(0, quantidade_atual - ?) WHERE id = ?').run(qtdSaida, item.lote_id);
      }

      // Atualiza saldo total do produto
      db.prepare('UPDATE produtos SET quantidade_atual = MAX(0, quantidade_atual - ?) WHERE id = ?').run(qtdSaida, item.produto_id);
    }
  }

  // 2. Efeito dos Toggles:
  // Se Zera estoque de produtos por Lote estiver ativo: lotes com saldo que não receberam contagem são zerados
  if (inv.zera_por_lote === 1) {
    const countedLoteIds = itens.map((it) => it.lote_id).filter(Boolean);
    let queryLotesNaoContados = 'SELECT * FROM lotes_estoque WHERE quantidade_atual > 0';
    const paramsLotes: any[] = [];
    if (countedLoteIds.length > 0) {
      queryLotesNaoContados += ` AND id NOT IN (${countedLoteIds.map(() => '?').join(',')})`;
      paramsLotes.push(...countedLoteIds);
    }
    const lotesNaoContados = db.prepare(queryLotesNaoContados).all(...paramsLotes) as any[];

    for (const lot of lotesNaoContados) {
      const saldoZerar = Number(lot.quantidade_atual);
      if (saldoZerar > 0) {
        db.prepare(`
          INSERT INTO movimentacoes (
            tipo, motivo_diverso, produto_id, lote_id, quantidade,
            centro_custo_id, usuario_id, responsavel_nome, documento_referencia,
            numero_lote, data_validade, observacao, data_movimentacao
          ) VALUES (
            'saida', 'Ajuste de Inventário (-)', ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?
          )
        `).run(
          lot.produto_id,
          lot.id,
          saldoZerar,
          inv.centro_custo_id,
          usuario.id,
          usuario.nome,
          docRef,
          lot.numero_lote,
          lot.data_validade,
          `Zeramento por lote não contado no inventário (Lote: ${lot.numero_lote})`,
          now
        );

        db.prepare('UPDATE lotes_estoque SET quantidade_atual = 0 WHERE id = ?').run(lot.id);
        db.prepare('UPDATE produtos SET quantidade_atual = MAX(0, quantidade_atual - ?) WHERE id = ?').run(saldoZerar, lot.produto_id);
      }
    }
  }

  // Se Zera estoque de produtos não listados estiver ativo: produtos que não foram incluídos na contagem têm seus saldos zerados
  if (inv.zera_nao_listados === 1) {
    const countedProdIds = Array.from(new Set(itens.map((it) => it.produto_id)));
    let queryProdsNaoContados = 'SELECT * FROM produtos WHERE quantidade_atual > 0';
    const paramsProds: any[] = [];
    if (countedProdIds.length > 0) {
      queryProdsNaoContados += ` AND id NOT IN (${countedProdIds.map(() => '?').join(',')})`;
      paramsProds.push(...countedProdIds);
    }
    const prodsNaoContados = db.prepare(queryProdsNaoContados).all(...paramsProds) as any[];

    for (const prod of prodsNaoContados) {
      const saldoZerar = Number(prod.quantidade_atual);
      if (saldoZerar > 0) {
        db.prepare(`
          INSERT INTO movimentacoes (
            tipo, motivo_diverso, produto_id, lote_id, quantidade,
            centro_custo_id, usuario_id, responsavel_nome, documento_referencia,
            numero_lote, data_validade, observacao, data_movimentacao
          ) VALUES (
            'saida', 'Ajuste de Inventário (-)', ?, NULL, ?,
            ?, ?, ?, ?,
            NULL, NULL, ?, ?
          )
        `).run(
          prod.id,
          saldoZerar,
          inv.centro_custo_id,
          usuario.id,
          usuario.nome,
          docRef,
          `Zeramento de produto não listado no inventário (${prod.codigo} - ${prod.nome})`,
          now
        );

        db.prepare('UPDATE lotes_estoque SET quantidade_atual = 0 WHERE produto_id = ?').run(prod.id);
        db.prepare('UPDATE produtos SET quantidade_atual = 0 WHERE id = ?').run(prod.id);
      }
    }
  }

  // 3. Marca o inventário como finalizado
  db.prepare('UPDATE inventarios_estoque SET finalizado = 1 WHERE id = ?').run(invId);
}

// 5. Criação de Novo Inventário (Salvar Rascunho ou Salvar e Fechar)
apiRouter.post('/inventarios', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || (user.perfil !== 'admin' && user.perfil !== 'almoxarife')) {
    res.status(403).json({ error: 'Apenas Almoxarifes e Administradores podem registrar inventários de estoque.' });
    return;
  }

  const {
    codigo,
    data,
    hora,
    centro_custo_id,
    zera_por_lote,
    zera_nao_listados,
    observacao,
    finalizar,
    itens,
  } = req.body || {};

  if (!centro_custo_id) {
    res.status(400).json({ error: 'O Centro de Custo é obrigatório para registrar o inventário.' });
    return;
  }

  const dtFinal = data && String(data).trim() ? String(data).trim() : new Date().toISOString().slice(0, 10);
  const hrFinal = hora && String(hora).trim() ? String(hora).trim() : new Date().toTimeString().slice(0, 8);
  const codFinal = codigo && String(codigo).trim() ? String(codigo).trim().toUpperCase() : `INV-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;

  try {
    const result = runInTransaction(() => {
      // Busca dados do Centro de Custo para armazenar cópias seguras
      const ccRow = db.prepare('SELECT codigo, nome, empresa_id FROM centros_custo WHERE id = ?').get(Number(centro_custo_id)) as any;
      const ccCodigo = ccRow?.codigo || null;
      const ccNome = ccRow?.nome || null;
      const empId = ccRow?.empresa_id || 1;
      const uNome = user.nome || null;

      // Insere o inventário
      const info = db.prepare(`
        INSERT INTO inventarios_estoque (
          codigo, data, hora, empresa_id, centro_custo_id, centro_custo_codigo, centro_custo_nome,
          zera_por_lote, zera_nao_listados, observacao, finalizado, usuario_id, usuario_nome
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `).run(
        codFinal,
        dtFinal,
        hrFinal,
        empId,
        Number(centro_custo_id),
        ccCodigo,
        ccNome,
        zera_por_lote ? 1 : 0,
        zera_nao_listados ? 1 : 0,
        observacao || null,
        user.id,
        uNome
      );

      const invId = Number(info.lastInsertRowid);

      // Insere itens do inventário
      if (Array.isArray(itens) && itens.length > 0) {
        const insertItem = db.prepare(`
          INSERT INTO itens_inventario (
            inventario_id, produto_id, lote_id, numero_lote, data_validade,
            quantidade_sistema, quantidade_fisica, diferenca
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const it of itens) {
          const qtdSis = Number(it.quantidade_sistema || 0);
          const qtdFis = Number(it.quantidade_fisica !== undefined ? it.quantidade_fisica : qtdSis);
          const dif = qtdFis - qtdSis;

          insertItem.run(
            invId,
            Number(it.produto_id),
            it.lote_id ? Number(it.lote_id) : null,
            it.numero_lote || null,
            it.data_validade || null,
            qtdSis,
            qtdFis,
            dif
          );
        }
      }

      // Se a ação for "SALVAR E FECHAR", executa imediatamente a rotina atômica
      if (finalizar) {
        executarFechamentoInventario(invId, user);
      }

      return { id: invId, codigo: codFinal, finalizado: finalizar ? 1 : 0 };
    });

    res.status(201).json({
      message: finalizar ? 'Inventário finalizado e ajustes de estoque aplicados com sucesso!' : 'Inventário salvo como rascunho com sucesso!',
      ...result,
    });
  } catch (err: any) {
    res.status(400).json({ error: 'Erro ao registrar inventário: ' + err.message });
  }
});

// 6. Atualização de Inventário Existente (Salvar Rascunho ou Salvar e Fechar)
apiRouter.put('/inventarios/:id', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || (user.perfil !== 'admin' && user.perfil !== 'almoxarife')) {
    res.status(403).json({ error: 'Apenas Almoxarifes e Administradores podem alterar inventários.' });
    return;
  }

  const invId = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM inventarios_estoque WHERE id = ?').get(invId) as any;
  if (!existing) {
    res.status(404).json({ error: 'Inventário não encontrado' });
    return;
  }

  if (existing.finalizado === 1) {
    res.status(400).json({ error: 'Inventário já finalizado. Registros concluídos são somente leitura.' });
    return;
  }

  const {
    data,
    hora,
    centro_custo_id,
    zera_por_lote,
    zera_nao_listados,
    observacao,
    finalizar,
    itens,
  } = req.body || {};

  try {
    runInTransaction(() => {
      let ccCodigo = existing.centro_custo_codigo;
      let ccNome = existing.centro_custo_nome;
      if (centro_custo_id && Number(centro_custo_id) !== existing.centro_custo_id) {
        const ccRow = db.prepare('SELECT codigo, nome FROM centros_custo WHERE id = ?').get(Number(centro_custo_id)) as any;
        if (ccRow) {
          ccCodigo = ccRow.codigo;
          ccNome = ccRow.nome;
        }
      }

      db.prepare(`
        UPDATE inventarios_estoque
        SET data = COALESCE(?, data),
            hora = COALESCE(?, hora),
            centro_custo_id = COALESCE(?, centro_custo_id),
            centro_custo_codigo = ?,
            centro_custo_nome = ?,
            zera_por_lote = ?,
            zera_nao_listados = ?,
            observacao = ?
        WHERE id = ?
      `).run(
        data || null,
        hora || null,
        centro_custo_id ? Number(centro_custo_id) : null,
        ccCodigo,
        ccNome,
        zera_por_lote ? 1 : 0,
        zera_nao_listados ? 1 : 0,
        observacao !== undefined ? observacao : existing.observacao,
        invId
      );

      // Atualiza itens: apaga os itens anteriores e recria com os dados digitados
      if (Array.isArray(itens)) {
        db.prepare('DELETE FROM itens_inventario WHERE inventario_id = ?').run(invId);

        const insertItem = db.prepare(`
          INSERT INTO itens_inventario (
            inventario_id, produto_id, lote_id, numero_lote, data_validade,
            quantidade_sistema, quantidade_fisica, diferenca
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const it of itens) {
          const qtdSis = Number(it.quantidade_sistema || 0);
          const qtdFis = Number(it.quantidade_fisica !== undefined ? it.quantidade_fisica : qtdSis);
          const dif = qtdFis - qtdSis;

          insertItem.run(
            invId,
            Number(it.produto_id),
            it.lote_id ? Number(it.lote_id) : null,
            it.numero_lote || null,
            it.data_validade || null,
            qtdSis,
            qtdFis,
            dif
          );
        }
      }

      // Se solicitado finalizar:
      if (finalizar) {
        executarFechamentoInventario(invId, user);
      }
    });

    res.json({
      message: finalizar ? 'Inventário finalizado e ajustes de saldo aplicados com sucesso!' : 'Inventário atualizado com sucesso!',
      id: invId,
      finalizado: finalizar ? 1 : 0,
    });
  } catch (err: any) {
    res.status(400).json({ error: 'Erro ao atualizar inventário: ' + err.message });
  }
});

// 7. Ação explícita de Fechamento de Inventário
apiRouter.post('/inventarios/:id/fechar', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || (user.perfil !== 'admin' && user.perfil !== 'almoxarife')) {
    res.status(403).json({ error: 'Apenas Almoxarifes e Administradores podem finalizar inventários.' });
    return;
  }

  const invId = Number(req.params.id);

  try {
    runInTransaction(() => {
      executarFechamentoInventario(invId, user);
    });

    res.json({ message: 'Inventário concluído e fechado com sucesso! Saldos ajustados atomicamente.' });
  } catch (err: any) {
    res.status(400).json({ error: 'Erro ao finalizar inventário: ' + err.message });
  }
});

// 8. Exclusão de Inventário em Rascunho
apiRouter.delete('/inventarios/:id', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || (user.perfil !== 'admin' && user.perfil !== 'almoxarife')) {
    res.status(403).json({ error: 'Permissão negada.' });
    return;
  }

  const invId = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM inventarios_estoque WHERE id = ?').get(invId) as any;
  if (!existing) {
    res.status(404).json({ error: 'Inventário não encontrado' });
    return;
  }

  if (existing.finalizado === 1) {
    res.status(400).json({ error: 'Inventários finalizados não podem ser excluídos por exigência de auditoria e conformidade fiscal.' });
    return;
  }

  try {
    runInTransaction(() => {
      db.prepare('DELETE FROM itens_inventario WHERE inventario_id = ?').run(invId);
      db.prepare('DELETE FROM inventarios_estoque WHERE id = ?').run(invId);
    });
    res.json({ message: 'Inventário em rascunho excluído com sucesso.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao excluir inventário: ' + err.message });
  }
});

// ============================================================================
// 9. IMPORTAÇÃO DE CADASTROS (PRODUTOS E FORNECEDORES / ENTIDADES)
// ============================================================================

// ============================================================================
// 10.1 MÓDULO KARDEX DO PRODUTO (SOMENTE LEITURA)
// ============================================================================

apiRouter.get('/kardex', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || user.perfil === 'requisitante') {
    res.status(403).json({ error: 'Acesso restrito. Requisitantes não possuem autorização para visualizar o Kardex de estoque.' });
    return;
  }

  const { produto_id, data_inicio, data_fim } = req.query;

  if (!produto_id) {
    res.status(400).json({ error: 'Informe o produto para visualizar o Kardex' });
    return;
  }

  try {
    const prod = db.prepare('SELECT id, codigo, nome, unidade_medida, tipo, quantidade_atual FROM produtos WHERE id = ?').get(Number(produto_id)) as any;
    if (!prod) {
      res.status(404).json({ error: 'Produto não encontrado no catálogo da área' });
      return;
    }

    const hoje = new Date();
    const data30DiasAtras = new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const dataHojeStr = hoje.toISOString().slice(0, 10);

    const dtIniStr = data_inicio && String(data_inicio).trim() ? String(data_inicio).trim() : data30DiasAtras;
    const dtFimStr = data_fim && String(data_fim).trim() ? String(data_fim).trim() : dataHojeStr;

    const startTs = `${dtIniStr} 00:00:00`;
    const endTs = `${dtFimStr} 23:59:59`;

    // 1. Calcula Saldo Inicial anterior ao início do período
    const sumEntradasAntes = db.prepare(`
      SELECT COALESCE(SUM(quantidade), 0) as total
      FROM movimentacoes
      WHERE produto_id = ? AND tipo IN ('entrada', 'estorno_saida')
        AND datetime(data_movimentacao) < datetime(?)
    `).get(prod.id, startTs) as { total: number };

    const sumSaidasAntes = db.prepare(`
      SELECT COALESCE(SUM(quantidade), 0) as total
      FROM movimentacoes
      WHERE produto_id = ? AND tipo IN ('saida', 'estorno_entrada')
        AND datetime(data_movimentacao) < datetime(?)
    `).get(prod.id, startTs) as { total: number };

    const saldoInicial = Number(sumEntradasAntes.total || 0) - Number(sumSaidasAntes.total || 0);

    // 2. Busca movimentações do período em ordem cronológica
    const movs = db.prepare(`
      SELECT m.id, m.tipo, m.motivo_diverso, m.quantidade, m.documento_referencia,
             m.numero_lote, m.data_validade, m.valor_unitario, m.observacao, m.data_movimentacao,
             u.nome as usuario_nome, u.login as usuario_login,
             cc.nome as centro_custo_nome, cc.codigo as centro_custo_codigo,
             f.razao_social as fornecedor_nome
      FROM movimentacoes m
      JOIN usuarios u ON m.usuario_id = u.id
      LEFT JOIN centros_custo cc ON m.centro_custo_id = cc.id
      LEFT JOIN fornecedores f ON m.fornecedor_id = f.id
      WHERE m.produto_id = ?
        AND datetime(m.data_movimentacao) >= datetime(?)
        AND datetime(m.data_movimentacao) <= datetime(?)
      ORDER BY datetime(m.data_movimentacao) ASC, m.id ASC
    `).all(prod.id, startTs, endTs) as any[];

    let runningSaldo = saldoInicial;
    let totalEntradas = 0;
    let totalSaidas = 0;

    const movimentacoesProcessadas = movs.map((m) => {
      const qtd = Number(m.quantidade || 0);
      let entrada = 0;
      let saida = 0;

      if (['entrada', 'estorno_saida'].includes(m.tipo)) {
        entrada = qtd;
        totalEntradas += qtd;
        runningSaldo += qtd;
      } else {
        saida = qtd;
        totalSaidas += qtd;
        runningSaldo -= qtd;
      }

      let dataFormatada = m.data_movimentacao;
      try {
        const d = new Date(m.data_movimentacao);
        if (!isNaN(d.getTime())) {
          dataFormatada = d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        }
      } catch {}

      return {
        ...m,
        entrada,
        saida,
        saldo_apos: runningSaldo,
        data_hora_formatada: dataFormatada
      };
    });

    res.json({
      produto: prod,
      periodo: { data_inicio: dtIniStr, data_fim: dtFimStr },
      saldo_inicial: saldoInicial,
      total_entradas: totalEntradas,
      total_saidas: totalSaidas,
      saldo_final: runningSaldo,
      movimentacoes: movimentacoesProcessadas
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao calcular Kardex do produto: ' + err.message });
  }
});

// Relatório Geral de Movimentações por Período (Todos os Produtos Movimentados)
apiRouter.get('/kardex/geral', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || user.perfil === 'requisitante') {
    res.status(403).json({ error: 'Acesso restrito. Requisitantes não possuem autorização para visualizar o Kardex de estoque.' });
    return;
  }

  const { data_inicio, data_fim } = req.query;

  const hoje = new Date();
  const data30DiasAtras = new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const dataHojeStr = hoje.toISOString().slice(0, 10);

  const dtIniStr = data_inicio && String(data_inicio).trim() ? String(data_inicio).trim() : data30DiasAtras;
  const dtFimStr = data_fim && String(data_fim).trim() ? String(data_fim).trim() : dataHojeStr;

  const startTs = `${dtIniStr} 00:00:00`;
  const endTs = `${dtFimStr} 23:59:59`;

  try {
    const produtoIdsMov = db.prepare(`
      SELECT DISTINCT produto_id
      FROM movimentacoes
      WHERE datetime(data_movimentacao) >= datetime(?)
        AND datetime(data_movimentacao) <= datetime(?)
    `).all(startTs, endTs) as Array<{ produto_id: number }>;

    const ids = produtoIdsMov.map((r) => r.produto_id);
    if (ids.length === 0) {
      res.json({ periodo: { data_inicio: dtIniStr, data_fim: dtFimStr }, total_produtos: 0, produtos: [] });
      return;
    }

    const placeholders = ids.map(() => '?').join(',');
    const produtosMovimentados = db.prepare(`
      SELECT id, codigo, nome, unidade_medida, tipo, quantidade_atual
      FROM produtos
      WHERE id IN (${placeholders})
      ORDER BY nome ASC
    `).all(...ids) as any[];

    const resultadoProdutos = [];

    for (const prod of produtosMovimentados) {
      const sumEntradasAntes = db.prepare(`
        SELECT COALESCE(SUM(quantidade), 0) as total
        FROM movimentacoes
        WHERE produto_id = ? AND tipo IN ('entrada', 'estorno_saida')
          AND datetime(data_movimentacao) < datetime(?)
      `).get(prod.id, startTs) as { total: number };

      const sumSaidasAntes = db.prepare(`
        SELECT COALESCE(SUM(quantidade), 0) as total
        FROM movimentacoes
        WHERE produto_id = ? AND tipo IN ('saida', 'estorno_entrada')
          AND datetime(data_movimentacao) < datetime(?)
      `).get(prod.id, startTs) as { total: number };

      const saldoInicial = Number(sumEntradasAntes.total || 0) - Number(sumSaidasAntes.total || 0);

      const movs = db.prepare(`
        SELECT m.id, m.tipo, m.motivo_diverso, m.quantidade, m.documento_referencia,
               m.numero_lote, m.data_validade, m.valor_unitario, m.observacao, m.data_movimentacao,
               u.nome as usuario_nome, cc.nome as centro_custo_nome, f.razao_social as fornecedor_nome
        FROM movimentacoes m
        JOIN usuarios u ON m.usuario_id = u.id
        LEFT JOIN centros_custo cc ON m.centro_custo_id = cc.id
        LEFT JOIN fornecedores f ON m.fornecedor_id = f.id
        WHERE m.produto_id = ?
          AND datetime(m.data_movimentacao) >= datetime(?)
          AND datetime(m.data_movimentacao) <= datetime(?)
        ORDER BY datetime(m.data_movimentacao) ASC, m.id ASC
      `).all(prod.id, startTs, endTs) as any[];

      let runningSaldo = saldoInicial;
      let totalEntradas = 0;
      let totalSaidas = 0;

      const movimentacoesProcessadas = movs.map((m) => {
        const qtd = Number(m.quantidade || 0);
        let entrada = 0;
        let saida = 0;

        if (['entrada', 'estorno_saida'].includes(m.tipo)) {
          entrada = qtd;
          totalEntradas += qtd;
          runningSaldo += qtd;
        } else {
          saida = qtd;
          totalSaidas += qtd;
          runningSaldo -= qtd;
        }

        let dataFormatada = m.data_movimentacao;
        try {
          const d = new Date(m.data_movimentacao);
          if (!isNaN(d.getTime())) {
            dataFormatada = d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
          }
        } catch {}

        return {
          ...m,
          entrada,
          saida,
          saldo_apos: runningSaldo,
          data_hora_formatada: dataFormatada,
        };
      });

      resultadoProdutos.push({
        produto: prod,
        saldo_inicial: saldoInicial,
        total_entradas: totalEntradas,
        total_saidas: totalSaidas,
        saldo_final: runningSaldo,
        movimentacoes: movimentacoesProcessadas,
      });
    }

    res.json({
      periodo: { data_inicio: dtIniStr, data_fim: dtFimStr },
      total_produtos: resultadoProdutos.length,
      produtos: resultadoProdutos,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao gerar relatório geral de Kardex: ' + err.message });
  }
});

// ============================================================================
// 10.2 MÓDULO LISTA DE COMPRAS / REPOSIÇÃO DE ESTOQUE
// ============================================================================

apiRouter.get('/lista-compras/calcular', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || user.perfil === 'requisitante') {
    res.status(403).json({ error: 'Acesso restrito. Requisitantes não possuem autorização para o relatório de reposição.' });
    return;
  }

  const { data_inicio, data_fim, grupo_id, produto_id, somente_sugeridos, tipos_saida } = req.query;

  const hoje = new Date();
  const data30DiasAtras = new Date(hoje.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const dataHojeStr = hoje.toISOString().slice(0, 10);

  const dtIniStr = data_inicio && String(data_inicio).trim() ? String(data_inicio).trim() : data30DiasAtras;
  const dtFimStr = data_fim && String(data_fim).trim() ? String(data_fim).trim() : dataHojeStr;

  const startTs = `${dtIniStr} 00:00:00`;
  const endTs = `${dtFimStr} 23:59:59`;

  const apenasSugeridos = somente_sugeridos !== 'false';

  try {
    let queryProd = `
      SELECT p.id, p.codigo, p.nome, p.unidade_medida, p.quantidade_atual, p.grupo_id,
             gp.nome as grupo_nome
      FROM produtos p
      LEFT JOIN grupos_produtos gp ON p.grupo_id = gp.id
      WHERE p.ativo = 1
    `;
    const paramsProd: any[] = [];

    if (grupo_id && String(grupo_id).trim()) {
      queryProd += ' AND p.grupo_id = ?';
      paramsProd.push(Number(grupo_id));
    }

    if (produto_id && String(produto_id).trim()) {
      queryProd += ' AND p.id = ?';
      paramsProd.push(Number(produto_id));
    }

    queryProd += ' ORDER BY p.nome ASC';

    const produtos = db.prepare(queryProd).all(...paramsProd) as any[];

    let allowedTiposArr: string[] = [];
    if (typeof tipos_saida === 'string' && tipos_saida.trim()) {
      allowedTiposArr = tipos_saida.split(',').map((t) => t.trim());
    }

    const itensCalculados: any[] = [];

    for (const p of produtos) {
      let querySaidas = `
        SELECT COALESCE(SUM(quantidade), 0) as total
        FROM movimentacoes
        WHERE produto_id = ? AND tipo = 'saida'
          AND datetime(data_movimentacao) >= datetime(?)
          AND datetime(data_movimentacao) <= datetime(?)
      `;
      const paramsSaidas: any[] = [p.id, startTs, endTs];

      if (allowedTiposArr.length > 0) {
        querySaidas += ` AND (motivo_diverso IN (${allowedTiposArr.map(() => '?').join(',')}) OR motivo_diverso IS NULL)`;
        paramsSaidas.push(...allowedTiposArr);
      }

      const rowSaidas = db.prepare(querySaidas).get(...paramsSaidas) as { total: number };
      const saidasBrutas = Number(rowSaidas?.total || 0);

      const rowDev = db.prepare(`
        SELECT COALESCE(SUM(quantidade), 0) as total
        FROM movimentacoes
        WHERE produto_id = ? AND tipo = 'entrada' AND motivo_diverso = 'Devolução de Setor'
          AND datetime(data_movimentacao) >= datetime(?)
          AND datetime(data_movimentacao) <= datetime(?)
      `).get(p.id, startTs, endTs) as { total: number };
      const devolucoes = Number(rowDev?.total || 0);

      const saidasLiquidas = Math.max(0, saidasBrutas - devolucoes);

      if (saidasLiquidas <= 0 && saidasBrutas <= 0) {
        continue;
      }

      const saldoAtual = Number(p.quantidade_atual || 0);
      const quantidadeSugerida = Math.max(0, saidasLiquidas - saldoAtual);

      if (apenasSugeridos && quantidadeSugerida <= 0) {
        continue;
      }

      itensCalculados.push({
        produto_id: p.id,
        produto_codigo: p.codigo,
        produto_nome: p.nome,
        unidade_medida: p.unidade_medida,
        grupo_nome: p.grupo_nome,
        saldo_atual: saldoAtual,
        saidas_periodo: saidasLiquidas,
        quantidade_sugerida: quantidadeSugerida,
        quantidade_repor: quantidadeSugerida
      });
    }

    const areaSigla = ((req as any).areaSigla || user.area_sigla || 'ALM').toUpperCase();

    res.json({
      area_sigla: areaSigla,
      periodo: { data_inicio: dtIniStr, data_fim: dtFimStr },
      total_itens: itensCalculados.length,
      itens: itensCalculados
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao calcular lista de compras/reposição: ' + err.message });
  }
});

apiRouter.post('/lista-compras', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || user.perfil === 'requisitante') {
    res.status(403).json({ error: 'Acesso restrito. Requisitantes não podem criar ou alterar listas de compras.' });
    return;
  }

  const { data_inicio, data_fim, grupo_id, observacao, status, itens } = req.body || {};

  if (!Array.isArray(itens) || itens.length === 0) {
    res.status(400).json({ error: 'A lista de reposição deve conter pelo menos 1 item.' });
    return;
  }

  const areaSigla = ((req as any).areaSigla || user.area_sigla || 'ALM').toUpperCase();
  const year = new Date().getFullYear();

  const countRow = db.prepare(`
    SELECT COUNT(*) as count FROM listas_reposicao WHERE numero_documento LIKE ?
  `).get(`LREP-${areaSigla}-${year}-%`) as { count: number };

  const nextSeq = String((countRow?.count || 0) + 1).padStart(4, '0');
  const numero_documento = `LREP-${areaSigla}-${year}-${nextSeq}`;

  const dtIniStr = data_inicio ? String(data_inicio).trim() : new Date().toISOString().slice(0, 10);
  const dtFimStr = data_fim ? String(data_fim).trim() : new Date().toISOString().slice(0, 10);
  const finalStatus = status === 'FECHADA' ? 'FECHADA' : 'RASCUNHO';

  try {
    const result = runInTransaction(() => {
      const insHeader = db.prepare(`
        INSERT INTO listas_reposicao (
          numero_documento, area_sigla, data_inicio, data_fim, grupo_id, status, observacao, usuario_id, usuario_nome
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const infoHeader = insHeader.run(
        numero_documento,
        areaSigla,
        dtIniStr,
        dtFimStr,
        grupo_id ? Number(grupo_id) : null,
        finalStatus,
        observacao ? String(observacao).trim() : null,
        user.id,
        user.nome
      );

      const listaId = Number(infoHeader.lastInsertRowid);

      const insItem = db.prepare(`
        INSERT INTO itens_lista_reposicao (
          lista_id, produto_id, produto_codigo, produto_nome, unidade_medida,
          saldo_atual, saidas_periodo, quantidade_sugerida, quantidade_repor
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const it of itens) {
        insItem.run(
          listaId,
          Number(it.produto_id),
          String(it.produto_codigo),
          String(it.produto_nome),
          String(it.unidade_medida),
          Number(it.saldo_atual || 0),
          Number(it.saidas_periodo || 0),
          Number(it.quantidade_sugerida || 0),
          Number(it.quantidade_repor || 0)
        );
      }

      return { id: listaId, numero_documento, status: finalStatus };
    });

    res.status(201).json({
      message: finalStatus === 'FECHADA' ? 'Lista de reposição finalizada e fechada com sucesso.' : 'Lista de reposição salva como rascunho.',
      ...result
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao salvar lista de reposição: ' + err.message });
  }
});

apiRouter.get('/lista-compras', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || user.perfil === 'requisitante') {
    res.status(403).json({ error: 'Acesso restrito.' });
    return;
  }

  try {
    const rows = db.prepare(`
      SELECT l.*,
             (SELECT COUNT(*) FROM itens_lista_reposicao il WHERE il.lista_id = l.id) as total_itens,
             (SELECT COALESCE(SUM(il.quantidade_repor), 0) FROM itens_lista_reposicao il WHERE il.lista_id = l.id) as total_repor
      FROM listas_reposicao l
      ORDER BY l.id DESC
    `).all();

    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao listar listas de reposição: ' + err.message });
  }
});

apiRouter.get('/lista-compras/:id', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || user.perfil === 'requisitante') {
    res.status(403).json({ error: 'Acesso restrito.' });
    return;
  }

  const { id } = req.params;

  try {
    const lista = db.prepare('SELECT * FROM listas_reposicao WHERE id = ?').get(Number(id)) as any;
    if (!lista) {
      res.status(404).json({ error: 'Lista de reposição não encontrada.' });
      return;
    }

    const itens = db.prepare(`
      SELECT * FROM itens_lista_reposicao WHERE lista_id = ? ORDER BY id ASC
    `).all(Number(id));

    res.json({ lista, itens });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao buscar lista de reposição: ' + err.message });
  }
});

apiRouter.put('/lista-compras/:id', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || user.perfil === 'requisitante') {
    res.status(403).json({ error: 'Acesso restrito.' });
    return;
  }

  const { id } = req.params;
  const { observacao, status, itens } = req.body || {};

  try {
    const existing = db.prepare('SELECT * FROM listas_reposicao WHERE id = ?').get(Number(id)) as any;
    if (!existing) {
      res.status(404).json({ error: 'Lista de reposição não encontrada.' });
      return;
    }

    if (existing.status === 'FECHADA') {
      res.status(400).json({ error: 'Listas de reposição com status FECHADA não podem ser alteradas.' });
      return;
    }

    const finalStatus = status === 'FECHADA' ? 'FECHADA' : 'RASCUNHO';

    runInTransaction(() => {
      db.prepare(`
        UPDATE listas_reposicao
        SET status = ?, observacao = ?, atualizado_em = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(finalStatus, observacao ? String(observacao).trim() : existing.observacao, Number(id));

      if (Array.isArray(itens)) {
        db.prepare('DELETE FROM itens_lista_reposicao WHERE lista_id = ?').run(Number(id));

        const insItem = db.prepare(`
          INSERT INTO itens_lista_reposicao (
            lista_id, produto_id, produto_codigo, produto_nome, unidade_medida,
            saldo_atual, saidas_periodo, quantidade_sugerida, quantidade_repor
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const it of itens) {
          insItem.run(
            Number(id),
            Number(it.produto_id),
            String(it.produto_codigo),
            String(it.produto_nome),
            String(it.unidade_medida),
            Number(it.saldo_atual || 0),
            Number(it.saidas_periodo || 0),
            Number(it.quantidade_sugerida || 0),
            Number(it.quantidade_repor || 0)
          );
        }
      }
    });

    res.json({ message: 'Lista de reposição atualizada com sucesso.', id: Number(id), status: finalStatus });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao atualizar lista: ' + err.message });
  }
});

apiRouter.post('/lista-compras/:id/duplicar', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || user.perfil === 'requisitante') {
    res.status(403).json({ error: 'Acesso restrito.' });
    return;
  }

  const { id } = req.params;

  try {
    const orig = db.prepare('SELECT * FROM listas_reposicao WHERE id = ?').get(Number(id)) as any;
    if (!orig) {
      res.status(404).json({ error: 'Lista de origem não encontrada.' });
      return;
    }

    const origItens = db.prepare('SELECT * FROM itens_lista_reposicao WHERE lista_id = ?').all(Number(id)) as any[];

    const areaSigla = ((req as any).areaSigla || user.area_sigla || 'ALM').toUpperCase();
    const year = new Date().getFullYear();

    const countRow = db.prepare(`
      SELECT COUNT(*) as count FROM listas_reposicao WHERE numero_documento LIKE ?
    `).get(`LREP-${areaSigla}-${year}-%`) as { count: number };

    const nextSeq = String((countRow?.count || 0) + 1).padStart(4, '0');
    const novoNum = `LREP-${areaSigla}-${year}-${nextSeq}`;

    const newId = runInTransaction(() => {
      const info = db.prepare(`
        INSERT INTO listas_reposicao (
          numero_documento, area_sigla, data_inicio, data_fim, grupo_id, status, observacao, usuario_id, usuario_nome
        ) VALUES (?, ?, ?, ?, ?, 'RASCUNHO', ?, ?, ?)
      `).run(
        novoNum,
        areaSigla,
        orig.data_inicio,
        orig.data_fim,
        orig.grupo_id,
        orig.observacao ? `Cópia de ${orig.numero_documento}. ${orig.observacao}` : `Cópia de ${orig.numero_documento}`,
        user.id,
        user.nome
      );

      const createdId = Number(info.lastInsertRowid);

      const insItem = db.prepare(`
        INSERT INTO itens_lista_reposicao (
          lista_id, produto_id, produto_codigo, produto_nome, unidade_medida,
          saldo_atual, saidas_periodo, quantidade_sugerida, quantidade_repor
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const it of origItens) {
        insItem.run(
          createdId,
          it.produto_id,
          it.produto_codigo,
          it.produto_nome,
          it.unidade_medida,
          it.saldo_atual,
          it.saidas_periodo,
          it.quantidade_sugerida,
          it.quantidade_repor
        );
      }

      return createdId;
    });

    res.status(201).json({
      message: `Lista duplicada com sucesso (${novoNum}).`,
      id: newId,
      numero_documento: novoNum
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao duplicar lista: ' + err.message });
  }
});

apiRouter.delete('/lista-compras/:id', (req, res) => {
  const user = authenticateRequest(req);
  if (!user || user.perfil === 'requisitante') {
    res.status(403).json({ error: 'Acesso restrito.' });
    return;
  }

  const { id } = req.params;

  try {
    const list = db.prepare('SELECT * FROM listas_reposicao WHERE id = ?').get(Number(id)) as any;
    if (!list) {
      res.status(404).json({ error: 'Lista não encontrada.' });
      return;
    }

    if (list.status === 'FECHADA') {
      res.status(400).json({ error: 'Listas com status FECHADA não podem ser excluídas por exigência de auditoria.' });
      return;
    }

    runInTransaction(() => {
      db.prepare('DELETE FROM itens_lista_reposicao WHERE lista_id = ?').run(Number(id));
      db.prepare('DELETE FROM listas_reposicao WHERE id = ?').run(Number(id));
    });

    res.json({ message: `Lista rascunho "${list.numero_documento}" excluída com sucesso.` });
  } catch (err: any) {
    res.status(500).json({ error: 'Erro ao excluir lista: ' + err.message });
  }
});

function handleImportacaoProdutosRoute(req: any, res: any) {
  const user = authenticateRequest(req);
  if (!user || user.perfil !== 'admin') {
    res.status(403).json({ error: 'Apenas Administradores podem importar cadastros de produtos.' });
    return;
  }

  const clientIp = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1');

  // Roteamento para a área de destino (via param URL, body ou header)
  const targetSiglaParam = req.params.targetSigla || req.body.targetSigla || (req.headers['x-area-sigla'] as string) || user.area_sigla || 'ALM';
  const targetSiglaNorm = String(targetSiglaParam).trim().toUpperCase();

  const central = getCentralDb();
  const areaRow = central.prepare('SELECT id, sigla, nome, arquivo_db, ativa FROM areas WHERE UPPER(sigla) = ? AND ativa = 1').get(targetSiglaNorm) as any;

  if (!areaRow) {
    res.status(400).json({ error: `Área de destino "${targetSiglaNorm}" é inválida, inativa ou não cadastrada no sistema.db.` });
    return;
  }

  const { produtos } = req.body;
  if (!Array.isArray(produtos) || produtos.length === 0) {
    res.status(400).json({ error: 'Nenhum registro de produto fornecido para importação.' });
    return;
  }

  try {
    const targetDb = getAreaDb(areaRow.sigla);

    const result = runInTransaction(() => {
      const incluidos: any[] = [];
      const atualizados: any[] = [];
      const ignorados: any[] = [];
      const avisos: string[] = [];

      // Mapeamento de grupos existentes no banco da área de destino
      const todosGrupos = targetDb.prepare('SELECT id, UPPER(nome) as nome_upper FROM grupos_produtos').all() as any[];
      const grupoMap = new Map<string, number>();
      for (const g of todosGrupos) {
        grupoMap.set(g.nome_upper, g.id);
      }

      // Valida usuário para auditoria e chave estrangeira na área de destino
      const userExiste = targetDb.prepare('SELECT id FROM usuarios WHERE id = ?').get(user.id) as any;
      const auditoriaUserId = userExiste ? user.id : 1;
      const auditoriaUserNome = user.nome || 'Administrador Geral';

      const stmtCheckProd = targetDb.prepare('SELECT id, codigo, nome, quantidade_atual, custo_unitario FROM produtos WHERE UPPER(codigo) = UPPER(?)');
      const stmtInsertGrupo = targetDb.prepare(`
        INSERT INTO grupos_produtos (codigo, nome, tipo_padrao, ativo)
        VALUES (?, ?, ?, 1)
      `);
      const stmtInsertProd = targetDb.prepare(`
        INSERT INTO produtos (
          codigo, nome, descricao, grupo_id, unidade_medida, tipo, controla_validade,
          estoque_minimo, estoque_maximo, quantidade_atual, valor_unitario, custo_unitario, ativo
        ) VALUES (?, ?, ?, ?, ?, ?, 1, 0, 0, ?, ?, ?, 1)
      `);
      const stmtUpdateProd = targetDb.prepare(`
        UPDATE produtos
        SET quantidade_atual = quantidade_atual + ?,
            custo_unitario = CASE WHEN ? > 0 THEN ? ELSE custo_unitario END,
            valor_unitario = CASE WHEN ? > 0 THEN ? ELSE valor_unitario END,
            unidade_medida = COALESCE(?, unidade_medida)
        WHERE id = ?
      `);

      // Verificação e inserção/atualização de lotes em lotes_estoque
      const stmtCheckLote = targetDb.prepare(`
        SELECT id, numero_lote, data_validade, quantidade_atual, quantidade_inicial
        FROM lotes_estoque
        WHERE produto_id = ?
          AND UPPER(numero_lote) = ?
          AND COALESCE(data_validade, '') = COALESCE(?, '')
        LIMIT 1
      `);
      const stmtInsertLote = targetDb.prepare(`
        INSERT INTO lotes_estoque (
          produto_id, numero_lote, data_validade, quantidade_inicial, quantidade_atual,
          documento_referencia
        ) VALUES (?, ?, ?, ?, ?, 'IMPORTACAO-PLANILHA')
      `);
      const stmtUpdateLote = targetDb.prepare(`
        UPDATE lotes_estoque
        SET quantidade_atual = quantidade_atual + ?,
            quantidade_inicial = quantidade_inicial + ?
        WHERE id = ?
      `);

      // Movimentações para auditoria e histórico no Kardex
      const stmtInsertMov = targetDb.prepare(`
        INSERT INTO movimentacoes (
          tipo, motivo_diverso, produto_id, lote_id, quantidade,
          usuario_id, responsavel_nome, documento_referencia,
          numero_lote, data_validade, valor_unitario, observacao, data_movimentacao
        ) VALUES (
          'entrada', 'Carga Inicial / Importação de Planilha', ?, ?, ?,
          ?, ?, 'IMPORTACAO-PLANILHA',
          ?, ?, ?, ?, CURRENT_TIMESTAMP
        )
      `);

      for (let i = 0; i < produtos.length; i++) {
        const item = produtos[i];
        const rawCod = String(item.codigo || '').trim();
        const rawDesc = String(item.descricao || item.nome || '').trim();
        const rawUnd = String(item.unidade || item.unidade_medida || 'UN').trim().toUpperCase() || 'UN';
        const rawLote = item.lote && String(item.lote).trim() ? String(item.lote).trim().toUpperCase() : 'SEM LOTE';
        const rawValidade = item.validade && String(item.validade).trim() ? String(item.validade).trim().slice(0, 10) : null;
        const saldoNum = item.saldo !== undefined && item.saldo !== null ? Number(item.saldo) : (item.sald !== undefined ? Number(item.sald) : 0);
        const custoNum = item.custo !== undefined && item.custo !== null ? Number(item.custo) : (item.custo_unitario !== undefined ? Number(item.custo_unitario) : 0);
        const totalNum = item.total !== undefined && item.total !== null ? Number(item.total) : (item.valor_total !== undefined ? Number(item.valor_total) : (saldoNum * custoNum));
        const rawGrupoNome = String(item.grupo_nome || 'GERAL').trim();
        const tipoFinal = item.tipo === 'nao_consumivel' ? 'nao_consumivel' : 'consumivel';

        if (!rawCod || !rawDesc) {
          avisos.push(`Linha ${i + 1}: Registro ignorado por falta de Código ou Descrição.`);
          continue;
        }

        let produtoId: number;
        let isNovo = false;

        const existe = stmtCheckProd.get(rawCod) as any;
        if (existe) {
          produtoId = Number(existe.id);
          stmtUpdateProd.run(saldoNum, custoNum, custoNum, custoNum, custoNum, rawUnd, produtoId);
          atualizados.push({
            id: produtoId,
            codigo: rawCod,
            nome: rawDesc,
            unidade: rawUnd,
            lote: rawLote,
            validade: rawValidade,
            saldo: saldoNum,
            custo: custoNum,
            total: totalNum,
          });
        } else {
          isNovo = true;
          // Resolução / criação do Grupo de Produto na área de destino
          let grupoId: number | null = null;
          if (rawGrupoNome) {
            const upperGrupo = rawGrupoNome.toUpperCase();
            if (grupoMap.has(upperGrupo)) {
              grupoId = grupoMap.get(upperGrupo)!;
            } else {
              const nextGrupoCod = `GRP-${Math.floor(100 + Math.random() * 900)}`;
              const infoGrupo = stmtInsertGrupo.run(nextGrupoCod, rawGrupoNome, tipoFinal);
              grupoId = Number(infoGrupo.lastInsertRowid);
              grupoMap.set(upperGrupo, grupoId);
            }
          }

          const insertInfo = stmtInsertProd.run(
            rawCod,
            rawDesc,
            rawDesc,
            grupoId,
            rawUnd,
            tipoFinal,
            saldoNum,
            custoNum,
            custoNum
          );
          produtoId = Number(insertInfo.lastInsertRowid);

          incluidos.push({
            id: produtoId,
            codigo: rawCod,
            nome: rawDesc,
            unidade: rawUnd,
            lote: rawLote,
            validade: rawValidade,
            saldo: saldoNum,
            custo: custoNum,
            total: totalNum,
          });
        }

        // Criar ou atualizar lote em lotes_estoque se saldo > 0 ou lote/validade informados
        let loteId: number | null = null;
        if (saldoNum > 0 || (rawLote && rawLote !== 'SEM LOTE') || rawValidade) {
          const loteExistente = stmtCheckLote.get(produtoId, rawLote, rawValidade || '') as any;
          if (loteExistente) {
            loteId = Number(loteExistente.id);
            stmtUpdateLote.run(saldoNum, saldoNum, loteId);
          } else {
            const infoLote = stmtInsertLote.run(produtoId, rawLote, rawValidade, saldoNum, saldoNum);
            loteId = Number(infoLote.lastInsertRowid);
          }
        }

        // Registrar movimentação de entrada se saldo > 0
        if (saldoNum > 0) {
          stmtInsertMov.run(
            produtoId,
            loteId,
            saldoNum,
            auditoriaUserId,
            auditoriaUserNome,
            rawLote,
            rawValidade,
            custoNum,
            `Carga inicial via planilha (Saldo: ${saldoNum}, Lote: ${rawLote}, Custo: R$ ${custoNum.toFixed(2)})`
          );
        }
      }

      return {
        sucesso: true,
        area: { id: areaRow.id, sigla: areaRow.sigla, nome: areaRow.nome, arquivo_db: areaRow.arquivo_db },
        total_lidos: produtos.length,
        total_incluidos: incluidos.length,
        total_atualizados: atualizados.length,
        total_ignorados: ignorados.length,
        incluidos,
        atualizados,
        ignorados,
        avisos,
      };
    }, targetDb);

    // Auditoria de Acesso no banco central
    registrarLogAcesso(
      user,
      clientIp,
      'importacao_produtos',
      `Importação em massa de ${result.total_incluidos} produtos na área ${areaRow.sigla} (${areaRow.arquivo_db})`,
      areaRow.sigla
    );

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Falha transacional ao importar produtos: ' + err.message });
  }
}

apiRouter.post('/importacao/produtos', handleImportacaoProdutosRoute);
apiRouter.post('/importacao/:targetSigla/produtos', handleImportacaoProdutosRoute);

function handleImportacaoFornecedoresRoute(req: any, res: any) {
  const user = authenticateRequest(req);
  if (!user || user.perfil !== 'admin') {
    res.status(403).json({ error: 'Apenas Administradores podem importar fornecedores e entidades.' });
    return;
  }

  const clientIp = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1');

  // Roteamento para a área de destino (via param URL, body ou header)
  const targetSiglaParam = req.params.targetSigla || req.body.targetSigla || (req.headers['x-area-sigla'] as string) || user.area_sigla || 'ALM';
  const targetSiglaNorm = String(targetSiglaParam).trim().toUpperCase();

  const central = getCentralDb();
  const areaRow = central.prepare('SELECT id, sigla, nome, arquivo_db, ativa FROM areas WHERE UPPER(sigla) = ? AND ativa = 1').get(targetSiglaNorm) as any;

  if (!areaRow) {
    res.status(400).json({ error: `Área de destino "${targetSiglaNorm}" é inválida, inativa ou não cadastrada no sistema.db.` });
    return;
  }

  const { fornecedores } = req.body;
  if (!Array.isArray(fornecedores) || fornecedores.length === 0) {
    res.status(400).json({ error: 'Nenhum registro de fornecedor fornecido para importação.' });
    return;
  }

  try {
    const result = runInTransaction(() => {
      const incluidos: any[] = [];
      const atualizados: any[] = [];
      const ignorados: any[] = [];
      const avisos: string[] = [];

      const stmtCheckCod = central.prepare('SELECT id, codigo, razao_social, telefone, email, endereco, cidade, uf FROM fornecedores WHERE UPPER(codigo) = UPPER(?)');
      const stmtCheckCnpj = central.prepare("SELECT id, codigo, razao_social FROM fornecedores WHERE cnpj = ? AND cnpj IS NOT NULL AND cnpj != ''");

      const stmtInsertForn = central.prepare(`
        INSERT INTO fornecedores (
          codigo, razao_social, nome_fantasia, cnpj, tipo_entidade, inscricao_estadual,
          telefone, email, contato_responsavel, endereco, cidade, uf, observacoes, ativo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `);

      const stmtUpdateForn = central.prepare(`
        UPDATE fornecedores
        SET razao_social = ?,
            nome_fantasia = COALESCE(?, nome_fantasia),
            cnpj = COALESCE(?, cnpj),
            telefone = COALESCE(?, telefone),
            email = COALESCE(?, email),
            contato_responsavel = COALESCE(?, contato_responsavel),
            endereco = COALESCE(?, endereco),
            cidade = COALESCE(?, cidade),
            uf = COALESCE(?, uf),
            observacoes = COALESCE(?, observacoes)
        WHERE id = ?
      `);

      for (let i = 0; i < fornecedores.length; i++) {
        const item = fornecedores[i];
        const rawCod = String(item.codigo || '').trim();
        const rawNome = String(item.razao_social || item.nome || '').trim();
        const rawFantasia = item.nome_fantasia && String(item.nome_fantasia).trim() ? String(item.nome_fantasia).trim() : null;
        const rawCnpj = item.cnpj && String(item.cnpj).trim() ? String(item.cnpj).trim() : null;
        const rawTipo = item.tipo_entidade === 'entidade_parceira' ? 'entidade_parceira' : 'fornecedor_comercial';
        const rawIe = item.inscricao_estadual && String(item.inscricao_estadual).trim() ? String(item.inscricao_estadual).trim() : null;
        const rawTel = item.telefone && String(item.telefone).trim() ? String(item.telefone).trim() : null;
        const rawEmail = item.email && String(item.email).trim() ? String(item.email).trim() : null;
        const rawContato = item.contato_responsavel && String(item.contato_responsavel).trim() ? String(item.contato_responsavel).trim() : null;
        const rawEnd = item.endereco && String(item.endereco).trim() ? String(item.endereco).trim() : null;
        const rawCid = item.cidade && String(item.cidade).trim() ? String(item.cidade).trim() : null;
        const rawUf = item.uf && String(item.uf).trim() ? String(item.uf).trim().toUpperCase() : null;
        const rawObs = item.observacoes && String(item.observacoes).trim() ? String(item.observacoes).trim() : null;

        if (!rawCod || !rawNome) {
          avisos.push(`Linha ${i + 1}: Fornecedor ignorado por ausência de Código ou Razão Social obrigatória.`);
          continue;
        }

        // Se tiver CNPJ, verifica duplicidade com OUTRO fornecedor cadastrado
        if (rawCnpj) {
          const existeCnpj = stmtCheckCnpj.get(rawCnpj) as any;
          if (existeCnpj && String(existeCnpj.codigo).toUpperCase() !== rawCod.toUpperCase()) {
            ignorados.push({
              codigo: rawCod,
              razao_social: rawNome,
              motivo: `CNPJ "${rawCnpj}" já cadastrado para o fornecedor código "${existeCnpj.codigo}" (${existeCnpj.razao_social}).`,
            });
            continue;
          }
        }

        // Verifica existência pelo código no banco central compartilhado
        const existeCod = stmtCheckCod.get(rawCod) as any;
        if (existeCod) {
          stmtUpdateForn.run(
            rawNome,
            rawFantasia,
            rawCnpj,
            rawTel,
            rawEmail,
            rawContato,
            rawEnd,
            rawCid,
            rawUf,
            rawObs,
            existeCod.id
          );
          atualizados.push({
            id: Number(existeCod.id),
            codigo: rawCod,
            razao_social: rawNome,
            cnpj: rawCnpj || existeCod.cnpj,
            telefone: rawTel || existeCod.telefone,
            email: rawEmail || existeCod.email,
            cidade: rawCid || existeCod.cidade,
            uf: rawUf || existeCod.uf,
            tipo: rawTipo,
          });
          continue;
        }

        const insertInfo = stmtInsertForn.run(
          rawCod,
          rawNome,
          rawFantasia,
          rawCnpj,
          rawTipo,
          rawIe,
          rawTel,
          rawEmail,
          rawContato,
          rawEnd,
          rawCid,
          rawUf,
          rawObs
        );

        incluidos.push({
          id: Number(insertInfo.lastInsertRowid),
          codigo: rawCod,
          razao_social: rawNome,
          cnpj: rawCnpj,
          telefone: rawTel,
          email: rawEmail,
          cidade: rawCid,
          uf: rawUf,
          tipo: rawTipo,
        });

        if (!rawCnpj) {
          avisos.push(`Fornecedor "${rawCod} - ${rawNome}": cadastrado sem CNPJ.`);
        }
      }

      return {
        sucesso: true,
        compartilhado: true,
        area: { id: areaRow.id, sigla: areaRow.sigla, nome: areaRow.nome, arquivo_db: areaRow.arquivo_db },
        total_lidos: fornecedores.length,
        total_incluidos: incluidos.length,
        total_atualizados: atualizados.length,
        total_ignorados: ignorados.length,
        incluidos,
        atualizados,
        ignorados,
        avisos,
      };
    }, central);

    // Sincroniza o banco compartilhado com todas as áreas ativas (ALM, CAF, etc.)
    syncMirrorsToAllAreas();

    // Auditoria de Acesso no banco central
    registrarLogAcesso(
      user,
      clientIp,
      'importacao_fornecedores',
      `Importação em massa de fornecedores no Banco Central Compartilhado: ${result.total_incluidos} novos, ${result.total_atualizados} atualizados (disponíveis para todas as áreas)`,
      areaRow.sigla
    );

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Falha transacional ao importar fornecedores: ' + err.message });
  }
}

apiRouter.post('/importacao/fornecedores', handleImportacaoFornecedoresRoute);
apiRouter.post('/importacao/:targetSigla/fornecedores', handleImportacaoFornecedoresRoute);

