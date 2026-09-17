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
import { type BrushName, brushes } from "@/lib/tsl/tutorial/brushes"
import { blurredTrail, luminance } from "@/lib/tsl/tutorial/nodes"
import {
  type FlowMode,
  useTrailField,
} from "@/lib/tsl/tutorial/use-trail-field"

/**
 * Step 6 — the second axis: which way the flow points.
 *
 * The brush decides the *shape* of the mark. It says nothing about the
 * *direction* stored in R/G, and that's a separate choice:
 *
 *   velocity — along the cursor's travel   → a drag smear
 *   radial   — outward from brush centre   → a lens / bulge
 *   tangent  — perpendicular to radial     → a swirl
 *
 * Six lines in the deposit loop, three interactions that feel nothing alike.
 * Combined with step 5, one demo covers shapes × modes rather than one look.
 */
export function Step6FlowModes({
  text = TUTORIAL_TEXT,
  brush = "hatch",
  flowMode = "velocity",
  ink = PALETTE.ink,
  paper = PALETTE.paper,
}: {
  text?: string
  brush?: BrushName
  flowMode?: FlowMode
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
      const warpedUv = uv().add(flow.mul(u.warpStrength))

      const source = texture(sourceTex, warpedUv).rgb
      const textMask = luminance(source)
      return mix(u.paper, u.ink, textMask)
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
