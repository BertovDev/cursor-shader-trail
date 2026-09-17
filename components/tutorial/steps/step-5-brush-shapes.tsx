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
import { useTrailField } from "@/lib/tsl/tutorial/use-trail-field"

/**
 * Step 5 — the brush is a function.
 *
 * Nothing in this file's shader changed from step 4. Not one line. The only
 * difference is which `BrushFn` gets handed to `useTrailField`:
 *
 *     useTrailField({ brush: brushes.hatch })
 *
 * Every brush is `envelope × pattern × scale`. The envelope (a radial fade)
 * and the scale are fixed; only `pattern` varies, and it's a pure function
 * of local brush coordinates. Ten lines in, ten lines out, completely
 * different mark on screen.
 *
 * `dots` is the one to read first — it's five lines and it composes with
 * everything else for free.
 */
export function Step5BrushShapes({
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
