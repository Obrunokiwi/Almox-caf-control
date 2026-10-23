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

O projeto já está configurado com o arquivo `ecosystem.config.cjs` para execução contínua via **PM2** no Ubuntu Server:

1. **Clonar ou copiar os arquivos para o servidor e instalar dependências:**
   ```bash
   npm install
   npm run build
   ```

2. **Configurar a Porta (caso a `3000` já esteja em uso por outro sistema):**
   - Crie um arquivo `.env` baseado no `.env.example` (`cp .env.example .env`) e defina a porta desejada (ex: `PORT=3010`), **ou**
   - Altere o valor de `PORT` diretamente no arquivo `ecosystem.config.cjs`.

3. **Iniciar com PM2 (mantém o sistema ativo 24/7 e reinicia junto com o Ubuntu):**
   ```bash
   pm2 start ecosystem.config.cjs
   pm2 save
   ```
   *(Caso não use PM2, você também pode iniciar diretamente com `npm start` ou `PORT=3010 npm start`).*

4. **Acesso pelas estações na Rede Local:**
   - Os computadores da mesma rede poderão acessar pelo IP do servidor Ubuntu:
     **`http://IP-DO-SERVIDOR:3000`** (ou na porta configurada).

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
