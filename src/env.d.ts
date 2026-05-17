/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  /**
   * Optional absolute URL prefix for map tiles (manifest + GLB + SDF), no trailing slash.
   * Example: `https://game.example.com/tiles`. Empty → same-origin `/tiles/...` (nginx static).
   */
  readonly VITE_TILES_URL_PREFIX: string | undefined
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
