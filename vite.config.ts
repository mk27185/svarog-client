import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const designRoot = path.resolve(dirname, '../svarog-design/src');
//const TILES_ROOT = path.resolve(dirname, '../svarog-engine/outputs/prague_200m');
//const TILES_ROOT = path.resolve(dirname, '../svarog-engine/outputs/praha-test');
//const TILES_ROOT = path.resolve(dirname, '../svarog-engine/outputs/prague-outer');
const TILES_ROOT = path.resolve(dirname, '../svarog-engine/outputs/prague-outer-single-glb');

const EXT_TYPES: Record<string, string> = {
  '.glb':  'model/gltf-binary',
  '.png':  'image/png',
  '.json': 'application/json',
  '.js':   'application/javascript',
  '.wasm': 'application/wasm',
};

function mimeOf(filePath: string): string {
  return EXT_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

export default defineConfig({
  base: './',
  plugins: [
    vue(),
    tailwindcss(),
    {
      name: 'static-decoders',
      configureServer(server) {
        const DRACO_ROOT = path.resolve(dirname, 'public/draco');
        server.middlewares.use(
          '/draco',
          (req: IncomingMessage, res: ServerResponse, next: () => void) => {
            const urlPath  = (req.url ?? '').split('?')[0];
            const filePath = path.join(DRACO_ROOT, urlPath);
            let stat: fs.Stats | null = null;
            try { stat = fs.statSync(filePath); } catch { /* not found */ }
            if (stat?.isFile()) {
              res.setHeader('Content-Type', mimeOf(filePath));
              res.setHeader('Cache-Control', 'public, max-age=86400');
              fs.createReadStream(filePath).pipe(res);
            } else {
              next();
            }
          },
        );
      },
    },
    {
      name: 'tile-server',
      configureServer(server) {
        server.middlewares.use(
          '/tiles',
          (req: IncomingMessage, res: ServerResponse, next: () => void) => {
            const urlPath = (req.url ?? '').split('?')[0];
            const filePath = path.join(TILES_ROOT, urlPath);
            let stat: fs.Stats | null = null;
            try {
              stat = fs.statSync(filePath);
            } catch {
              /* not found */
            }
            if (stat?.isFile()) {
              res.setHeader('Content-Type', mimeOf(filePath));
              // During development never cache tiles — changes on disk must be
              // visible on the next reload without a forced browser-side clear.
              res.setHeader('Cache-Control', 'no-store')
              fs.createReadStream(filePath).pipe(res);
            } else {
              next();
            }
          },
        );
      },
    },
  ],
  resolve: {
    alias: [
      { find: '@/types/index', replacement: path.join(designRoot, 'types/index.ts') },
      { find: '@/types', replacement: path.join(designRoot, 'types/index.ts') },
      { find: '@/icons', replacement: path.join(designRoot, 'icons') },
      { find: '@/atoms', replacement: path.join(designRoot, 'atoms') },
      { find: '@/molecules', replacement: path.join(designRoot, 'molecules') },
      { find: '@/organisms', replacement: path.join(designRoot, 'organisms') },
      { find: /^@\/(.*)$/, replacement: `${path.resolve(dirname, 'src')}/$1` },
    ],
  },
  server: {
    port: 5174,
    fs: { allow: [dirname, path.resolve(dirname, '..')] },
  },
});
