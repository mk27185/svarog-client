import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const designRoot = path.resolve(dirname, '../svarog-design/src');

export default defineConfig({
  base: './',
  plugins: [vue(), tailwindcss()],
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
