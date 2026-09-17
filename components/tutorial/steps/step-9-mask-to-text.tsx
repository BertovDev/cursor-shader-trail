"use client"

import { useThree } from "@react-three/fiber"
import { useMemo } from "react"
import { clamp, Fn, float, mix, texture, uniform, uv, vec2 } from "three/tsl"
import { MeshBasicNodeMaterial } from "three/webgpu"
import {
  applyHex,
  BLOOM_EDGE,
  BLOOM_EXPONENT,
  hexToVec3,
  NOISE_SCALE,
  PALETTE,
  TEXT_OPTIONS,
  THRESHOLD_NOISE,
  TRAIL_BLUR_RADIUS,
  TRAIL_DEFAULTS,
  TRAIL_INTENSITY,
  TUTORIAL_TEXT,
  WARP_STRENGTH,
} from "@/components/tutorial/config"
import { alteHaas } from "@/lib/fonts"
import { useTextCanvasTexture } from "@/lib/tsl/shader-trail/text-texture"
import { type BrushName, brushes } from "@/lib/tsl/tutorial/brushes"
import {
  bloomBoost,
  blurredTrail,
  inkJitter,
  inkNoiseRaw,
  luminance,
  ramp3,
} from "@/lib/tsl/tutorial/nodes"
import {
  type FlowMode,
  useTrailField,
} from "@/lib/tsl/tutorial/use-trail-field"

/**
 * Step 9 — mask the effect to the letters. Final state.
 *
 * One `mix(1, textMask, filterToText)` and the whole thing changes
 * character. With it off, the trail is a generic cursor effect painted over
 * the page. With it on, dragging the background does nothing, and crossing a
 * letter lights it up — the type stops being a backdrop and becomes the
 * thing you're interacting with.
 *
 * That's the last idea. Everything else in the shipped effect — threshold,
 * directional smear, grain, Bayer dither, bloom — is another stage in this
 * same chain, each one a uniform away.
 */
export function Step9MaskToText({
  text = TUTORIAL_TEXT,
  brush = "hatch",
  flowMode = "velocity",
  maskToText = true,
  ink = PALETTE.ink,
  paper = PALETTE.paper,
}: {
  text?: string
  brush?: BrushName
  flowMode?: FlowMode
  maskToText?: boolean
  ink?: string
  paper?: string
}) {
  const { viewport } = useThree()
  const sourceTex = useTextCanvasTexture({
    text,
    fontFamily: alteHaas.style.fontFamily,
    ...TEXT_OPTIONS,
  })

  const trailTex = useTrailField({
    ...TRAIL_DEFAULTS,
    brush: brushes[brush],
    flowMode,
  })

  const u = useMemo(
    () => ({
      paper: uniform(hexToVec3(PALETTE.paper)),
      ink: uniform(hexToVec3(PALETTE.ink)),
      warpStrength: uniform(WARP_STRENGTH),
      blurRadius: uniform(TRAIL_BLUR_RADIUS),
      noiseScale: uniform(NOISE_SCALE),
      thresholdNoise: uniform(THRESHOLD_NOISE),
      bloomEdge: uniform(BLOOM_EDGE),
      bloomExponent: uniform(BLOOM_EXPONENT),
      trailLow: uniform(hexToVec3(PALETTE.trailLow)),
      trailMid: uniform(hexToVec3(PALETTE.trailMid)),
      trailHigh: uniform(hexToVec3(PALETTE.trailHigh)),
      trailIntensity: uniform(TRAIL_INTENSITY),
      filterToText: uniform(1),
    }),
    []
  )
  // Ink / paper are pickers, so write them straight into the live
  // uniforms — rebuilding the material here would recompile the shader.
  applyHex(u.ink, ink)
  applyHex(u.paper, paper)
  u.filterToText.value = maskToText ? 1 : 0

  const material = useMemo(() => {
    if (!(sourceTex && trailTex)) return null
    const node = Fn(() => {
      const field = blurredTrail(trailTex, uv(), u.blurRadius)
      const flow = vec2(field.r, field.g)
      const speed = clamp(field.b, 0, 1)
      const warpedUv = uv().add(flow.mul(u.warpStrength))

      const source = texture(sourceTex, warpedUv).rgb
      const textMask = luminance(source)

      // Ink: simplex noise plus a per-pixel hash jitter, then clamped. The
      // jitter is what stops the ink reading as a smooth gradient.
      const tField = inkNoiseRaw(warpedUv.mul(u.noiseScale), float(0)).add(
        inkJitter(uv(), u.thresholdNoise)
      )
      const inkBody = u.ink.mul(clamp(tField, 0, 1))
      const composed = mix(u.paper, inkBody, textMask)

      // 1 everywhere, or the text mask — the one line this step is about.
      const fxMask = mix(float(1), textMask, u.filterToText)

      // Bloom gives a fast stroke its hot core, which is most of what makes
      // the trail read as light rather than paint.
      const boost = bloomBoost(speed, u.bloomEdge, u.bloomExponent)
      const trailColor = ramp3(speed, u.trailLow, u.trailMid, u.trailHigh)
      const trail = trailColor
        .mul(speed)
        .mul(boost)
        .mul(u.trailIntensity)
        .mul(fxMask)

      return composed.add(trail)
    })()
    const m = new MeshBasicNodeMaterial()
    // biome-ignore lint/suspicious/noExplicitAny: TSL nodes are typed loosely.
    ;(m as any).colorNode = node
    return m
  }, [sourceTex, trailTex, u])

  if (!material) return null

  return (
    <mesh scale={[viewport.width, viewport.height, 1]} material={material}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  )
}
