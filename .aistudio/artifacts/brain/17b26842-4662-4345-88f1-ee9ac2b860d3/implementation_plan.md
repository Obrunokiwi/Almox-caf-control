# Gestão de Usuários com Caixa de Permissões, Perfil TI/DPO e Download de Logs de Acesso (Revisado)

Permite ao Administrador configurar permissões personalizadas via checkboxes na criação/edição de usuários, estabelece o perfil de TI/DPO (Centros de Custo, novos usuários e requisições para setores), isola as requisições e relatórios dos usuários comuns estritamente para o seu Centro de Custo, e registra logs de acesso em arquivo para download junto ao backup do banco de dados.

### Revisão do Usuário & Decisões Críticas

> [!IMPORTANT]
> **Decisões Atualizadas (Conforme Feedback do Usuário):**
> - **Simplificação da Auditoria:** Removida qualquer sobrecarga de telas de LGPD. O foco é estritamente no **Log de Acessos** (data/hora, usuário, login, perfil, IP e sucesso).
> - **Download do Arquivo de Logs:** O arquivo de logs de acesso pode ser baixado em formato `.csv` / `.log` diretamente na janela de ferramentas e backup do sistema, junto ao download do arquivo do banco de dados.
> - **Caixa de Permissões na Criação de Usuários:** Na tela de usuários, o Administrador tem uma caixa de seleção com checkboxes para definir o que cada usuário pode fazer, com preenchimento automático inteligente ao escolher o perfil base.
> - **Papel do Usuário TI / DPO:** Pode cadastrar e gerenciar Centros de Custo, cadastrar novos usuários e senhas, e emitir requisições para qualquer setor hospitalar.
> - **Isolamento do Usuário Comum:** Visualiza apenas requisições e relatórios vinculados ao seu próprio Centro de Custo.
> - **Regras Permanentes Mantidas:** Banco `almoxarifado.db` e variável `SQLITE_DB_PATH` intactos; porta canônica `const PORT = Number(process.env.PORT) || 3000;` rigorosamente preservada.

---

### 1. Visão Geral & Conceito

- **O que faz:**
  1. **Caixa de Permissões no Cadastro de Usuários (`UsuariosView.tsx`):**
     - Permite ao Administrador marcar/desmarcar checkboxes individuais definindo o que o usuário pode fazer:
       - *Cadastrar e editar Centros de Custo*
       - *Cadastrar e gerenciar Novos Usuários*
       - *Emitir requisições para o próprio setor*
       - *Emitir requisições para qualquer setor (suporte de TI/DPO)*
       - *Aprovar requisições e efetuar baixas (Almoxarifado)*
       - *Lançar entradas de Nota Fiscal e lotes*
       - *Consultar saldo de estoque e lotes*
       - *Gerenciar cadastro de produtos e fornecedores*
       - *Relatórios gerais de todos os setores vs. apenas do próprio setor*
  2. **Modelos Rápidos (Presets de Perfil):**
     - Ao selecionar `Administrador`, `TI / DPO`, `Almoxarife` ou `Requisitante`, o sistema pré-seleciona os checkboxes recomendados, permitindo ajustes finos antes de salvar.
  3. **Isolamento de Dados do Usuário Comum:**
     - Usuários comuns só visualizam e pesquisam requisições e relatórios pertencentes ao seu Centro de Custo de lotação.
  4. **Registro e Download de Logs de Acesso:**
     - Gravação automática de cada login efetuado (data, hora, login, nome, perfil e IP).
     - No modal de Backup do Sistema, além do botão de baixar o banco SQLite, é adicionado o botão **"Baixar Histórico de Acessos (CSV)"**.

- **Público-alvo:** Administrador Geral, equipe de TI/DPO, Almoxarifado e Requisitantes.
- **Valor agregado:** Controle cirúrgico de acessos sem complexidade desnecessária, garantindo rastreabilidade de acessos e total privacidade entre setores.

---

### 2. Experiência do Usuário & Fluxo de Telas

- **Cadastro / Edição de Usuário:**
  - O Admin abre o formulário de usuário e seleciona o perfil.
  - A caixa **"O que este usuário pode fazer (Permissões)"** é preenchida automaticamente de acordo com o perfil e fica disponível para customização individual.
- **Visualização de Usuários Comuns:**
  - Ao entrar em **Requisições de Insumos**, a lista exibe apenas os pedidos do setor do usuário.
  - Em **Relatórios**, o filtro de Centro de Custo fica travado no setor do colaborador.
- **Janela de Backup & Logs:**
  - O Admin clica em **Backup do Banco** na barra superior e encontra:
    1. *Baixar Arquivo do Banco de Dados (`almoxarifado.db`)*
    2. *Baixar Log de Acessos ao Sistema (`logs_acesso.csv`)*

---

### 3. Decisões Técnicas & Estratégia de Dados

- **Registro de Logs de Acesso:**
  - Tabela leve `logs_acesso` no SQLite (`CREATE TABLE IF NOT EXISTS logs_acesso (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER, login TEXT, nome TEXT, perfil TEXT, ip TEXT, data_hora DATETIME DEFAULT CURRENT_TIMESTAMP)`).
  - Endpoint `GET /api/system/logs-acesso/download` que gera e faz download direto do arquivo `.csv` formatado.
- **Armazenamento de Permissões:**
  - Coluna `permissoes` (JSON array) na tabela `usuarios`.
- **Enforcement Seguro no Servidor:**
  - As rotas de `/api/requisicoes` e `/api/relatorios` aplicam o filtro de `centro_custo_id` automaticamente quando o usuário logado não possui permissão de visão global.

---

### 4. Arquitetura Técnica & Diagrama de Dados

```
┌─────────────────────────────────────────────────────────────┐
│                       Fluxo de Acessos                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [Criação / Edição de Usuário pelo Admin]                   │
│   Perfil Base: [ Administrador | TI / DPO | Almoxarife | Usuário ]
│        │                                                    │
│        ▼ (Pré-marcação automática)                          │
│   Caixa de Seleção de Permissões:                           │
│   ☑ Centros de Custo   ☑ Cadastrar Usuários                │
│   ☑ Requisições Geral  ☑ Requisições Setor                 │
│   ☑ Aprovar Baixas     ☑ Relatórios Setor                  │
│                                                             │
│                                                             │
│  [Isolamento de Dados]                                      │
│   Usuário Comum ──► Requisições & Relatórios do seu Setor   │
│   TI / DPO      ──► Requisições para Setores + Usuários + CC│
│   Admin         ──► Acesso irrestrito a todas as funções    │
│                                                             │
│                                                             │
│  [Modal de Backup & Ferramentas]                            │
│   ┌─────────────────────────────────────────────────────┐   │
│   │ 💾 Baixar Cópia do Banco (almoxarifado.db)          │   │
│   │ 📄 Baixar Arquivo de Logs de Acesso (logs_acesso.csv)│  │
│   └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

- **Plano de Implementação:**
  1. **Banco de Dados (`src/server/db.ts`):**
     - Criar tabela `logs_acesso` (`CREATE TABLE IF NOT EXISTS`).
     - Adicionar migração segura para coluna `permissoes` na tabela `usuarios`.
  2. **Registro de Log no Login (`src/server/routes.ts`):**
     - Registrar entrada na tabela `logs_acesso` a cada login bem-sucedido.
     - Endpoint `GET /api/system/logs-acesso/download` exportando o arquivo CSV com data, login, nome, perfil e IP.
  3. **Tipos TypeScript (`src/types/index.ts`):**
     - Adicionar perfil `'ti_dpo'` ao tipo `PerfilUsuario`.
     - Definir lista de chaves de permissões.
  4. **Interface de Usuários (`src/components/UsuariosView.tsx`):**
     - Adicionar a caixa com checkboxes organizados para marcar/desmarcar o que cada usuário pode fazer.
     - Presets automáticos ao alternar entre Admin, TI/DPO, Almoxarife e Requisitante.
  5. **Isolamento de Requisições e Relatórios (`RequisicoesView.tsx` e `RelatoriosView.tsx`):**
     - Restringir visão de pedidos e relatórios ao Centro de Custo do usuário quando ele não tiver permissão global.
  6. **Modal de Backup (`src/components/BackupDatabaseModal.tsx`):**
     - Adicionar o botão para download do arquivo de logs de acesso junto com o download do banco de dados.
  7. **Validação Final:**
     - Compilação (`compile_applet`), tipagem (`lint_applet`) e confirmação da porta canônica em `server.ts`.
