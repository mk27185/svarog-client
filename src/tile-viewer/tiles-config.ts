/**
 * Base URL for tile assets (tileset.json, GLB, SDF PNG).
 * - Empty string → same origin, paths `/tiles/...` (typical nginx static).
 * - Absolute URL → e.g. `https://game.example.com/tiles` (no trailing slash).
 */
export function getTilesUrlPrefix(): string {
  const raw = import.meta.env.VITE_TILES_URL_PREFIX ?? ''
  return String(raw).replace(/\/$/, '')
}

/**
 * URL of the TileJSON-like tileset descriptor (~500 B, constant size).
 * This replaces the old per-tile tile-manifest.json.
 */
export function tilesetUrl(): string {
  const p = getTilesUrlPrefix()
  return p ? `${p}/tileset.json` : '/tiles/tileset.json'
}

/** @deprecated Use tilesetUrl() instead. Kept for dev fallback only. */
export function tileManifestUrl(): string {
  const p = getTilesUrlPrefix()
  return p ? `${p}/tile-manifest.json` : '/tiles/tile-manifest.json'
}

/** Prefix for loadTile: `/tiles` or `${p}` */
export function tileAssetsPathPrefix(): string {
  const p = getTilesUrlPrefix()
  return p || '/tiles'
}
