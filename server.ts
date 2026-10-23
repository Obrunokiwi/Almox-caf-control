import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDatabase, DB_PATH } from './src/server/db.ts';
import { apiRouter } from './src/server/routes.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Inicializa o banco de dados SQLite com schema e seed se ainda não populado
  try {
    initDatabase();
    console.log(`[MULTI ALMOX] Banco de dados SQLite pronto em: ${DB_PATH}`);
  } catch (err) {
    console.error('Erro na inicialização do banco SQLite:', err);
  }

  app.use(express.json({ limit: '50mb' }));

  // Rotas da API REST
  app.use('/api', apiRouter);

  const distPath = path.resolve(__dirname, 'dist');
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    // Modo de Desenvolvimento com Vite HMR middleware
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Modo de Produção (Ubuntu Server / VPS)
    if (!fs.existsSync(distPath)) {
      console.warn(
        '[AVISO] Pasta dist/ não encontrada! Execute "npm run build" antes de iniciar em produção.'
      );
    }
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(
      `[MULTI ALMOX] Servidor (${isProduction ? 'PRODUÇÃO' : 'DESENVOLVIMENTO'}) rodando em http://0.0.0.0:${PORT}`
    );
  });
}

startServer().catch((err) => {
  console.error('Falha crítica ao iniciar servidor:', err);
  process.exit(1);
});
