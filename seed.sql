-- ============================================================================
-- ALMOXCONTROL - SEED INICIAL DO ALMOXARIFADO CENTRAL
-- ============================================================================

-- 1. Centro de Custo Base Inicial
INSERT OR IGNORE INTO centros_custo (id, codigo, nome, departamento, responsavel, ativo, criado_em) VALUES
(7, '7 - 1.02', 'ALMOXARIFADO CENTRAL', 'ALMOXARIFADO', 'Gestor de Estoque', 1, CURRENT_TIMESTAMP);

-- 2. 15 Grupos Oficiais do Almoxarifado
INSERT OR IGNORE INTO grupos_produtos (id, codigo, nome, tipo_padrao, ativo) VALUES
(1, '01', 'ALMOXARIFADO CENTRAL', 'consumivel', 1),
(2, '02', 'EQUIPAMENTOS DIVERSOS', 'nao_consumivel', 1),
(3, '03', 'EQUIPAMENTOS MEDICOS E CIRURGICOS', 'nao_consumivel', 1),
(4, '04', 'ESCRITORIO E INFORMATICA', 'consumivel', 1),
(5, '05', 'GRUPO PROVISORIO PARA AJUSTE', 'consumivel', 1),
(6, '06', 'IMOBILIZADO ATIVO/FIXO', 'nao_consumivel', 1),
(7, '07', 'INSTRUMENTAIS MEDICOS', 'nao_consumivel', 1),
(8, '08', 'MATERIAIS', 'consumivel', 1),
(9, '09', 'MATERIAIS DE LIMPEZA E DESCARTAVEIS', 'consumivel', 1),
(10, '10', 'MATERIAIS MEDICOS HOSPITALAR', 'consumivel', 1),
(11, '11', 'MATERIAIS ODONTOLOGICOS', 'consumivel', 1),
(12, '12', 'MATERIAL DE ENGENHARIA CLINICA', 'nao_consumivel', 1),
(13, '13', 'MATERIAL DE MANUTENCAO EM GERAL', 'consumivel', 1),
(14, '14', 'ROUPARIA E TECIDOS', 'consumivel', 1),
(15, '15', 'UNIFORMES', 'consumivel', 1);
