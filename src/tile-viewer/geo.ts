/**
 * Equirectangular approximation centred on the manifest grid origin.
 * Matches tile placement in the engine outputs (see scene.ts).
 */

export const MPD_LAT = 111_320.0

export function mpdLon(lat: number): number {
  return MPD_LAT * Math.cos((lat * Math.PI) / 180)
}

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

export function tileCentre(bbox: [number, number, number, number]): { lat: number; lon: number } {
  return {
    lat: (bbox[0] + bbox[2]) / 2,
    lon: (bbox[1] + bbox[3]) / 2,
  }
}
