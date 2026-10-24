import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import express from 'express';
import path from 'path';
import { defineConfig, Plugin } from 'vite';
import { apiRouter } from './src/server/apiRouter.ts';
import { rejectAnonymousBeforeBodyParsing } from './src/server/authCore.ts';

// Order matters: anonymous requests are rejected BEFORE the body parser runs, then the router
// applies full Firebase ID-token verification (see apiRouter.ts) and per-route workspace ownership.
function mountApi(app: express.Express) {
  app.use('/api', rejectAnonymousBeforeBodyParsing);
  app.use('/api', express.json({ limit: '10mb' }));
  app.use('/api', apiRouter);
}

function expressApiPlugin(): Plugin {
  return {
    name: 'express-api-plugin',
    configureServer(server) {
      const app = express();
      mountApi(app);
      server.middlewares.use(app);
    },
    configurePreviewServer(server) {
      const app = express();
      mountApi(app);
      server.middlewares.use(app);
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), expressApiPlugin()],
    // Allow the hosting provider's public hostname when running `vite preview` (e.g. on Render).
    preview: { allowedHosts: true },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
