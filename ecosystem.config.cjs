/**
 * Configuração do PM2 para Ubuntu Server (AlmoxControl)
 * Como usar no Ubuntu Server:
 *   1. npm install
 *   2. npm run build
 *   3. pm2 start ecosystem.config.cjs
 *   4. pm2 save
 * 
 * NOTA DE PERMISSÕES SQLITE NO LINUX:
 * - O SQLite necessita de permissão de escrita no arquivo (.db) e na pasta que o contém
 *   para criar os arquivos de transação (-wal e -shm).
 * - O umask padrão de servidores (022) cria arquivos 644 e pastas 755. Recomendamos
 *   manter 'umask: 002' para garantir permissão 664 aos membros do grupo 'almoxapp'.
 */
module.exports = {
  apps: [
    {
      name: 'almoxcontrol',
      script: 'node_modules/.bin/tsx',
      args: 'server.ts',
      instances: 1, // Importante: manter 1 instância para acesso exclusivo ao SQLite (WAL)
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      // Garante permissões adequadas (664 em arquivos e 775 em diretórios) para SQLite WAL
      // umask: '002',
      env: {
        NODE_ENV: 'production',
        PORT: 3005, // Porta HTTP padrão em produção (no AI Studio usa 3000)
        DB_DIR: './', // Diretório dos bancos (.db). Pode ser alterado para caminho absoluto ex: /var/lib/almoxcontrol/data
        SQLITE_DB_PATH: './almoxarifado.db',
      },
    },
  ],
};

