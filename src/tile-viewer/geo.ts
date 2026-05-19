/**
 * Geographic / tile math for the tile viewer.
 *
 * Two coordinate systems are used:
 *  - Equirectangular world offsets (metres from grid origin) for Three.js placement.
 *  - Web Mercator XYZ tile indices for deriving tile URLs from tileset.json bounds.
 */

export const MPD_LAT = 111_320.0

export function mpdLon(lat: number): number {
  return MPD_LAT * Math.cos((lat * Math.PI) / 180)
}

/** Geo (WGS84) → Three.js world offset in metres, relative to a grid origin. */
export function geoToWorld(
  lat: number,
  lon: number,
  originLat: number,
  originLon: number,
): { offsetX: number; offsetZ: number } {
  const lon0 = mpdLon(originLat)
  return {
    offsetX: (lon - originLon) * lon0,
    offsetZ: -(lat - originLat) * MPD_LAT,
  }
}

/** Centre of a bbox (legacy helper, kept for compatibility). */
export function tileCentre(bbox: [number, number, number, number]): { lat: number; lon: number } {
  return {
    lat: (bbox[0] + bbox[2]) / 2,
    lon: (bbox[1] + bbox[3]) / 2,
  }
}

// ── Web Mercator XYZ tile math ────────────────────────────────────────────────

/**
 * WGS84 lat/lon → Web Mercator tile (x, y) at the given zoom level.
 * Matches the standard OSM/TMS tile numbering used by the engine pipeline.
 */
export function latLonToTileXY(lat: number, lon: number, z: number): { x: number; y: number } {
  const n = 2 ** z
  const x = Math.floor((lon + 180) / 360 * n)
  const latRad = lat * Math.PI / 180
  const y = Math.floor(
    (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n,
  )
  return { x, y }
}

/**
 * Web Mercator tile (z, x, y) → WGS84 centre of that tile.
 * Used to compute Three.js world offsets for each tile without a manifest entry.
 */
export function tileXYToLatLon(z: number, x: number, y: number): { lat: number; lon: number } {
  const n = 2 ** z
  const lon = (x + 0.5) / n * 360 - 180
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 0.5) / n)))
  return { lat: latRad * 180 / Math.PI, lon }
}

/**
 * From a tileset bounds array [lonW, latS, lonE, latN] and a zoom level,
 * compute the rectangular range of valid (x, y) tile indices.
 * Clients iterate this range to build descriptors without a per-tile manifest.
 */
export function boundsToTileRange(
  bounds: [number, number, number, number],
  z: number,
): { xMin: number; xMax: number; yMin: number; yMax: number } {
  const [lonW, latS, lonE, latN] = bounds
  const nw = latLonToTileXY(latN, lonW, z)
  const se = latLonToTileXY(latS, lonE, z)
  return { xMin: nw.x, xMax: se.x, yMin: nw.y, yMax: se.y }
}
