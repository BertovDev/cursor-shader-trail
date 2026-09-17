"use client"

import { useThree } from "@react-three/fiber"
import { useMemo } from "react"
import { Fn, mix, texture, uniform, uv, vec2 } from "three/tsl"
import { MeshBasicNodeMaterial } from "three/webgpu"
import {
  applyHex,
  hexToVec3,
  PALETTE,
  TEXT_OPTIONS,
  TRAIL_BLUR_RADIUS,
  TRAIL_DEFAULTS,
  TUTORIAL_TEXT,
  WARP_STRENGTH,
} from "@/components/tutorial/config"
import { alteHaas } from "@/lib/fonts"
import { useTextCanvasTexture } from "@/lib/tsl/shader-trail/text-texture"
import { brushes } from "@/lib/tsl/tutorial/brushes"
import { blurredTrail, luminance } from "@/lib/tsl/tutorial/nodes"
import { useTrailField } from "@/lib/tsl/tutorial/use-trail-field"

/**
 * Step 4 — blur the read, not the field.
 *
 * Step 3's warp was blocky because the field is `NearestFilter`. The fix is
 * a 9-tap Gaussian (1-2-1 / 2-4-2 / 1-2-1, ÷16) applied when we *sample* it.
 *
 * Note what we did *not* do: switch the texture to `LinearFilter`. Keeping
 * the field sharp means the brush pattern in step 5 survives intact, and
 * blurring at the read leaves the kernel under our control.
 *
 * Toggle `blur` to A/B it.
 */
export function Step4Blur({
  text = TUTORIAL_TEXT,
  blur = true,
  ink = PALETTE.ink,
  paper = PALETTE.paper,
}: {
  text?: string
  blur?: boolean
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
    brush: brushes.circle,
    flowMode: "velocity",
  })

  const u = useMemo(
    () => ({
      paper: uniform(hexToVec3(PALETTE.paper)),
      ink: uniform(hexToVec3(PALETTE.ink)),
      warpStrength: uniform(WARP_STRENGTH),
      blurRadius: uniform(TRAIL_BLUR_RADIUS),
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
      const field = blur
        ? blurredTrail(trailTex, uv(), u.blurRadius)
        : texture(trailTex, uv())
      const flow = vec2(field.r, field.g)
      const warpedUv = uv().add(flow.mul(u.warpStrength))

      const source = texture(sourceTex, warpedUv).rgb
      const textMask = luminance(source)
      return mix(u.paper, u.ink, textMask)
    })()
    const m = new MeshBasicNodeMaterial()
    // biome-ignore lint/suspicious/noExplicitAny: TSL nodes are typed loosely.
    ;(m as any).colorNode = node
    return m
  }, [sourceTex, trailTex, u, blur])

  if (!material) return null

  return (
    <mesh scale={[viewport.width, viewport.height, 1]} material={material}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  )
}
