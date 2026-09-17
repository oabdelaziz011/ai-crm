import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig } from 'vite';
import { resolveManualChunk } from './src/lib/bundle/manual-chunks';

const port = Number(process.env.PORT ?? 5173);
const basePath = process.env.BASE_PATH ?? '/';

export default defineConfig(({ mode }) => {
  const analyzeBundle = mode === 'analyze';

  return {
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    analyzeBundle &&
      visualizer({
        filename: path.resolve(import.meta.dirname, 'dist/bundle-stats.html'),
        gzipSize: true,
        brotliSize: true,
        open: false,
      }),
  ].filter(Boolean),
  resolve: {
    alias: [
      {
        find: '@',
        replacement: path.resolve(import.meta.dirname, 'src'),
      },
      {
        find: '@assets',
        replacement: path.resolve(
          import.meta.dirname,
          '..',
          '..',
          'attached_assets',
        ),
      },
      {
        find: '@workspace/platform-crypto/client',
        replacement: path.resolve(
          import.meta.dirname,
          '..',
          '..',
          'lib/platform-crypto/src/runtime-env-client.ts',
        ),
      },
      {
        find: '@workspace/platform-crypto/server',
        replacement: path.resolve(
          import.meta.dirname,
          '..',
          '..',
          'lib/platform-crypto/src/runtime-env-server.ts',
        ),
      },
      // Import-time safety for node:crypto references accidentally pulled into the client graph.
      {
        find: /^node:crypto$/,
        replacement: path.resolve(
          import.meta.dirname,
          'src/lib/stubs/node-crypto.browser.ts',
        ),
      },
    ],
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          return resolveManualChunk(id);
        },
      },
    },
  },
  optimizeDeps: {
    include: [
      'react-day-picker',
      'date-fns',
      'date-fns/locale',
    ],
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
  };
});
