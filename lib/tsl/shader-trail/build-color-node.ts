// @ts-nocheck
"use client"

/**
 * Trail-aware text shader pipeline (TSL).
 *
 * Inputs:
 *   - trailTex : THREE.DataTexture  (RGBA float, from useGridTrailTexture)
 *                R = inverted dx flow, G = dy flow, B = speed
 *   - sourceTex: THREE.CanvasTexture or DataTexture
 *                Base content sampled at the warped UV. RGB is the visible
 *                base when `inkEnabled = 0`; luminance is the text mask.
 *   - bayerTex : THREE.DataTexture  (4x4, from useBayerTexture)
 *                Used by the Bayer 4x4 ordered-dither stage.
 *   - u        : ColorNodeUniforms  (created by createColorNodeUniforms)
 *
 * Pipeline:
 *   trail (9-tap Gaussian blur)
 *   → UV warp by trail flow
 *   → sample source RGB; luminance = textMask
 *   → directional noise smear (Loop with N taps) gated by `blurEnabled`
 *   → smoothstep threshold + hash jitter gated by `thresholdEnabled`
 *   → 3-stop ink gradient (edge/mid/core) optionally overlaid via `inkEnabled`
 *   → grain (hash noise) gated by `grainEnabled`
 *   → Bayer 4x4 ordered dither gated by `ditherEnabled`
 *   → 3-stop coloured trail (low/mid/high) by speed, gated by `trailEnabled`
 *   → radial vignette gated by `vignetteEnabled`
 *
 * `filterToText` (0/1) — when 1, the post-composition effects (grain, dither,
 * trail, vignette) are masked by the source luminance so background stays
 * untouched.
 */

import {
  clamp,
  cos,
  Fn,
  float,
  floor,
  fract,
  Loop,
  mix,
  mod,
  pow,
  screenSize,
  sin,
  smoothstep,
  texture,
  time,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl"
import * as THREE from "three/webgpu"
import { simplexNoise3d } from "@/lib/tsl/noise/simplex-noise-3d"
import { bloom } from "@/lib/tsl/utils/function/bloom"

type ScalarUniform = { value: number }
type Vec3Uniform = { value: THREE.Vector3 }

export type ColorNodeUniforms = {
  warpStrength: ScalarUniform
  noiseScale: ScalarUniform
  noiseSpeed: ScalarUniform
  threshold: ScalarUniform
  softness: ScalarUniform
  thresholdNoise: ScalarUniform
  inkNoiseAmount: ScalarUniform
  blurStrength: ScalarUniform
  blurAngle: ScalarUniform
  blurSamples: ScalarUniform
  grainIntensity: ScalarUniform
  grainScale: ScalarUniform
  vignetteAmount: ScalarUniform
  textAspect: ScalarUniform
  textAspectY: ScalarUniform
  textAspectB: ScalarUniform
  textAspectBY: ScalarUniform
  imageMix: ScalarUniform
  sourceScale: ScalarUniform
  ditherOpacity: ScalarUniform
  ditherPixelSize: ScalarUniform
  ditherSpread: ScalarUniform
  ditherLevels: ScalarUniform
  trailBlurRadius: ScalarUniform
  trailIntensity: ScalarUniform
  trailBloomEnabled: ScalarUniform
  trailBloomEdge: ScalarUniform
  trailBloomExponent: ScalarUniform
  trailColorLow: Vec3Uniform
  trailColorMid: Vec3Uniform
  trailColorHigh: Vec3Uniform
  inkEnabled: ScalarUniform
  thresholdEnabled: ScalarUniform
  blurEnabled: ScalarUniform
  grainEnabled: ScalarUniform
  ditherEnabled: ScalarUniform
  vignetteEnabled: ScalarUniform
  trailEnabled: ScalarUniform
  filterToText: ScalarUniform
  introReveal: ScalarUniform
  introBlur: ScalarUniform
  coreColor: Vec3Uniform
  midColor: Vec3Uniform
  edgeColor: Vec3Uniform
  bgColor: Vec3Uniform
}

const HEX = (h: string) => {
  const v = h.startsWith("#") ? h.slice(1) : h
  const r = Number.parseInt(v.slice(0, 2), 16) / 255
  const g = Number.parseInt(v.slice(2, 4), 16) / 255
  const b = Number.parseInt(v.slice(4, 6), 16) / 255
  return new THREE.Vector3(r, g, b)
}

export function createColorNodeUniforms(): ColorNodeUniforms {
  return {
    warpStrength: uniform(0.45),
    noiseScale: uniform(1.2),
    noiseSpeed: uniform(0.36),
    threshold: uniform(0.54),
    softness: uniform(0.01),
    thresholdNoise: uniform(0.08),
    inkNoiseAmount: uniform(1),
    blurStrength: uniform(0.044),
    blurAngle: uniform(0),
    blurSamples: uniform(12),
    grainIntensity: uniform(0.3),
    grainScale: uniform(1.0),
    vignetteAmount: uniform(0.45),
    textAspect: uniform(1.0),
    textAspectY: uniform(1.0),
    textAspectB: uniform(1.0),
    textAspectBY: uniform(1.0),
    imageMix: uniform(0),
    sourceScale: uniform(1.0),
    introReveal: uniform(1),
    introBlur: uniform(0.02),
    ditherOpacity: uniform(0.17),
    ditherPixelSize: uniform(2),
    ditherSpread: uniform(0.44),
    ditherLevels: uniform(3),
    trailBlurRadius: uniform(0.01),
    trailIntensity: uniform(0.8),
    trailBloomEnabled: uniform(1),
    trailBloomEdge: uniform(0.05),
    trailBloomExponent: uniform(1.4),
    trailColorLow: uniform(HEX("#1a4d70")),
    trailColorMid: uniform(HEX("#c97a3a")),
    trailColorHigh: uniform(HEX("#fff0d4")),
    inkEnabled: uniform(1),
    thresholdEnabled: uniform(1),
    blurEnabled: uniform(1),
    grainEnabled: uniform(1),
    ditherEnabled: uniform(1),
    vignetteEnabled: uniform(1),
    trailEnabled: uniform(1),
    filterToText: uniform(0),
    coreColor: uniform(HEX("#BDBDB9")),
    midColor: uniform(HEX("#676351")),
    edgeColor: uniform(HEX("#A3A3A3")),
    bgColor: uniform(HEX("#000000")),
  }
}

// biome-ignore lint/suspicious/noExplicitAny: TSL nodes are typed loosely.
type TslNode = any

export function buildColorNode(
  trailTex: THREE.DataTexture,
  sourceTex: THREE.Texture,
  bayerTex: THREE.DataTexture,
  u: ColorNodeUniforms,
  sourceTexB?: THREE.Texture | null,
  /**
   * Optional per-fragment mix factor (TSL node, 0..1). Lets callers replace
   * the scalar `u.imageMix` uniform with a node that varies per pixel — used
   * by the image-reveal panels to drive the A→B transition through the same
   * tile-build mask as the intro reveal.
   */
  mixNode?: TslNode,
  /**
   * Optional UV node used to sample the trail texture (defaults to the
   * mesh-local `uv()`). The brush-experiment page passes `screenUV` so a
   * single mouse-driven trail texture lands at the cursor's real screen
   * position across multiple independently-positioned panels, instead of
   * repeating identically in every panel's local UV space. The source image
   * is still sampled with the warped *local* UV, so the screen-space flow
   * field displaces whichever panel the cursor is currently over.
   */
  trailUvNode?: TslNode,
  /**
   * When true, the SECOND source (sourceTexB) is sampled at the *unwarped*
   * UV instead of the flow-warped UV. Used by the brush-experiment
   * "scratch-card" reveal: the top image (A) still distorts under the brush,
   * but the image revealed underneath (B) stays clean — like scratching off a
   * coating to expose an undistorted image. No effect when sourceTexB is unset.
   */
  unwarpedB?: boolean
) {
  return Fn(() => {
    const _uv = uv()
    const trailUv = trailUvNode ?? _uv

    // ── 9-tap Gaussian blur of the trail (1,2,1 / 2,4,2 / 1,2,1)
    const r = u.trailBlurRadius
    const t00 = texture(trailTex, trailUv.add(vec2(r.negate(), r.negate())))
    const t10 = texture(trailTex, trailUv.add(vec2(0, r.negate())))
    const t20 = texture(trailTex, trailUv.add(vec2(r, r.negate())))
    const t01 = texture(trailTex, trailUv.add(vec2(r.negate(), 0)))
    const t11 = texture(trailTex, trailUv)
    const t21 = texture(trailTex, trailUv.add(vec2(r, 0)))
    const t02 = texture(trailTex, trailUv.add(vec2(r.negate(), r)))
    const t12 = texture(trailTex, trailUv.add(vec2(0, r)))
    const t22 = texture(trailTex, trailUv.add(vec2(r, r)))
    const trailBlurred = t00
      .add(t20)
      .add(t02)
      .add(t22)
      .add(t10.mul(2))
      .add(t01.mul(2))
      .add(t21.mul(2))
      .add(t12.mul(2))
      .add(t11.mul(4))
      .div(16)
    const flow = vec2(trailBlurred.r, trailBlurred.g)
    const speed = clamp(trailBlurred.b, 0, 1)

    // ── Warp UVs by the trail flow
    const warpedUv = _uv.add(flow.mul(u.warpStrength))

    // ── Sample the source texture at the warped + scaled UV. When a second
    // source is provided, sample it with its own aspect ratio and crossfade
    // by `imageMix` (0 = A only, 1 = B only).
    const centered = warpedUv.sub(0.5).mul(u.sourceScale)
    const textUv = vec2(
      centered.x.mul(u.textAspect),
      centered.y.mul(u.textAspectY)
    ).add(0.5)
    // Letters resolve out of a blur as the reveal passes. The radius is tied
    // to the remaining progress, so it collapses to zero — and the five taps
    // to a single sharp one — exactly when the intro lands.
    const introBlurRadius = u.introBlur.mul(float(1).sub(u.introReveal)).max(0)
    const tapAt = (ox: number, oy: number) =>
      texture(sourceTex, textUv.add(vec2(ox, oy).mul(introBlurRadius))).rgb
    const sourceColorA = tapAt(0, 0)
      .add(tapAt(1, 1))
      .add(tapAt(-1, 1))
      .add(tapAt(1, -1))
      .add(tapAt(-1, -1))
      .div(5)
    const sourceColor = sourceTexB
      ? (() => {
          // Scratch-card: sample B at the clean (unwarped) UV so the revealed
          // image stays undistorted, while A keeps the flow warp.
          const centeredB = unwarpedB
            ? _uv.sub(0.5).mul(u.sourceScale)
            : centered
          const textUvB = vec2(
            centeredB.x.mul(u.textAspectB),
            centeredB.y.mul(u.textAspectBY)
          ).add(0.5)
          const sourceSampleB = texture(sourceTexB, textUvB)
          const mixFactor = clamp(mixNode ?? u.imageMix, 0, 1)
          return mix(sourceColorA, sourceSampleB.rgb, mixFactor)
        })()
      : sourceColorA
    const textMaskRaw = sourceColor.dot(vec3(0.299, 0.587, 0.114))

    // ── Directional smear ("Progressive Blur") of the noise field
    const dirX = cos(u.blurAngle)
    const dirY = sin(u.blurAngle)
    const accum = vec3(0, 0, 0).toVar()
    const totalWeight = float(0).toVar()
    const samples = u.blurSamples.toInt()
    Loop({ start: 0, end: samples, type: "int" }, ({ i }) => {
      const t = float(i).div(float(samples).sub(1).max(1))
      const offset = t.sub(0.5).mul(u.blurStrength)
      const offUv = warpedUv.add(vec2(dirX.mul(offset), dirY.mul(offset)))
      const n = simplexNoise3d(
        vec4(offUv.mul(u.noiseScale), time.mul(u.noiseSpeed), 0)
      )
      const w = float(1)
      accum.addAssign(vec3(n, n, n).mul(w))
      totalWeight.addAssign(w)
    })
    const noiseBlurredOn = accum.div(totalWeight.max(1)).x.add(1).mul(0.5)
    const noiseCentre = simplexNoise3d(
      vec4(warpedUv.mul(u.noiseScale), time.mul(u.noiseSpeed), 0)
    )
      .add(1)
      .mul(0.5)
    const noiseBlurred = mix(noiseCentre, noiseBlurredOn, u.blurEnabled)

    // ── Intro reveal: a plain fade of the letterforms. `introReveal` walks
    // 0 to 1 on load and sits at 1 afterwards, so this costs nothing once the
    // animation has landed.
    const introMask = clamp(u.introReveal, 0, 1)
    const textMask = textMaskRaw.mul(introMask)


    // ── Threshold with per-fragment hash jitter
    const jitterSeed = _uv.add(vec2(time.mul(0.013), time.mul(0.017)))
    const jitter = fract(
      jitterSeed.dot(vec2(91.534, 47.871)).sin().mul(43758.5453)
    )
      .sub(0.5)
      .mul(u.thresholdNoise)
    const tField = noiseBlurred.add(jitter)
    const lo = u.threshold.sub(u.softness)
    const hi = u.threshold.add(u.softness)
    const inkThresholded = smoothstep(lo, hi, tField)
    const inkRaw = clamp(tField, 0, 1)
    const inkShaded = mix(inkRaw, inkThresholded, u.thresholdEnabled)
    // `inkNoiseAmount` fades the whole letter treatment out. At 0 the ink is a
    // flat fill; at 1 the noise and jitter are at full strength. Turning
    // `inkEnabled` off instead would fall through to the raw source sample,
    // which is the white-on-black mask, not what anyone wants to see.
    const ink = mix(float(1), inkShaded, u.inkNoiseAmount)

    // ── 3-stop ink gradient (edge → mid → core), optionally overlaid
    const tFade = mix(float(1), clamp(tField, 0, 1), u.inkNoiseAmount)
    const stop1 = smoothstep(0.0, 0.5, tFade)
    const stop2 = smoothstep(0.5, 1.0, tFade)
    const inkBody = mix(mix(u.edgeColor, u.midColor, stop1), u.coreColor, stop2)
    const inkOverlay = mix(u.bgColor, inkBody.mul(ink), textMask)
    const composed = mix(sourceColor, inkOverlay, u.inkEnabled)

    // ── Filter-to-text mask: 1 globally, or textMask if filterToText = 1
    const fxMask = mix(float(1), textMask, u.filterToText)

    // ── Grain (hash-noise, scaled, time-jittered)
    const grainUv = _uv.mul(u.grainScale).add(vec2(time, time.mul(0.7)))
    const grain = fract(
      grainUv.dot(vec2(12.9898, 78.233)).sin().mul(43758.5453)
    )
    const grainShift = grain
      .sub(0.5)
      .mul(u.grainIntensity)
      .mul(u.grainEnabled)
      .mul(fxMask)
    const withGrain = composed.add(vec3(grainShift, grainShift, grainShift))

    // ── Bayer 4x4 ordered dither
    const pixelCoord = uv().mul(screenSize).div(u.ditherPixelSize.max(1))
    const cell = mod(floor(pixelCoord), 4)
    const bayerUv = cell.add(0.5).div(4)
    const bayerVal = texture(bayerTex, bayerUv).r
    const bias = bayerVal.sub(0.5).mul(u.ditherSpread)
    const biased = withGrain.add(vec3(bias, bias, bias))
    const lvl = u.ditherLevels.max(2)
    const lvlMinusOne = lvl.sub(1)
    const quantized = floor(biased.mul(lvlMinusOne).add(0.5)).div(lvlMinusOne)
    const dithered = mix(
      withGrain,
      quantized,
      u.ditherOpacity.mul(u.ditherEnabled).mul(fxMask)
    )

    // ── 3-stop coloured trail by speed
    const tSpeed = clamp(speed, 0, 1)
    const tLowMid = smoothstep(0, 0.5, tSpeed)
    const tMidHigh = smoothstep(0.5, 1, tSpeed)
    const trailColor = mix(
      mix(u.trailColorLow, u.trailColorMid, tLowMid),
      u.trailColorHigh,
      tMidHigh
    )

    // ── Bloom: glow around bright trail. Use (1 - speed) as the distance-like
    // pattern; bloom() returns pow(edge / pattern, exponent), so brightness
    // peaks where the brush stamp is strongest and falls off into a halo.
    const bloomPattern = float(1).sub(tSpeed).max(0.001).toVar()
    const bloomGlow = clamp(
      bloom(bloomPattern, u.trailBloomEdge, u.trailBloomExponent),
      0,
      4
    )
    const trailBoost = mix(
      float(1),
      float(1).add(bloomGlow),
      u.trailBloomEnabled
    )
    const trailContribution = trailColor
      .mul(tSpeed)
      .mul(trailBoost)
      .mul(u.trailIntensity)
      .mul(u.trailEnabled)
      .mul(fxMask)
    // Chain trail on top of the fully processed colour (composed → grain →
    // dither). Using `sourceColor` here would discard every upstream stage
    // and only blend the trail with the raw texture sample.
    const lifted = dithered.add(trailContribution)

    // ── Radial vignette
    const cv = _uv.sub(0.5)
    const dist = cv.dot(cv).mul(2)
    const vig = clamp(float(1).sub(dist.mul(u.vignetteAmount)), 0, 1)
    const vigBaseOrOne = mix(float(1), pow(vig, float(1.4)), u.vignetteEnabled)
    const vigFactor = mix(float(1), vigBaseOrOne, fxMask)

    return lifted
  })()
}
