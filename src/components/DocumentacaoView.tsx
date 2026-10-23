import React, { useState, useEffect } from 'react';
import { BookOpen, Database, Code, Server, Terminal, Copy, Check, ShieldCheck } from 'lucide-react';

interface DocumentacaoViewProps {
  currentUser?: any;
  onRefreshDb?: () => void;
  onVoltar?: () => void;
}

export const DocumentacaoView: React.FC<DocumentacaoViewProps> = ({ onVoltar }) => {
  const [activeDocTab, setActiveDocTab] = useState<'arquitetura' | 'ddl' | 'seed' | 'endpoints' | 'execucao'>('arquitetura');
  const [schemaSql, setSchemaSql] = useState<string>('');
  const [seedSql, setSeedSql] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/system/scripts')
      .then(r => r.json())
      .then(d => {
        if (d.schemaSql) setSchemaSql(d.schemaSql);
        if (d.seedSql) setSeedSql(d.seedSql);
      })
      .catch(console.error);
  }, []);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-teal-600" />
            Documentação Técnica & Arquitetura do Sistema
          </h2>
          <p className="text-xs text-slate-500">
            Especificações de engenharia de dados, modelo relacional SQLite, workflow AlmoxControl e catálogo de APIs
          </p>
        </div>
      </div>

      {/* Navegação entre Seções de Documentação */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
        {[
          { id: 'arquitetura', label: '1. Arquitetura & Modelo de Dados' },
          { id: 'ddl', label: '2. Script DDL (schema.sql)' },
          { id: 'seed', label: '3. Script Seed (seed.sql)' },
          { id: 'endpoints', label: '4. Catálogo de APIs REST' },
          { id: 'execucao', label: '5. Instruções de Execução' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveDocTab(tab.id as any)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              activeDocTab === tab.id
                ? 'bg-white text-slate-900 shadow-xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Conteúdo da Seção Selecionada */}
      {activeDocTab === 'arquitetura' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Database className="w-4 h-4 text-teal-600" />
              Visão Geral da Arquitetura & Diretrizes do AlmoxControl
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              O sistema foi concebido para atender a governança rígida de estoques hospitalares, onde medicamentos e materiais
              médico-hospitalares (OPME e correlatos) exigem rastreabilidade de ponta a ponta. A base de dados utiliza 
              <strong> SQLite nativo em modo ACID</strong> com chaves estrangeiras estritamente ativadas (<code className="bg-slate-100 px-1 py-0.5 rounded text-teal-800">PRAGMA foreign_keys = ON</code>) e diário WAL para alta concorrência.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                <span className="text-xs font-bold text-slate-900 block">Regra do Saldo Não Negativo</span>
                <p className="text-[11px] text-slate-600 leading-normal">
                  Nenhuma transação é autorizada se o saldo atual for inferior à quantidade solicitada. A verificação ocorre
                  na mesma transação atômica do débito.
                </p>
              </div>

              <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                <span className="text-xs font-bold text-slate-900 block">Livro-Caixa Imutável</span>
                <p className="text-[11px] text-slate-600 leading-normal">
                  A tabela <code className="font-mono text-teal-800">movimentacoes</code> é um log imutável de auditoria. Correções nunca deletam registros existentes; criam estornos compensatórios.
                </p>
              </div>

              <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                <span className="text-xs font-bold text-slate-900 block">Segregação por Tipo</span>
                <p className="text-[11px] text-slate-600 leading-normal">
                  Materiais consumíveis seguem o workflow de saída por requisição (baixa definitiva). Equipamentos/ferramentas seguem o módulo de Empréstimos (baixa temporária com retorno).
                </p>
              </div>
            </div>
          </div>

          {/* Dicionário de Tabelas */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Dicionário de Tabelas do Banco de Dados (SQLite)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
                  <tr>
                    <th className="py-2.5 px-3">Tabela</th>
                    <th className="py-2.5 px-3">Propósito Operacional</th>
                    <th className="py-2.5 px-3">Chaves & Relações</th>
                    <th className="py-2.5 px-3">Regras de Integridade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="py-2.5 px-3 font-mono font-semibold text-teal-800">centros_custo</td>
                    <td className="py-2.5 px-3 text-slate-700">Setores consumidores hospitalares (UTI, Centro Cirúrgico, PA)</td>
                    <td className="py-2.5 px-3 font-mono text-slate-500">PK: id | UNIQUE: codigo</td>
                    <td className="py-2.5 px-3 text-slate-600">Destino obrigatório em todas as saídas de materiais</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-mono font-semibold text-teal-800">usuarios</td>
                    <td className="py-2.5 px-3 text-slate-700">Controle de acesso por papel (admin, almoxarife, requisitante)</td>
                    <td className="py-2.5 px-3 font-mono text-slate-500">PK: id | FK: centro_custo_id</td>
                    <td className="py-2.5 px-3 text-slate-600">Requisitantes vinculados compulsoriamente a um Centro de Custo</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-mono font-semibold text-teal-800">produtos</td>
                    <td className="py-2.5 px-3 text-slate-700">Catálogo de suprimentos, níveis de estoque (min/max) e saldo atual</td>
                    <td className="py-2.5 px-3 font-mono text-slate-500">PK: id | UNIQUE: codigo</td>
                    <td className="py-2.5 px-3 text-slate-600">Distinção estrita entre 'consumivel' e 'nao_consumivel'</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-mono font-semibold text-teal-800">requisicoes</td>
                    <td className="py-2.5 px-3 text-slate-700">Cabeçalho de pedidos de saída abertos pelos requisitantes</td>
                    <td className="py-2.5 px-3 font-mono text-slate-500">PK: id | FKs: centro_custo_id, solicitante_id, almoxarife_id</td>
                    <td className="py-2.5 px-3 text-slate-600">Workflow: pendente → aprovada_atendida / rejeitada</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-mono font-semibold text-teal-800">itens_requisicao</td>
                    <td className="py-2.5 px-3 text-slate-700">Itens específicos e quantidades de cada requisição</td>
                    <td className="py-2.5 px-3 font-mono text-slate-500">PK: id | FKs: requisicao_id, produto_id</td>
                    <td className="py-2.5 px-3 text-slate-600">Qtd atendida preenchida no momento do deferimento</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-mono font-semibold text-teal-800">movimentacoes</td>
                    <td className="py-2.5 px-3 text-slate-700">Livro-caixa e histórico contábil de todas as variações de saldo</td>
                    <td className="py-2.5 px-3 font-mono text-slate-500">PK: id | FKs: produto_id, usuario_id, centro_custo_id</td>
                    <td className="py-2.5 px-3 text-slate-600">Imutabilidade total; suporte a estorno compensatório</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-mono font-semibold text-teal-800">emprestimos</td>
                    <td className="py-2.5 px-3 text-slate-700">Controle de custódia temporária de equipamentos médicos duráveis</td>
                    <td className="py-2.5 px-3 font-mono text-slate-500">PK: id | FKs: produto_id, centro_custo_id, requisitante_id</td>
                    <td className="py-2.5 px-3 text-slate-600">Reposição automática de estoque no ato da devolução</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Visualizador de DDL */}
      {activeDocTab === 'ddl' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-mono text-teal-300">
              <Code className="w-4 h-4" />
              <span>schema.sql — Definição DDL Completa e Índices</span>
            </div>
            <button
              onClick={() => copyToClipboard(schemaSql, 'ddl')}
              className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-white rounded flex items-center gap-1 transition-colors cursor-pointer"
            >
              {copiedKey === 'ddl' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedKey === 'ddl' ? 'Copiado!' : 'Copiar DDL'}</span>
            </button>
          </div>
          <pre className="p-4 text-xs font-mono bg-slate-950 text-slate-200 overflow-x-auto max-h-[600px] leading-relaxed select-text">
            {schemaSql || 'Carregando schema.sql...'}
          </pre>
        </div>
      )}

      {/* Visualizador de Seed */}
      {activeDocTab === 'seed' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-mono text-teal-300">
              <Code className="w-4 h-4" />
              <span>seed.sql — Carga Inicial de Instalação (Limpa)</span>
            </div>
            <button
              onClick={() => copyToClipboard(seedSql, 'seed')}
              className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-white rounded flex items-center gap-1 transition-colors cursor-pointer"
            >
              {copiedKey === 'seed' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedKey === 'seed' ? 'Copiado!' : 'Copiar Seed'}</span>
            </button>
          </div>
          <pre className="p-4 text-xs font-mono bg-slate-950 text-slate-200 overflow-x-auto max-h-[600px] leading-relaxed select-text">
            {seedSql || 'Carregando seed.sql...'}
          </pre>
        </div>
      )}

      {/* Catálogo de Endpoints REST */}
      {activeDocTab === 'endpoints' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Server className="w-4 h-4 text-teal-600" />
                Catálogo de Endpoints da API REST
              </h3>
              <p className="text-xs text-slate-500">Mapeamento completo de rotas, métodos HTTP e controle de acesso</p>
            </div>
          </div>

          <div className="space-y-3">
            {[
              { method: 'GET', path: '/api/auth/me', desc: 'Retorna os dados do usuário autenticado na sessão ativa', auth: 'Qualquer usuário logado' },
              { method: 'POST', path: '/api/auth/login', desc: 'Autenticação por login e senha; retorna token de sessão', auth: 'Público' },
              { method: 'POST', path: '/api/auth/switch-user', desc: 'Alternador rápido de contexto operacional para testes', auth: 'Público' },
              { method: 'GET', path: '/api/dashboard/stats', desc: 'KPIs consolidados, consumo por centro de custo e itens críticos', auth: 'Autenticado' },
              { method: 'GET', path: '/api/centros-custo', desc: 'Lista Centros de Custo cadastrados com opções de filtro', auth: 'Autenticado' },
              { method: 'POST', path: '/api/centros-custo', desc: 'Cria novo Centro de Custo no hospital', auth: 'admin' },
              { method: 'PUT', path: '/api/centros-custo/:id', desc: 'Edita atributos de um Centro de Custo existente', auth: 'admin' },
              { method: 'PATCH', path: '/api/centros-custo/:id/toggle', desc: 'Alterna status ativo/inativo de Centro de Custo', auth: 'admin' },
              { method: 'GET', path: '/api/produtos', desc: 'Catálogo de materiais e medicamentos (filtros por tipo e estoque baixo)', auth: 'Autenticado' },
              { method: 'POST', path: '/api/produtos', desc: 'Cadastra produto definindo consumível/não consumível e estoques min/max', auth: 'admin / almoxarife' },
              { method: 'PUT', path: '/api/produtos/:id', desc: 'Edita dados cadastrais do produto', auth: 'admin / almoxarife' },
              { method: 'POST', path: '/api/entradas', desc: 'Registra entrada física por NF, credita saldo e insere movimentação', auth: 'admin / almoxarife' },
              { method: 'GET', path: '/api/requisicoes', desc: 'Lista requisições (requisitante vê apenas as do seu centro)', auth: 'Autenticado' },
              { method: 'POST', path: '/api/requisicoes', desc: 'Passo A: Requisitante cria pedido (status pendente, saldo intocado)', auth: 'Autenticado' },
              { method: 'GET', path: '/api/requisicoes/:id', desc: 'Passo B: Detalha itens e exibe saldos do estoque em tempo real', auth: 'Autenticado' },
              { method: 'POST', path: '/api/requisicoes/:id/aprovar', desc: 'Passo C: Valida saldo, debita produto, grava saídas e finaliza requisição', auth: 'admin / almoxarife' },
              { method: 'POST', path: '/api/requisicoes/:id/rejeitar', desc: 'Passo C: Rejeita com justificativa obrigatória sem debitar estoque', auth: 'admin / almoxarife' },
              { method: 'GET', path: '/api/emprestimos', desc: 'Lista empréstimos por abas (abertos, atrasados, devolvidos)', auth: 'Autenticado' },
              { method: 'POST', path: '/api/emprestimos', desc: 'Libera equipamento não consumível e reduz saldo disponível', auth: 'admin / almoxarife' },
              { method: 'POST', path: '/api/emprestimos/:id/devolver', desc: 'Registra devolução física, inspeção e recompõe saldo do equipamento', auth: 'admin / almoxarife' },
              { method: 'GET', path: '/api/movimentacoes', desc: 'Livro-caixa com auditoria imutável de todas as variações de saldo', auth: 'admin / almoxarife' },
              { method: 'POST', path: '/api/movimentacoes/:id/estornar', desc: 'Gera lançamento compensatório de estorno com justificativa', auth: 'admin' },
              { method: 'POST', path: '/api/system/reset', desc: 'Restaura a base SQLite para o Seed original de demonstração', auth: 'admin' },
            ].map((ep, idx) => (
              <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs gap-2">
                <div className="flex items-center gap-2">
                  <span className={`font-mono font-bold px-2 py-0.5 rounded text-[10px] ${
                    ep.method === 'GET' 
                      ? 'bg-blue-100 text-blue-800' 
                      : ep.method === 'POST' 
                      ? 'bg-emerald-100 text-emerald-800' 
                      : ep.method === 'PUT' 
                      ? 'bg-amber-100 text-amber-800' 
                      : 'bg-purple-100 text-purple-800'
                  }`}>
                    {ep.method}
                  </span>
                  <span className="font-mono font-semibold text-slate-800">{ep.path}</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-right">
                  <span className="text-slate-600 text-left sm:text-right">{ep.desc}</span>
                  <span className="text-[10px] font-semibold text-slate-500 bg-slate-200/70 px-2 py-0.5 rounded whitespace-nowrap self-start sm:self-auto">
                    {ep.auth}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Instruções de Execução */}
      {activeDocTab === 'execucao' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-teal-600" />
              Instruções Exatas e Diretas de Execução
            </h3>
            <p className="text-xs text-slate-500">
              Comandos para inicialização do ecossistema full-stack em ambiente de desenvolvimento e produção
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <span className="text-xs font-semibold text-slate-800 block mb-1">
                1. Inicialização do Servidor de Desenvolvimento:
              </span>
              <div className="p-3 bg-slate-950 text-slate-200 font-mono text-xs rounded-lg flex items-center justify-between">
                <span>npm run dev</span>
                <button
                  onClick={() => copyToClipboard('npm run dev', 'cmd1')}
                  className="text-slate-400 hover:text-white"
                >
                  {copiedKey === 'cmd1' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Executa <code className="font-mono">server.ts</code> via <code className="font-mono">tsx</code>, conecta o SQLite nativo (<code className="font-mono">almoxarifado.db</code>), executa DDL/Seed automaticamente se necessário e serve a interface na porta 3000.
              </p>
            </div>

            <div>
              <span className="text-xs font-semibold text-slate-800 block mb-1">
                2. Compilação para Produção (Build do Bundle Frontend):
              </span>
              <div className="p-3 bg-slate-950 text-slate-200 font-mono text-xs rounded-lg flex items-center justify-between">
                <span>npm run build</span>
                <button
                  onClick={() => copyToClipboard('npm run build', 'cmd2')}
                  className="text-slate-400 hover:text-white"
                >
                  {copiedKey === 'cmd2' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <span className="text-xs font-semibold text-slate-800 block mb-1">
                3. Execução em Produção:
              </span>
              <div className="p-3 bg-slate-950 text-slate-200 font-mono text-xs rounded-lg flex items-center justify-between">
                <span>npm start</span>
                <button
                  onClick={() => copyToClipboard('npm start', 'cmd3')}
                  className="text-slate-400 hover:text-white"
                >
                  {copiedKey === 'cmd3' ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-2">
              <strong className="text-slate-900 block font-semibold">Credenciais de Acesso Inicial (Instalação Limpa):</strong>
              <div className="p-3 bg-white rounded border border-slate-200 space-y-1">
                <span className="font-bold text-slate-800 block">Usuário Administrador Geral:</span>
                <div className="flex items-center gap-4 text-slate-700">
                  <span>Login: <code className="font-mono bg-slate-100 px-1 py-0.5 rounded font-bold text-teal-800">admin</code></span>
                  <span>Senha Padrão: <code className="font-mono bg-slate-100 px-1 py-0.5 rounded font-bold text-teal-800">admin123</code></span>
                  <span>Perfil: <code className="font-mono bg-slate-100 px-1 py-0.5 rounded font-bold text-teal-800">admin</code></span>
                </div>
              </div>
              <p className="text-[11px] text-slate-600 pt-1">
                O banco SQLite inicia sem registros fictícios. O Administrador pode cadastrar na sequência: 1) Centros de Custo; 2) Usuários Almoxarifes e Requisitantes; 3) Produtos; 4) Entradas de Estoque; 5) Requisições; 6) Aprovações; 7) Empréstimos e Devoluções.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
