/**
 * Base URL for tile assets (manifest, GLB, SDF PNG).
 * - Empty string → same origin, paths `/tiles/...` (typical nginx static).
 * - Absolute URL → e.g. `https://game.example.com/tiles` (no trailing slash).
 */
export function getTilesUrlPrefix(): string {
  const raw = import.meta.env.VITE_TILES_URL_PREFIX ?? ''
  return String(raw).replace(/\/$/, '')
}

export function tileManifestUrl(): string {
  const p = getTilesUrlPrefix()
  return p ? `${p}/tile-manifest.json` : '/tiles/tile-manifest.json'
}

/** Prefix for loadTile: `/tiles` or `${p}` */
export function tileAssetsPathPrefix(): string {
  const p = getTilesUrlPrefix()
  return p || '/tiles'
}
