"use client"

import { useThree } from "@react-three/fiber"
import { useMemo } from "react"
import { Fn, float, mix, texture, time, uniform, uv, vec2 } from "three/tsl"
import { MeshBasicNodeMaterial } from "three/webgpu"
import {
  applyHex,
  hexToVec3,
  NOISE_SCALE,
  PALETTE,
  TEXT_OPTIONS,
  TRAIL_BLUR_RADIUS,
  TRAIL_DEFAULTS,
  TUTORIAL_TEXT,
  WARP_STRENGTH,
} from "@/components/tutorial/config"
import { alteHaas } from "@/lib/fonts"
import { useTextCanvasTexture } from "@/lib/tsl/shader-trail/text-texture"
import { type BrushName, brushes } from "@/lib/tsl/tutorial/brushes"
import { blurredTrail, inkNoise, luminance } from "@/lib/tsl/tutorial/nodes"
import { useTrailField } from "@/lib/tsl/tutorial/use-trail-field"

/**
 * Step 7 — fill the letters with ink.
 *
 * Flat `#282828` reads as a font. Screenprint ink doesn't: it's uneven,
 * blotchy, thinner where the mesh let less through. So we modulate the ink
 * colour by 3D simplex noise.
 *
 * The detail that sells it: the noise is sampled at `warpedUv`, the *same*
 * dragged coordinate as the text — so the grain moves with the letterforms
 * instead of sitting still while they slide underneath. Sample it at plain
 * `uv()` and it instantly reads as a filter laid on top.
 *
 * `noiseSpeed` is 0 here, so the grain is frozen like real print. Raise it
 * and the ink crawls.
 */
export function Step7Ink({
  text = TUTORIAL_TEXT,
  brush = "hatch",
  noiseSpeed = 0,
  noiseEnabled = true,
  ink = PALETTE.ink,
  paper = PALETTE.paper,
}: {
  text?: string
  brush?: BrushName
  noiseSpeed?: number
  /** Toggle the noise off to see the flat ink underneath. */
  noiseEnabled?: boolean
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
    flowMode: "velocity",
  })

  const u = useMemo(
    () => ({
      paper: uniform(hexToVec3(PALETTE.paper)),
      ink: uniform(hexToVec3(PALETTE.ink)),
      warpStrength: uniform(WARP_STRENGTH),
      blurRadius: uniform(TRAIL_BLUR_RADIUS),
      noiseScale: uniform(NOISE_SCALE),
      noiseSpeed: uniform(0),
      noiseEnabled: uniform(1),
    }),
    []
  )
  // Ink / paper are pickers, so write them straight into the live
  // uniforms — rebuilding the material here would recompile the shader.
  applyHex(u.ink, ink)
  applyHex(u.paper, paper)
  u.noiseSpeed.value = noiseSpeed
  u.noiseEnabled.value = noiseEnabled ? 1 : 0

  const material = useMemo(() => {
    if (!(sourceTex && trailTex)) return null
    const node = Fn(() => {
      const field = blurredTrail(trailTex, uv(), u.blurRadius)
      const flow = vec2(field.r, field.g)
      const warpedUv = uv().add(flow.mul(u.warpStrength))

      const source = texture(sourceTex, warpedUv).rgb
      const textMask = luminance(source)

      // Multiplying the ink by the noise can only ever darken it, so where
      // the noise dips toward 0 the letter goes almost black. That's the
      // "shadow". Toggling off swaps the noise for a flat 1.
      const noise = inkNoise(warpedUv.mul(u.noiseScale), time.mul(u.noiseSpeed))
      const inkBody = u.ink.mul(mix(float(1), noise, u.noiseEnabled))

      return mix(u.paper, inkBody, textMask)
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
