/**
 * Configuração do PM2 para Ubuntu Server
 * Como usar:
 *   1. npm install
 *   2. npm run build
 *   3. pm2 start ecosystem.config.cjs
 *   4. pm2 save
 */
module.exports = {
  apps: [
    {
      name: 'almoxcontrol',
      script: 'node_modules/.bin/tsx',
      args: 'server.ts',
      instances: 1, // Importante manter 1 instância para acesso exclusivo ao SQLite (WAL)
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3005, // Altere aqui caso a porta 3005 já esteja ocupada no Ubuntu Server
        SQLITE_DB_PATH: './almoxarifado.db',
      },
    },
  ],
};
