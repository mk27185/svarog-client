/**
 * Runtime theme for the tile viewer (terrain SDF shader, buildings, scene, post-processing).
 */

export interface HighwayColorStop {
  /** 0–1, matches SDF G channel (importance from sdf_generator.py). */
  t: number
  color: string
}

/** Shangri-La / terrain-demo atmosphere (#efd1b5 from three.js webgl_geometry_terrain). */
export const DEFAULT_ATMOSPHERE = '#efd1b5'

export interface TileViewerTheme {
  terrainLow: string
  terrainHigh: string
  roadDark: string
  roadLight: string
  water: string
  river: string
  green: string
  rail: string
  useHighwayPalette: boolean
  highwayStops: HighwayColorStop[]
  building: string
  showNavmeshDebug: boolean
  /** Horizon + fog — keep equal to `fog` for seamless sky. */
  sky: string
  fog: string
  fogNear: number
  fogFar: number
  fogDensity: number
  turbidity: number
  rayleigh: number
  cloudCoverage: number
  cloudBrightness: number
  sunElevation: number
  sunAzimuth: number
  skyAmbientScale: number
  groundAmbientScale: number
  ambientIntensity: number
  sunIntensity: number
  sunColor: string
  exposure: number
  saturation: number
  contrast: number
  vignette: number
}

export const DEFAULT_HIGHWAY_STOPS: HighwayColorStop[] = [
  { t: 0.10, color: '#7a6c5e' },
  { t: 0.30, color: '#8a7c6e' },
  { t: 0.40, color: '#847a6e' },
  { t: 0.55, color: '#7e7468' },
  { t: 0.65, color: '#786e62' },
  { t: 0.72, color: '#72685c' },
  { t: 0.88, color: '#a89888' },
  { t: 1.00, color: '#c4b4a4' },
]

export const DEFAULT_TILE_VIEWER_THEME: TileViewerTheme = {
  terrainLow:  '#8f5e42',
  terrainHigh: '#c9a87a',
  roadDark:    '#6e5c4e',
  roadLight:   '#a0907e',
  water:       '#9aa89c',
  river:       '#8e9a92',
  green:       '#9a8f72',
  rail:        '#6a5e54',
  useHighwayPalette: false,
  showNavmeshDebug: false,
  highwayStops: DEFAULT_HIGHWAY_STOPS.map((s) => ({ ...s })),
  building:    '#847566',
  sky:         DEFAULT_ATMOSPHERE,
  fog:         DEFAULT_ATMOSPHERE,
  fogNear:     2000,
  fogFar:      4500,
  fogDensity:  0.0015,
  turbidity:   2,
  rayleigh:    1.5,
  cloudCoverage: 0,
  cloudBrightness: 0,
  sunElevation: 55,
  sunAzimuth:   140,
  skyAmbientScale: 1.0,
  groundAmbientScale: 1.0,
  ambientIntensity: 1.05,
  sunIntensity:     0.28,
  sunColor:         '#fff8f0',
  exposure:    1.0,
  saturation:  0.88,
  contrast:    0.92,
  vignette:    0.08,
}

const STORAGE_KEY = 'svarog.tileViewer.theme'

export function hexToVec3(hex: string): [number, number, number] {
  if (!hex || typeof hex !== 'string') return [0.94, 0.82, 0.71]
  const h = hex.replace('#', '')
  const n = h.length === 3
    ? h.split('').map((c) => parseInt(c + c, 16))
    : [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
  return [n[0]! / 255, n[1]! / 255, n[2]! / 255]
}

export function hexToColor(hex: string): number {
  return parseInt(hex.replace('#', ''), 16)
}

export function loadThemeFromStorage(): Partial<TileViewerTheme> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as Partial<TileViewerTheme>
  } catch {
    return null
  }
}

export function saveThemeToStorage(theme: TileViewerTheme): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(theme))
  } catch {
    /* quota / private mode */
  }
}

const NUMERIC_THEME_KEYS: (keyof TileViewerTheme)[] = [
  'fogNear', 'fogFar', 'fogDensity', 'turbidity', 'rayleigh', 'cloudCoverage', 'cloudBrightness',
  'sunElevation', 'sunAzimuth', 'skyAmbientScale', 'groundAmbientScale',
  'ambientIntensity', 'sunIntensity', 'exposure', 'saturation', 'contrast', 'vignette',
]

function normalizeTheme(theme: TileViewerTheme): TileViewerTheme {
  for (const key of NUMERIC_THEME_KEYS) {
    const v = theme[key]
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      const fallback = DEFAULT_TILE_VIEWER_THEME[key] as number
      Object.assign(theme, { [key]: fallback })
    }
  }
  if (!Array.isArray(theme.highwayStops) || theme.highwayStops.length === 0) {
    theme.highwayStops = DEFAULT_HIGHWAY_STOPS.map((s) => ({ ...s }))
  }
  return theme
}

export function mergeTheme(partial: Partial<TileViewerTheme>): TileViewerTheme {
  const base = { ...DEFAULT_TILE_VIEWER_THEME, highwayStops: DEFAULT_HIGHWAY_STOPS.map((s) => ({ ...s })) }
  const merged = { ...base, ...partial }
  if (partial.highwayStops) {
    merged.highwayStops = partial.highwayStops.map((s) => ({ ...s }))
  }
  if (partial.fog) merged.sky = partial.fog
  if (partial.sky && !partial.fog) merged.fog = partial.sky
  return normalizeTheme(merged)
}
