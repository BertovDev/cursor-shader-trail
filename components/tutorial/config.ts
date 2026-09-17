import * as THREE from "three/webgpu"

/**
 * Shared constants for the tutorial steps, so every step renders the same
 * word in the same palette and only the *one* thing it introduces differs.
 */

export const TUTORIAL_TEXT = "codrops"

/** Screenprint palette: flat ink on warm paper. */
export const PALETTE = {
  paper: "#bcbdb8",
  ink: "#282828",
  /** The trail's 3-stop speed ramp: slow reads as ink, fast flashes cream. */
  trailLow: "#eb0000",
  trailMid: "#ffd70f",
  trailHigh: "#ffa600",
} as const

export const hexToVec3 = (hex: string) => {
  const v = hex.startsWith("#") ? hex.slice(1) : hex
  return new THREE.Vector3(
    Number.parseInt(v.slice(0, 2), 16) / 255,
    Number.parseInt(v.slice(2, 4), 16) / 255,
    Number.parseInt(v.slice(4, 6), 16) / 255
  )
}

/**
 * Write a hex string into an existing vec3 uniform, in place. Steps call this
 * every render so the ink / paper pickers repaint without rebuilding the
 * material (which would recompile the shader on every mouse move).
 */
export const applyHex = (
  u: { value: { set: (r: number, g: number, b: number) => void } },
  hex: string
) => {
  const c = hexToVec3(hex)
  u.value.set(c.x, c.y, c.z)
}

/** Text-canvas settings shared by every step. */
export const TEXT_OPTIONS = {
  size: 1024,
  fontSizeRatio: 0.24,
  fontWeight: 700,
  letterSpacing: -0.12,
} as const

/** Trail-field settings shared by every step from step 2 onward. */
export const TRAIL_DEFAULTS = {
  grid: 200,
  radius: 0.05,
  strength: 0.71,
  decay: 0.97,
  falloff: 2.6,
  scale: 2,
  gamma: 0.9,
  gain: 0.3,
} as const

export const WARP_STRENGTH = 0.5
export const TRAIL_BLUR_RADIUS = 0.02
export const TRAIL_INTENSITY = 4.5
export const NOISE_SCALE = 3.6
/** Per-pixel hash jitter added to the ink noise, as in `build-color-node`. */
export const THRESHOLD_NOISE = 0.46
/** Bloom on the trail: the hot core of a fast stroke. */
export const BLOOM_EDGE = 0.05
export const BLOOM_EXPONENT = 1.4
