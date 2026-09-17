"use client"

import { useThree } from "@react-three/fiber"
import { useMemo } from "react"
import { clamp, Fn, float, mix, texture, uniform, uv, vec2 } from "three/tsl"
import { MeshBasicNodeMaterial } from "three/webgpu"
import {
  applyHex,
  hexToVec3,
  NOISE_SCALE,
  PALETTE,
  TEXT_OPTIONS,
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
  blurredTrail,
  inkNoise,
  luminance,
  ramp3,
} from "@/lib/tsl/tutorial/nodes"
import { useTrailField } from "@/lib/tsl/tutorial/use-trail-field"

/**
 * Step 8 — one field, a second job.
 *
 * So far only R and G have been used, for the warp. B has been sitting there
 * holding speed the whole time. Read it and you get a colour ramp for free:
 * slow strokes stay near the ink, fast ones flash cream.
 *
 * This is the payoff of packing channels deliberately. Same texture, same
 * sample, two unrelated visual results — and a third consumer (an alpha
 * reveal, a vertex displacement) would cost one more line.
 *
 * One trap worth naming: the trail is added to the *composed* colour, after
 * the ink stage. Add it to the raw texture sample instead and you silently
 * throw away every stage above it.
 */
export function Step8SpeedColor({
  text = TUTORIAL_TEXT,
  brush = "hatch",
  ink = PALETTE.ink,
  paper = PALETTE.paper,
}: {
  text?: string
  brush?: BrushName
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
      trailLow: uniform(hexToVec3(PALETTE.trailLow)),
      trailMid: uniform(hexToVec3(PALETTE.trailMid)),
      trailHigh: uniform(hexToVec3(PALETTE.trailHigh)),
      trailIntensity: uniform(TRAIL_INTENSITY),
    }),
    []
  )
  // Ink / paper are pickers, so write them straight into the live
  // uniforms — rebuilding the material here would recompile the shader.
  applyHex(u.ink, ink)
  applyHex(u.paper, paper)

  const material = useMemo(() => {
    if (!(sourceTex && trailTex)) return null
    const node = Fn(() => {
      const field = blurredTrail(trailTex, uv(), u.blurRadius)
      const flow = vec2(field.r, field.g)
      const speed = clamp(field.b, 0, 1)
      const warpedUv = uv().add(flow.mul(u.warpStrength))

      const source = texture(sourceTex, warpedUv).rgb
      const textMask = luminance(source)

      const noise = inkNoise(warpedUv.mul(u.noiseScale), float(0))
      const inkBody = u.ink.mul(noise)
      const composed = mix(u.paper, inkBody, textMask)

      // B was already there. This is the only new idea in the file.
      const trailColor = ramp3(speed, u.trailLow, u.trailMid, u.trailHigh)
      const trail = trailColor.mul(speed).mul(u.trailIntensity)

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
