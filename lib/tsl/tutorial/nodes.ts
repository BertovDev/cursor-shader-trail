/**
 * Shared TSL fragments for the tutorial steps.
 *
 * Each step imports only what it has introduced so far, so the code you see
 * on screen at step N is exactly step N-1 plus one idea.
 */

import {
  clamp,
  float,
  fract,
  max,
  mix,
  pow,
  smoothstep,
  texture,
  time,
  vec2,
  vec3,
} from "three/tsl"
import type * as THREE from "three/webgpu"
import { simplexNoise3d } from "@/lib/tsl/noise/simplex-noise-3d"

// biome-ignore lint/suspicious/noExplicitAny: TSL nodes are typed loosely by three.
type TslNode = any

/**
 * 9-tap Gaussian blur of the trail field (1-2-1 / 2-4-2 / 1-2-1, ÷16).
 *
 * This is mandatory, not decorative. The field is `NearestFilter` at a few
 * hundred texels, so sampling it raw gives visibly blocky, aliased warp. The
 * ordering matters: the *field* stays sharp so the brush pattern survives,
 * and the blur happens at the *read*, where you control the kernel.
 */
export function blurredTrail(
  trailTex: THREE.DataTexture,
  trailUv: TslNode,
  radius: TslNode
): TslNode {
  const r = radius
  const t00 = texture(trailTex, trailUv.add(vec2(r.negate(), r.negate())))
  const t10 = texture(trailTex, trailUv.add(vec2(0, r.negate())))
  const t20 = texture(trailTex, trailUv.add(vec2(r, r.negate())))
  const t01 = texture(trailTex, trailUv.add(vec2(r.negate(), 0)))
  const t11 = texture(trailTex, trailUv)
  const t21 = texture(trailTex, trailUv.add(vec2(r, 0)))
  const t02 = texture(trailTex, trailUv.add(vec2(r.negate(), r)))
  const t12 = texture(trailTex, trailUv.add(vec2(0, r)))
  const t22 = texture(trailTex, trailUv.add(vec2(r, r)))

  return t00
    .add(t20)
    .add(t02)
    .add(t22)
    .add(t10.mul(2))
    .add(t01.mul(2))
    .add(t21.mul(2))
    .add(t12.mul(2))
    .add(t11.mul(4))
    .div(16)
}

/** Rec. 601 luminance. Turns a white-on-black source into a 0..1 mask. */
export function luminance(color: TslNode): TslNode {
  return color.dot(vec3(0.299, 0.587, 0.114))
}

/**
 * 3D simplex noise remapped from -1..1 to 0..1, so it reads as ink density.
 *
 * `xy` is where to sample — pass the *warped* UV and the grain drags along
 * with the letterforms instead of sitting still underneath them. `z` walks
 * the third dimension, so it animates the field: 0 freezes it like real
 * print, anything else makes the ink crawl.
 */
export function inkNoiseRaw(xy: TslNode, z: TslNode): TslNode {
  const sample = (simplexNoise3d as unknown as (p: TslNode) => TslNode)(
    vec3(xy, z)
  )
  return sample.add(1).mul(0.5)
}

export function inkNoise(xy: TslNode, z: TslNode): TslNode {
  return clamp(inkNoiseRaw(xy, z), 0, 1)
}

/**
 * Per-pixel hash jitter, drifting slowly with time. Added to the ink noise
 * before it is clamped, which is what keeps the ink from reading as a smooth
 * gradient.
 */
export function inkJitter(uvNode: TslNode, amount: TslNode): TslNode {
  const seed = uvNode.add(vec2(time.mul(0.013), time.mul(0.017)))
  return fract(seed.dot(vec2(91.534, 47.871)).sin().mul(43758.5453))
    .sub(0.5)
    .mul(amount)
}

/**
 * Glow around a bright trail. `(1 - speed)` acts as a distance-like pattern,
 * so `pow(edge / pattern, exponent)` peaks where the stroke is strongest and
 * falls away into a halo. Returns a multiplier, 1 meaning no boost.
 */
export function bloomBoost(
  speed: TslNode,
  edge: TslNode,
  exponent: TslNode
): TslNode {
  const pattern = max(float(1).sub(speed), 0.001)
  return float(1).add(clamp(pow(edge.div(pattern), exponent), 0, 4))
}

/**
 * A 3-stop colour ramp indexed by `t` (0..1), built from two chained
 * smoothsteps. Used to colour the trail by speed: slow strokes sit near the
 * low stop, fast ones reach the high stop.
 */
export function ramp3(
  t: TslNode,
  low: TslNode,
  mid: TslNode,
  high: TslNode
): TslNode {
  const clamped = clamp(t, 0, 1)
  return mix(
    mix(low, mid, smoothstep(0, 0.5, clamped)),
    high,
    smoothstep(0.5, 1, clamped)
  )
}
