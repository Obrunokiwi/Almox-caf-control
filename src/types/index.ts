export type PerfilUsuario = 'admin' | 'ti_dpo' | 'almoxarife' | 'requisitante';
export type TipoProduto = 'consumivel' | 'nao_consumivel';
export type TipoArea = 'almoxarifado' | 'farmacia';
export type UnidadeMedida = 
  | 'UN' 
  | 'UI' 
  | 'RO' 
  | 'PC' 
  | 'BOBINA' 
  | 'MT' 
  | 'CA' 
  | 'RESMA' 
  | 'GL' 
  | 'FR' 
  | 'LT' 
  | 'PCT' 
  | 'KIT' 
  | 'BIS' 
  | 'CT' 
  | 'CX' 
  | 'KG' 
  | 'L' 
  | 'AMP' 
  | 'ROLO' 
  | string;

export interface GrupoProduto {
  id: number;
  codigo?: string | null;
  nome: string;
  tipo_padrao: TipoProduto;
  area_id_sugerida?: number | null;
  ativo: number;
  total_produtos?: number;
  total_subgrupos?: number;
}

export interface SubgrupoProduto {
  id: number;
  grupo_id?: number | null;
  grupo_nome?: string | null;
  codigo?: string | null;
  nome: string;
  ativo: number;
  total_produtos?: number;
}
export type StatusRequisicao = 'pendente' | 'aprovada_atendida' | 'rejeitada' | 'cancelada';
export type PrioridadeRequisicao = 'normal' | 'urgente';
export type StatusEmprestimo = 'emprestado' | 'devolvido' | 'atrasado';
export type TipoMovimentacao = 'entrada' | 'saida' | 'estorno_entrada' | 'estorno_saida';
export type TipoEntidadeFornecedor = 'fornecedor_comercial' | 'entidade_parceira';
export type TipoEmprestimoInstitucional = 'recebido' | 'concedido';
export type StatusEmprestimoInstitucional = 'pendente_devolucao' | 'quitado';

export type MotivoSaidaDiversa =
  | 'Quebra'
  | 'Saída por Vencimento/Descarte'
  | 'Vencimento/Descarte'
  | 'Avaria/Quebra'
  | 'Perda/Extravio'
  | 'Ajuste de Inventário (-)'
  | 'Doação/Empréstimo Concedido'
  | 'Empréstimo Concedido a Terceiros'
  | 'Devolução de Empréstimo a Terceiros'
  | 'Consumo';

export type MotivoEntradaDiversa =
  | 'Devolução de Setor'
  | 'Ajuste de Inventário (+)'
  | 'Doação Recebida'
  | 'Devolução de Empréstimo entre Entidades'
  | 'Entrada por Empréstimo Recebido'
  | 'Recebimento de Devolução de Empréstimo';

export interface Area {
  id: number;
  sigla: string; // 'ALM', 'CAF'
  nome: string; // 'Almoxarifado', 'CAF'
  arquivo_db: string; // 'almoxarifado.db', 'caf.db'
  descricao?: string | null;
  ativa: number;
  criada_em: string;
  total_produtos?: number;
  total_movimentacoes?: number;
}

export interface EmpresaUnidade {
  id: number;
  codigo: string;
  nome: string;
  cnpj?: string | null;
  endereco?: string | null;
  cidade?: string | null;
  uf?: string | null;
  ativo: number;
  criado_em: string;
}

export interface CentroCusto {
  id: number;
  codigo: string;
  nome: string;
  departamento: string;
  responsavel: string;
  empresa_id?: number | null;
  empresa_nome?: string;
  ativo: number;
  criado_em: string;
}

export interface Usuario {
  id: number;
  codigo?: string | null;
  nome: string;
  login: string;
  cpf?: string | null;
  email?: string | null;
  perfil: PerfilUsuario;
  centro_custo_id: number | null;
  centro_custo_nome?: string;
  centro_custo_codigo?: string;
  empresa_id?: number | null;
  empresa_nome?: string;
  ativo: number;
  criado_em: string;
  ultimo_acesso?: string | null;
  permissoes?: string[];
  cargo_nome?: string | null;
  usando_senha_padrao?: boolean;
  modulos?: string[];
  areas_liberadas?: Area[];
  area_ids?: number[];
  area_id?: number;
  area_sigla?: string;
  area_nome?: string;
  area_ativa?: Area;
}

export type ModuloChave =
  | 'fornecedores'
  | 'produtos'
  | 'saldo-estoque'
  | 'entradas'
  | 'movimentacoes'
  | 'inventario'
  | 'consumo'
  | 'emprestimos'
  | 'requisicoes'
  | 'aprovacao-requisicoes'
  | 'centros-custo'
  | 'usuarios'
  | 'areas'
  | 'relatorios'
  | 'relatorios-outras-areas'
  | 'perfil'
  | 'importacao-cadastros'
  | 'backup';

export interface ModuloInfo {
  chave: ModuloChave;
  nome: string;
  descricao: string;
  categoria?: 'operacional' | 'gestao' | 'sistema';
}

export const MODULOS_SISTEMA: ModuloInfo[] = [
  { chave: 'fornecedores', nome: 'Fornecedores / Entidades', descricao: 'Cadastro próprio de fornecedores comerciais e parceiros da área', categoria: 'operacional' },
  { chave: 'produtos', nome: 'Produtos', descricao: 'Catálogo próprio de materiais, insumos ou medicamentos da área', categoria: 'operacional' },
  { chave: 'saldo-estoque', nome: 'Consulta de Saldo', descricao: 'Painel visual de saldos físicos da área ativa por setor e lote', categoria: 'operacional' },
  { chave: 'entradas', nome: 'Entrada por Nota', descricao: 'Recebimento de materiais com rastreabilidade de NF e lotes da área', categoria: 'operacional' },
  { chave: 'movimentacoes', nome: 'Movimentações Diversas', descricao: 'Ajustes, quebras, perdas, descartes e devoluções de setor na área', categoria: 'operacional' },
  { chave: 'inventario', nome: 'Inventário', descricao: 'Auditoria de contagem física e conciliação direta de saldos da área', categoria: 'operacional' },
  { chave: 'consumo', nome: 'Consumo', descricao: 'Entrega direta a setores sem requisição prévia com baixa de estoque', categoria: 'operacional' },
  { chave: 'emprestimos', nome: 'Empréstimos', descricao: 'Controle de empréstimos com entidades parceiras externas', categoria: 'operacional' },
  { chave: 'requisicoes', nome: 'Requisição', descricao: 'Solicitação de itens pelos centros de custo na área ativa', categoria: 'operacional' },
  { chave: 'aprovacao-requisicoes', nome: 'Aprovação de Requisições', descricao: 'Análise técnica, triagem e liberação de itens pela equipe da área', categoria: 'gestao' },
  { chave: 'centros-custo', nome: 'Centros de Custo', descricao: 'Estrutura compartilhada de setores, enfermarias e unidades assistenciais', categoria: 'gestao' },
  { chave: 'usuarios', nome: 'Usuário', descricao: 'Controle central de acessos, senhas, áreas liberadas e permissões', categoria: 'sistema' },
  { chave: 'areas', nome: 'Áreas', descricao: 'Gestão de áreas independentes do sistema (Almoxarifado, CAF e novas áreas)', categoria: 'sistema' },
  { chave: 'relatorios', nome: 'Relatórios', descricao: 'Relatórios operacionais e consumo por centro de custo da área ativa', categoria: 'gestao' },
  { chave: 'relatorios-outras-areas', nome: 'Relatórios de Outras Áreas', descricao: 'Consulta e exportação somente leitura de relatórios de outras áreas autorizadas', categoria: 'gestao' },
  { chave: 'perfil', nome: 'Perfil', descricao: 'Dados cadastrais da conta e preferências', categoria: 'sistema' },
  { chave: 'importacao-cadastros', nome: 'Importação de Cadastros', descricao: 'Carga em massa de itens e parceiros no catálogo da área ativa', categoria: 'sistema' },
  { chave: 'backup', nome: 'Backup / Exportar', descricao: 'Geração e download de cópias por área ou banco central', categoria: 'sistema' },
];

export const MODULOS_PADRAO_PERFIL: Record<PerfilUsuario, ModuloChave[]> = {
  admin: [
    'fornecedores', 'produtos', 'saldo-estoque', 'entradas', 'movimentacoes',
    'inventario', 'consumo', 'emprestimos', 'requisicoes', 'aprovacao-requisicoes',
    'centros-custo', 'usuarios', 'areas', 'relatorios', 'relatorios-outras-areas', 'perfil', 'importacao-cadastros', 'backup'
  ],
  ti_dpo: [
    'fornecedores', 'produtos', 'saldo-estoque', 'entradas', 'movimentacoes',
    'inventario', 'consumo', 'emprestimos', 'requisicoes', 'aprovacao-requisicoes',
    'centros-custo', 'usuarios', 'areas', 'relatorios', 'relatorios-outras-areas', 'perfil', 'importacao-cadastros', 'backup'
  ],
  almoxarife: [
    'fornecedores', 'produtos', 'saldo-estoque', 'entradas', 'movimentacoes',
    'inventario', 'consumo', 'emprestimos', 'requisicoes', 'aprovacao-requisicoes',
    'relatorios', 'relatorios-outras-areas', 'perfil'
  ],
  requisitante: [
    'requisicoes', 'perfil'
  ],
};

export interface LogAcesso {
  id: number;
  usuario_id?: number | null;
  login: string;
  nome?: string | null;
  perfil?: string | null;
  ip?: string | null;
  acao: string;
  detalhes?: string | null;
  data_hora: string;
}

export interface ProdutoFornecedor {
  id: number;
  produto_id: number;
  fornecedor_id: number;
  fornecedor_codigo?: string;
  fornecedor_razao_social?: string;
  fornecedor_nome_fantasia?: string | null;
  fornecedor_cnpj?: string | null;
  marca?: string | null;
  nomenclatura_fornecedor?: string | null;
  codigo_referencia_fornecedor?: string | null;
  ultimo_valor_unitario?: number | null;
  ultima_compra?: string | null;
  criado_em?: string;
}

export interface Fornecedor {
  id: number;
  codigo: string;
  razao_social: string;
  nome_fantasia?: string | null;
  cnpj?: string | null;
  tipo_entidade?: TipoEntidadeFornecedor;
  inscricao_estadual?: string | null;
  telefone?: string | null;
  email?: string | null;
  contato_responsavel?: string | null;
  endereco?: string | null;
  cidade?: string | null;
  uf?: string | null;
  observacoes?: string | null;
  ativo: number;
  criado_em: string;
  total_produtos_vinculados?: number;
  total_entradas?: number;
}

export interface LoteEstoque {
  id: number;
  produto_id: number;
  area_id?: number;
  area_nome?: string;
  produto_codigo?: string;
  produto_nome?: string;
  unidade_medida?: string;
  numero_lote: string;
  data_validade?: string | null;
  quantidade_inicial?: number;
  quantidade_atual: number;
  fornecedor_id?: number | null;
  fornecedor_nome?: string | null;
  documento_referencia?: string | null;
  marca?: string | null;
  nomenclatura_fornecedor?: string | null;
  criado_em?: string;
  dias_para_vencer?: number | null;
  status_validade?: 'vencido' | 'critico_30d' | 'alerta_60d' | 'atencao_90d' | 'regular' | 'sem_validade';
}

export interface Produto {
  id: number;
  codigo: string;
  nome: string;
  descricao?: string | null;
  area_id: number; // 1 = Almoxarifado, 2 = Farmácia
  area_codigo?: string;
  area_nome?: string;
  grupo_id?: number | null;
  grupo_codigo?: string | null;
  grupo_nome?: string | null;
  subgrupo_id?: number | null;
  subgrupo_codigo?: string | null;
  subgrupo_nome?: string | null;
  unidade_medida: UnidadeMedida;
  tipo: TipoProduto;
  controla_validade?: number;
  estoque_minimo: number;
  estoque_maximo: number;
  quantidade_atual: number;
  quantidade_bloqueada_vencida?: number;
  quantidade_disponivel_valida?: number;
  valor_unitario?: number | null;
  custo_unitario?: number | null;
  localizacao?: string | null;
  ativo: number;
  criado_em: string;
  fornecedores_vinculados?: ProdutoFornecedor[];
  lotes?: LoteEstoque[];
}

export type StatusItemRequisicao = 'pendente' | 'aprovado' | 'negado';

export type AcaoHistoricoRequisicao =
  | 'criacao_requisicao'
  | 'inclusao_item'
  | 'aprovacao_item'
  | 'negacao_item'
  | 'aprovacao_total'
  | 'aprovacao_parcial'
  | 'rejeicao_total'
  | 'cancelamento'
  | 'alteracao_prioridade'
  | 'devolucao_setor';

export interface LoteDispensado {
  lote_id: number;
  numero_lote: string;
  data_validade?: string | null;
  quantidade: number;
}

export interface ItemRequisicao {
  id: number;
  requisicao_id: number;
  produto_id: number;
  lote_id?: number | null;
  numero_lote?: string | null;
  data_validade?: string | null;
  quantidade_solicitada: number;
  quantidade_atendida: number;
  status_item?: StatusItemRequisicao;
  analisado_por_id?: number | null;
  analisado_por_nome?: string | null;
  analisado_por_login?: string | null;
  analisado_por_perfil?: PerfilUsuario | null;
  data_analise?: string | null;
  motivo_decisao?: string | null;
  produto_codigo?: string;
  produto_nome?: string;
  unidade_medida?: string;
  tipo?: string;
  saldo_atual_estoque?: number;
  valor_unitario?: number;
  lotes_atendidos?: LoteDispensado[];
  lotes_disponiveis?: LoteEstoque[];
}

export interface HistoricoRequisicao {
  id: number;
  requisicao_id: number;
  item_requisicao_id?: number | null;
  produto_id?: number | null;
  produto_codigo?: string | null;
  produto_nome?: string | null;
  unidade_medida?: string | null;
  usuario_id: number;
  usuario_nome: string;
  usuario_login: string;
  usuario_perfil: PerfilUsuario;
  acao: AcaoHistoricoRequisicao;
  status_anterior?: string | null;
  status_novo?: string | null;
  quantidade_solicitada?: number | null;
  quantidade_atendida?: number | null;
  detalhes: string;
  justificativa?: string | null;
  data_registro: string;
}

export interface Requisicao {
  id: number;
  numero_requisicao: string;
  area_id: number; // 1 = Almoxarifado, 2 = Farmácia
  area_codigo?: string;
  area_nome?: string;
  centro_custo_id: number;
  solicitante_id: number;
  almoxarife_id: number | null;
  data_solicitacao: string;
  data_atendimento: string | null;
  status: StatusRequisicao;
  prioridade?: PrioridadeRequisicao;
  motivo_rejeicao: string | null;
  observacao: string | null;
  centro_custo_codigo?: string;
  centro_custo_nome?: string;
  centro_custo_depto?: string;
  solicitante_nome?: string;
  solicitante_login?: string;
  almoxarife_nome?: string | null;
  total_itens?: number;
  itens_aprovados?: number;
  itens_negados?: number;
  total_eventos_historico?: number;
  itens?: ItemRequisicao[];
  historico?: HistoricoRequisicao[];
}

export interface ItemConsumo {
  id?: number;
  consumo_id?: number;
  produto_id: number;
  produto_codigo?: string;
  produto_nome?: string;
  unidade_medida?: string;
  lote_id: number;
  numero_lote: string;
  data_validade?: string | null;
  quantidade: number;
  custo_unitario?: number;
  valor_total?: number;
}

export interface Consumo {
  id: number;
  numero_consumo: string; // Ex: CONS-ALM-2026-0001 ou CONS-FAR-2026-0001
  area_id: number;
  area_codigo?: string;
  area_nome?: string;
  centro_custo_id: number;
  centro_custo_nome?: string;
  centro_custo_codigo?: string;
  responsavel_recebimento: string;
  usuario_id: number;
  usuario_nome?: string;
  observacao?: string | null;
  data_consumo: string;
  criado_em: string;
  total_itens?: number;
  valor_total?: number;
  itens?: ItemConsumo[];
}

export interface Emprestimo {
  id: number;
  codigo_emprestimo?: string;
  produto_id: number;
  quantidade: number;
  centro_custo_id: number;
  solicitante_id: number;
  almoxarife_liberacao_id: number;
  almoxarife_recebimento_id?: number | null;
  data_emprestimo: string;
  data_prevista_devolucao: string;
  data_devolucao?: string | null;
  status: StatusEmprestimo;
  condicao_saida?: string | null;
  condicao_devolucao?: string | null;
  observacao: string | null;
  produto_codigo?: string;
  produto_nome?: string;
  unidade_medida?: string;
  centro_custo_codigo?: string;
  centro_custo_nome?: string;
  solicitante_nome?: string;
  almoxarife_liberacao_nome?: string;
  almoxarife_recebimento_nome?: string | null;
}

export interface ItemEmprestimoInstitucional {
  id: number;
  emprestimo_id: number;
  produto_id: number;
  produto_codigo?: string;
  produto_nome?: string;
  unidade_medida?: string;
  lote_id?: number | null;
  numero_lote?: string | null;
  data_validade?: string | null;
  quantidade: number;
  quantidade_devolvida: number;
}

export interface EmprestimoInstitucional {
  id: number;
  numero_documento: string;
  area_id?: number;
  tipo: TipoEmprestimoInstitucional; // 'recebido' | 'concedido'
  entidade_id: number;
  entidade_codigo?: string;
  entidade_nome?: string;
  entidade_nome_fantasia?: string | null;
  entidade_cnpj?: string | null;
  entidade_tipo?: TipoEntidadeFornecedor;
  data_operacao: string;
  data_prevista_devolucao?: string | null;
  data_quitacao?: string | null;
  status: StatusEmprestimoInstitucional; // 'pendente_devolucao' | 'quitado'
  responsavel_almoxarifado_id: number;
  responsavel_almoxarifado_nome?: string;
  responsavel_entidade_nome?: string | null;
  observacao?: string | null;
  itens?: ItemEmprestimoInstitucional[];
}

export interface Movimentacao {
  id: number;
  tipo: TipoMovimentacao;
  motivo_diverso?: string | null;
  area_id?: number;
  produto_id: number;
  lote_id?: number | null;
  quantidade: number;
  centro_custo_id: number | null;
  fornecedor_id?: number | null;
  emprestimo_institucional_id?: number | null;
  requisicao_id?: number | null;
  consumo_id?: number | null;
  usuario_id: number;
  responsavel_nome?: string | null;
  documento_referencia: string | null;
  numero_lote?: string | null;
  data_validade?: string | null;
  valor_unitario?: number | null;
  marca?: string | null;
  nomenclatura_fornecedor?: string | null;
  observacao: string | null;
  data_movimentacao: string;
  produto_codigo?: string;
  produto_nome?: string;
  unidade_medida?: string;
  produto_tipo?: string;
  centro_custo_codigo?: string;
  centro_custo_nome?: string;
  fornecedor_codigo?: string | null;
  fornecedor_nome?: string | null;
  fornecedor_cnpj?: string | null;
  fornecedor_tipo?: string | null;
  usuario_nome?: string;
  usuario_perfil?: string;
}

export interface DashboardStats {
  kpis: {
    itens_estoque_baixo: number;
    requisicoes_pendentes: number;
    emprestimos_ativos: number;
    emprestimos_atrasados: number;
    emprestimos_institucionais_pendentes?: number;
    lotes_vencidos?: number;
    lotes_critico_30d?: number;
    lotes_alerta_60d?: number;
    lotes_atencao_90d?: number;
    total_produtos: number;
    total_requisicoes_mes?: number;
    total_valor_estoque?: number;
  };
  consumo_centros_custo: Array<{
    id: number;
    codigo: string;
    nome: string;
    total_movimentacoes: number;
    total_unidades: number;
  }>;
  produtos_criticos: Produto[];
  lotes_alerta_validade?: LoteEstoque[];
  ultimas_movimentacoes: Movimentacao[];
}

export interface RelatorioFiltros {
  tipo_relatorio: string;
  data_inicio?: string;
  data_fim?: string;
  centro_custo_id?: number;
  produto_id?: number;
  status?: string;
  tipo_produto?: string;
}

export interface ItemInventario {
  id?: number;
  inventario_id?: number;
  produto_id: number;
  lote_id?: number | null;
  numero_lote?: string | null;
  data_validade?: string | null;
  quantidade_sistema: number;
  quantidade_fisica: number;
  diferenca: number;
  // Campos visuais enriquecidos
  produto_codigo?: string;
  produto_nome?: string;
  unidade_medida?: string;
  produto_tipo?: string;
  grupo_id?: number | null;
  grupo_nome?: string | null;
}

export interface InventarioEstoque {
  id: number;
  codigo: string;
  data: string;
  hora: string;
  empresa_id?: number | null;
  empresa_codigo?: string;
  empresa_nome?: string;
  centro_custo_id: number;
  centro_custo_codigo?: string;
  centro_custo_nome?: string;
  zera_por_lote: number;
  zera_nao_listados: number;
  observacao?: string | null;
  finalizado: number; // 0 = NÃO, 1 = SIM
  usuario_id: number;
  usuario_nome?: string;
  criado_em: string;
  itens?: ItemInventario[];
  total_itens?: number;
}

export type SituacaoNotaFiscal = 'ABERTA' | 'FECHADA';

export interface NotaFiscalItem {
  id?: number;
  movimentacao_id?: number;
  produto_id: number;
  produto_codigo: string;
  produto_nome: string;
  unidade_medida: string;
  numero_lote?: string | null;
  data_validade?: string | null;
  quantidade: number;
  marca?: string | null;
  nomenclatura_fornecedor?: string | null;
  valor_unitario?: number | null;
  lote_id?: number | null;
  saldo_atual_lote?: number;
  consumido_lote?: number;
}

export interface HistoricoNotaFiscal {
  id: number;
  nota_fiscal_id: number;
  usuario_id: number;
  usuario_nome?: string;
  acao: string;
  detalhes: string;
  data_registro: string;
}

export interface NotaFiscal {
  id: number;
  numero_documento: string;
  fornecedor_id?: number | null;
  fornecedor_nome?: string | null;
  fornecedor_codigo?: string | null;
  fornecedor_cnpj?: string | null;
  centro_custo_id?: number | null;
  centro_custo_nome?: string | null;
  centro_custo_codigo?: string | null;
  usuario_id: number;
  responsavel_nome: string;
  observacao?: string | null;
  data_emissao: string;
  situacao: SituacaoNotaFiscal;
  fechada_em?: string | null;
  fechada_por?: number | null;
  fechada_por_nome?: string | null;
  total_itens?: number;
  valor_total?: number;
  itens?: NotaFiscalItem[];
  historico?: HistoricoNotaFiscal[];
}

