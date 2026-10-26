# AlmoxControl - Sistema Integrado de Gestão de Almoxarifado & Estoque

> **Desenvolvido por Bruno Rocha - DPO**

---

## 1. Sobre o AlmoxControl

O **AlmoxControl** é um sistema completo, moderno e independente para gestão e controle operacional de almoxarifados, farmácias hospitalares, materiais e patrimônio. O sistema foi desenvolvido com foco em alta confiabilidade, governança de processos, auditoria e facilidade de operação para equipes multidisciplinares.

### Principais Diferenciais:
- **Gestão de Múltiplos Centros de Custo**: Requisição e destinação precisa de materiais por setor.
- **Workflow de Requisições com Prioridade**: Fluxo claro de aprovação/atendimento com verificação atômica de saldos em tempo real.
- **Rastreabilidade de Entradas**: Recebimento de insumos com controle de fornecedor, documento fiscal, número de lote e data de validade.
- **Controle de Empréstimos e Custódia**: Monitoramento de devoluções com laudo de conservação e sinalização de itens em atraso.
- **Auditoria e Segurança Transacional**: Registro imutável de movimentações sob transações ACID e proibição estrita de saldo negativo.
- **Exportação & Backup Integrado**: Exportação com um clique para administradores em arquivos SQLite (`.db`), dump SQL com DDL e DML (`.sql`) e formato JSON estruturado (`.json`).

---

## 2. Identidade Visual & Usabilidade

- **Paleta de Cores Institucional**:
  - **Tonalidades Primárias**: Verde e Teal refinados (`#0d9488` / `#14b8a6` / `#0f766e` / `#115e59`), transmitindo segurança, limpeza e controle.
  - **Fundo da Aplicação**: Cinza claro neutro (`#f8f9fa`) que reduz a fadiga visual do operador.
  - **Inputs & Controles**: Campos com contornos discretos (`#cbd5e1`), preenchimento suave (`#f1f3f5`) e rótulos pequenos em caixa alta.
- **Padronização de Botões e Controles**:
  - `+ NOVO` / `+ NOVA REQUISIÇÃO` → Botão verde sólido (`#16a34a`) com ícone contextual.
  - `PESQUISAR` → Botão com contorno em teal (`border-teal-600 text-teal-700`) com ícone de lupa.
  - `VOLTAR` → Botão teal institucional (`#0d9488`) com ícone de retorno.
  - `SALVAR` → Botão verde sólido com ícone de disquete.
- **Tabelas de Consulta e Consulta Avançada**:
  - Linhas com visual zebrado alternado e realce dinâmico ao passar o cursor.
  - Contadores de registros e paginação numérica padronizada em todos os módulos.
- **Navegação Dupla Flexível**:
  - **Painel em Grade**: Tela inicial com cartões modernos e acesso rápido aos módulos disponíveis de acordo com o perfil do operador.
  - **Barra Lateral com Módulos**: Navegação compacta e direta para transição rápida entre fluxos diários.

---

## 3. Arquitetura Técnica Full-Stack

- **Backend**: Node.js 22 LTS com Express e motor nativo **`node:sqlite` (DatabaseSync)**, eliminando dependências nativas pesadas como `node-gyp`.
- **Banco de Dados**: SQLite transacional (`almoxarifado.db`) com integridade referencial ativa:
  ```sql
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  ```
- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS.
- **Segurança de Acesso (RBAC)**:
  - `admin`: Acesso irrestrito a todos os cadastros, controle de operadores, auditoria e backup do banco de dados.
  - `almoxarife`: Gestão diária de entradas por nota fiscal, aprovação e atendimento de requisições e controle de empréstimos.
  - `requisitante`: Abertura e acompanhamento de requisições de materiais para o seu centro de custo.

---

## 4. Estrutura do Banco de Dados

O banco de dados relacional é composto por 8 tabelas principais:

1. `empresas_unidades`: Unidades e almoxarifados descentralizados.
2. `centros_custo`: Setores e departamentos requisitantes.
3. `usuarios`: Operadores do sistema e seus respectivos perfis e credenciais criptografadas (SHA-256).
4. `produtos`: Cadastro de materiais consumíveis e equipamentos não consumíveis com parâmetros de estoque mínimo e máximo.
5. `requisicoes`: Cabeçalho das solicitações de materiais com controle de status e prioridade.
6. `itens_requisicao`: Itens e quantidades vinculadas a cada requisição.
7. `movimentacoes`: Livro de movimentações imutável para rastreamento de entradas, saídas e estornos.
8. `emprestimos`: Controle de cautela e devolução de ferramentas e equipamentos patrimoniais.

---

## 5. Como Executar o Projeto

### Pré-requisitos
- **Node.js** v20 ou v22+
- **npm** v10+

### Instalação e Execução

```bash
# 1. Instalar as dependências
npm install

# 2. Iniciar em modo de desenvolvimento (servidor Node.js + Vite)
npm run dev

# 3. Compilar para produção
npm run build

# 4. Iniciar em produção
npm start
```

O sistema estará acessível em:
**`http://localhost:3000`**

### Acesso Inicial de Instalação

O sistema é entregue em estado limpo, sem registros fictícios de demonstração, pronto para uso operacional:

- **Usuário**: `admin`
- **Senha Inicial**: `admin123`
- *Observação*: No primeiro login, o sistema exibe um aviso orientando a troca de senha para maior segurança.

### Deploy no Ubuntu Server (Rede Local / VPS)

O projeto está configurado com o arquivo `ecosystem.config.cjs` para execução contínua via **PM2** no Ubuntu Server com usuário dedicado (ex: `almoxapp`):

1. **Remover arquivos de banco do controle de versão (Git):**
   Para evitar que atualizações via `git pull` ou `git reset --hard` sobrescrevam os bancos de dados de produção, os arquivos `.db` foram adicionados ao `.gitignore`. Se o repositório já tinha bancos versionados, execute no servidor:
   ```bash
   git rm --cached -r *.db *.db-wal *.db-shm *.sqlite *.sqlite3
   git commit -m "fix(db): remove bancos sqlite do controle de versao"
   ```

2. **Permissões de Arquivo e Diretório (SQLite WAL):**
   O SQLite opera em modo Write-Ahead Logging (`WAL`), o que exige permissão de escrita não apenas no arquivo `.db`, mas também no diretório pai (para criação e deleção dinâmica dos arquivos temporários `-wal` e `-shm`).
   ```bash
   # Supondo que a aplicação rode sob o usuário e grupo 'almoxapp':
   sudo chown -R almoxapp:almoxapp /caminho/para/o/projeto
   sudo chmod -R 775 /caminho/para/o/projeto
   # Garanta permissão de escrita para grupo em todos os arquivos de banco:
   chmod 664 *.db *.db-wal *.db-shm 2>/dev/null || true
   ```
   *Dica de umask no PM2:* No `ecosystem.config.cjs`, configure `umask: '002'` para que novos arquivos criados pelo processo herdem automaticamente permissão `664`.

3. **Diretório de Banco Configurável (`DB_DIR`):**
   Por padrão, os bancos ficam na raiz do projeto. Caso deseje isolar os dados em um diretório do sistema (ex: `/var/lib/almoxcontrol/data`), defina no `.env`:
   ```bash
   DB_DIR=/var/lib/almoxcontrol/data
   PORT=3005
   ```
   O sistema cria o diretório automaticamente com permissões `0775` na inicialização.

4. **Instalar dependências e compilar:**
   ```bash
   npm install
   npm run build
   ```

5. **Iniciar com PM2 (reinicia automaticamente após reboot):**
   ```bash
   pm2 start ecosystem.config.cjs
   pm2 save
   ```

---

## 5.1 Arquitetura Multi-Banco de Dados SQLite

O sistema opera com separação limpa entre o **Banco Central** e os **Bancos Operacionais de Área**:

### 1. Banco Central (`sistema.db`)
- **Autenticação Centralizada**: Credenciais seguras (`senha_hash` com SHA-256) na tabela `usuarios`.
- **Tabela de Áreas (`areas`)**: Registra as áreas ativas (`ALM`, `CAF` e áreas customizadas).
- **Controle de Acesso Modular (`usuario_modulos`)**: Módulos visíveis e liberados por usuário.
- **Vínculo Usuário x Áreas (`usuario_areas`)**: Tabela de junção muitos-para-muitos definindo a quais áreas cada operador tem acesso.
- **Relatórios Cruzados (`area_relatorios_cruzados`)**: Matriz de autorização de leitura cruzada (ex: CAF pode consultar saldos do ALM).
- **Cadastros Compartilhados**: `centros_custo` e `empresas_unidades`.
- **Auditoria Global (`logs_acesso`)**: Registro unificado de tentativas e logins com IP e data/hora.

### 2. Bancos de Área (`almoxarifado.db`, `caf.db`, etc.)
- **Operação de Estoque**: Catálogo de `produtos`, `lotes_estoque`, `movimentacoes`, `notas_fiscais`, `requisicoes`, `itens_requisicao`, `consumos`, `inventarios_estoque` e `emprestimos_institucionais`.
- **Garantia de Colunas Críticas**:
  - `movimentacoes`: `nota_fiscal_id`, `requisicao_id`, `consumo_id`, `emprestimo_institucional_id`.
  - `itens_requisicao`: `lote_id`, `numero_lote`, `data_validade`, `lotes_atendidos`.
- **Espelho Local Sincronizado**: Tabelas `usuarios` (com `permissoes` e `cargo_nome`, sem senha) e `centros_custo` espelhadas automaticamente a cada inicialização e alteração para integridade referencial e joins locais.

### 3. Migração Idempotente Automática
A camada `src/server/db.ts` executa migrações automáticas e idempotentes em todo início de processo:
- Inspeciona tabelas reais via `PRAGMA table_info(...)`.
- Adiciona colunas ausentes em bancos existentes via `ALTER TABLE ... ADD COLUMN ...`.
- Versiona o schema usando `PRAGMA user_version` (versão atual: 3).
- **Preservação de Dados**: Nenhuma migração executa `DROP TABLE`, `DELETE` ou substitui dados existentes.

---

## 6. Endpoints Principais da API REST

- `POST /api/auth/login`: Autenticação e definição de unidade ativa.
- `GET /api/dashboard/stats`: Indicadores consolidados em tempo real.
- `GET/POST/PUT /api/usuarios`: Consulta e gestão de operadores.
- `GET/POST/PUT /api/centros-custo`: Gestão de centros de custo e setores.
- `GET/POST/PUT /api/produtos`: Catálogo de insumos e alerta de estoque mínimo.
- `POST /api/entradas`: Entrada de estoque por NF com lote e validade.
- `GET/POST /api/requisicoes`: Abertura de pedidos de materiais.
- `POST /api/requisicoes/:id/aprovar`: Atendimento e baixa atômica de saldo.
- `POST /api/requisicoes/:id/rejeitar`: Parecer obrigatório de recusa.
- `GET/POST /api/emprestimos`: Liberação de equipamentos não consumíveis.
- `POST /api/emprestimos/:id/devolver`: Recebimento de devolução com recomposição de estoque.
- `GET /api/backup/info`: Metadados e contagens para o módulo de exportação.
- `GET /api/backup/download-db`: Download do arquivo SQLite (`.db`).
- `GET /api/backup/download-sql`: Exportação do script DDL e DML (`.sql`).
- `GET /api/backup/download-json`: Exportação dos dados em formato JSON (`.json`).
- `GET /api/relatorios/catalogo`: Catálogo dos relatórios operacionais.
- `POST /api/relatorios/executar`: Emissão de relatórios timbrados com exportação CSV.
