/**
 * Runtime theme for the tile viewer (terrain SDF shader, buildings, scene, post-processing).
 * Defaults match the original hardcoded appearance.
 */

export interface HighwayColorStop {
  /** 0–1, matches SDF G channel (importance from sdf_generator.py). */
  t: number
  color: string
}

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
  sky: string
  fog: string
  /** @deprecated Linear fog distances; scene uses FogExp2 (fogDensity). Kept for settings UI compat. */
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
  { t: 0.10, color: '#8a8478' },
  { t: 0.30, color: '#9a9890' },
  { t: 0.40, color: '#888890' },
  { t: 0.55, color: '#787880' },
  { t: 0.65, color: '#707078' },
  { t: 0.72, color: '#686870' },
  { t: 0.88, color: '#b8b4a8' },
  { t: 1.00, color: '#d4c8b8' },
]

export const DEFAULT_TILE_VIEWER_THEME: TileViewerTheme = {
  terrainLow:  '#477a2e',
  terrainHigh: '#99804d',
  roadDark:    '#5c5c66',
  roadLight:   '#b8b3a6',
  water:       '#3d7ab8',
  river:       '#4a8fc4',
  green:       '#4a8f3c',
  rail:        '#6b6560',
  useHighwayPalette: false,
  showNavmeshDebug: false,
  highwayStops: DEFAULT_HIGHWAY_STOPS.map((s) => ({ ...s })),
  building:    '#9ba5b4',
  sky:         '#7faed0',
  fog:         '#7faed0',
  fogNear:     2000,
  fogFar:      4500,
  fogDensity:  0.00018,
  turbidity:   2,
  rayleigh:    1.5,
  cloudCoverage: 0.25,
  cloudBrightness: 0.9,
  sunElevation: 42,
  sunAzimuth:   160,
  skyAmbientScale: 0.35,
  groundAmbientScale: 1.0,
  ambientIntensity: 0.65,
  sunIntensity:     1.1,
  sunColor:         '#fff5eb',
  exposure:    0.95,
  saturation:  1.0,
  contrast:    1.0,
  vignette:    0.0,
}

const STORAGE_KEY = 'svarog.tileViewer.theme'

export function hexToVec3(hex: string): [number, number, number] {
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

/** Ensure saved theme from older builds does not leave sliders on NaN / undefined. */
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
  return normalizeTheme(merged)
}
