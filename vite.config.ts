import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import fs from 'fs'
import type { IncomingMessage, ServerResponse } from 'http'

const TILES_ROOT = path.resolve(__dirname, '../svarog-engine/outputs/prague_200m')

const EXT_TYPES: Record<string, string> = {
  '.glb':  'model/gltf-binary',
  '.png':  'image/png',
  '.json': 'application/json',
}

function mimeOf(filePath: string): string {
  return EXT_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream'
}

export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'tile-server',
      configureServer(server) {
        server.middlewares.use(
          '/tiles',
          (req: IncomingMessage, res: ServerResponse, next: () => void) => {
            const urlPath = (req.url ?? '').split('?')[0]
            const filePath = path.join(TILES_ROOT, urlPath)
            let stat: fs.Stats | null = null
            try { stat = fs.statSync(filePath) } catch { /* not found */ }
            if (stat?.isFile()) {
              res.setHeader('Content-Type', mimeOf(filePath))
              res.setHeader('Cache-Control', 'public, max-age=3600')
              fs.createReadStream(filePath).pipe(res)
            } else {
              next()
            }
          },
        )
      },
    },
  ],
})
