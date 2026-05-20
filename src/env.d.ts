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

declare module 'svarog-contracts/world-config.json' {
  interface WorldConfig {
    tile_size_m: number
    draco: boolean
    upsample_factor: number
    load_radius_tiles: number
  }
  const config: WorldConfig
  export default config
}

declare module 'svarog-contracts/game-runtime.json' {
  interface GameRuntimeKalmanConfig {
    process_noise_accel: number
    default_measurement_noise_m: number
    max_measurement_noise_m: number
    max_innovation_m: number
    initial_velocity_variance: number
  }
  interface GameRuntimeGpsConfig {
    enable_high_accuracy: boolean
    maximum_age_ms: number
    timeout_ms: number
    display_min_move_meters: number
    display_min_interval_ms: number
    kalman: GameRuntimeKalmanConfig
  }
  interface GameRuntimeCameraConfig {
    default_rotation_mode: 'sensor' | 'manual'
    min_distance: number
    max_distance: number
    min_elevation: number
    max_elevation: number
    default_distance: number
    default_elevation: number
    default_azimuth: number
    compass_calibration_deg: number
    fov: number
  }
  interface GameRuntimeTilesConfig {
    load_batch_size: number
    load_min_interval_ms: number
  }
  interface GameRuntimeConfig {
    position_min_move_meters: number
    position_update_min_interval_ms: number
    nearby_radius_meters_default: number
    gps: GameRuntimeGpsConfig
    camera: GameRuntimeCameraConfig
    tiles: GameRuntimeTilesConfig
  }
  const config: GameRuntimeConfig
  export default config
}
