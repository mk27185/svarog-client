/**
 * Constant-velocity Kalman filter for GPS position in local world metres (X/Z).
 * State: [x, z, vx, vz]. Measurements: [x, z] with noise from GPS accuracy.
 */

export interface GpsKalmanConfig {
  /** Expected acceleration noise (m/s²) — drives process uncertainty. */
  process_noise_accel: number
  /** Fallback measurement std dev (m) when GPS reports no accuracy. */
  default_measurement_noise_m: number
  /** Cap on measurement std dev (m). */
  max_measurement_noise_m: number
  /** Reject GPS fixes whose innovation exceeds this distance (m). */
  max_innovation_m: number
  /** Initial variance on velocity components (m²/s²). */
  initial_velocity_variance: number
}

export interface GpsKalmanFilter {
  isInitialized(): boolean
  reset(): void
  correct(x: number, z: number, accuracyM: number, forceSnap?: boolean): boolean
  predict(dtSeconds: number): void
  getPosition(): { x: number; z: number }
  getVelocity(): { vx: number; vz: number }
}

type Mat4 = [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
]

function mat4Identity(): Mat4 {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]
}

function mat4Mul(a: Mat4, b: Mat4): Mat4 {
  const r = new Array<number>(16)
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      let sum = 0
      for (let k = 0; k < 4; k++) sum += a[row * 4 + k]! * b[k * 4 + col]!
      r[row * 4 + col] = sum
    }
  }
  return r as unknown as Mat4
}

function mat4Transpose(m: Mat4): Mat4 {
  return [
    m[0]!, m[4]!, m[8]!,  m[12]!,
    m[1]!, m[5]!, m[9]!,  m[13]!,
    m[2]!, m[6]!, m[10]!, m[14]!,
    m[3]!, m[7]!, m[11]!, m[15]!,
  ]
}

function mat4Add(a: Mat4, b: Mat4): Mat4 {
  return a.map((v, i) => v + b[i]!) as unknown as Mat4
}

function processNoise(dt: number, sigmaA: number): Mat4 {
  const dt2 = dt * dt
  const dt3 = dt2 * dt
  const dt4 = dt2 * dt2
  const q = sigmaA * sigmaA
  return [
    dt4 / 4 * q, 0,           dt3 / 2 * q, 0,
    0,           dt4 / 4 * q, 0,           dt3 / 2 * q,
    dt3 / 2 * q, 0,           dt2 * q,     0,
    0,           dt3 / 2 * q, 0,           dt2 * q,
  ]
}

function invert2x2(a: number, b: number, c: number, d: number): [number, number, number, number] | null {
  const det = a * d - b * c
  if (Math.abs(det) < 1e-12) return null
  const invDet = 1 / det
  return [d * invDet, -b * invDet, -c * invDet, a * invDet]
}

export function createGpsKalmanFilter(config: GpsKalmanConfig): GpsKalmanFilter {
  let initialized = false
  const state = [0, 0, 0, 0] // x, z, vx, vz
  let P: Mat4 = mat4Identity()

  function measurementNoise(accuracyM: number): number {
    const std = Math.min(
      config.max_measurement_noise_m,
      Math.max(config.default_measurement_noise_m, accuracyM > 0 ? accuracyM : config.default_measurement_noise_m),
    )
    return std * std
  }

  function reset() {
    initialized = false
    state.fill(0)
    P = mat4Identity()
  }

  function correct(x: number, z: number, accuracyM: number, forceSnap = false): boolean {
    if (!initialized || forceSnap) {
      state[0] = x
      state[1] = z
      state[2] = 0
      state[3] = 0
      P = mat4Identity()
      P[0] = measurementNoise(accuracyM)
      P[5] = measurementNoise(accuracyM)
      P[10] = config.initial_velocity_variance
      P[15] = config.initial_velocity_variance
      initialized = true
      return true
    }

    const rVar = measurementNoise(accuracyM)
    const innovX = x - state[0]!
    const innovZ = z - state[1]!
    const innovDist = Math.hypot(innovX, innovZ)
    if (innovDist > config.max_innovation_m) return false

    // S = H P Hᵀ + R  (2×2)
    const s00 = P[0]! + rVar
    const s01 = P[1]!
    const s10 = P[4]!
    const s11 = P[5]! + rVar

    const invS = invert2x2(s00, s01, s10, s11)
    if (!invS) return false
    const [i00, i01, i10, i11] = invS

    // K = P Hᵀ S⁻¹  (4×2)
    const k00 = P[0]! * i00 + P[1]! * i10
    const k01 = P[0]! * i01 + P[1]! * i11
    const k10 = P[4]! * i00 + P[5]! * i10
    const k11 = P[4]! * i01 + P[5]! * i11
    const k20 = P[8]! * i00 + P[9]! * i10
    const k21 = P[8]! * i01 + P[9]! * i11
    const k30 = P[12]! * i00 + P[13]! * i10
    const k31 = P[12]! * i01 + P[13]! * i11

    state[0] += k00 * innovX + k01 * innovZ
    state[1] += k10 * innovX + k11 * innovZ
    state[2] += k20 * innovX + k21 * innovZ
    state[3] += k30 * innovX + k31 * innovZ

    // P = (I - K H) P
    const KH: Mat4 = [
      k00, k01, 0, 0,
      k10, k11, 0, 0,
      k20, k21, 0, 0,
      k30, k31, 0, 0,
    ]
    const I = mat4Identity()
    const IminusKH = I.map((v, idx) => v - KH[idx]!) as unknown as Mat4
    P = mat4Mul(IminusKH, P)

    return true
  }

  function predict(dtSeconds: number) {
    if (!initialized || dtSeconds <= 0) return

    const F: Mat4 = [
      1, 0, dtSeconds, 0,
      0, 1, 0,         dtSeconds,
      0, 0, 1,         0,
      0, 0, 0,         1,
    ]

    state[0] += state[2]! * dtSeconds
    state[1] += state[3]! * dtSeconds

    const FP = mat4Mul(F, P)
    const FPFt = mat4Mul(FP, mat4Transpose(F))
    P = mat4Add(FPFt, processNoise(dtSeconds, config.process_noise_accel))
  }

  return {
    isInitialized: () => initialized,
    reset,
    correct,
    predict,
    getPosition: () => ({ x: state[0]!, z: state[1]! }),
    getVelocity: () => ({ vx: state[2]!, vz: state[3]! }),
  }
}
