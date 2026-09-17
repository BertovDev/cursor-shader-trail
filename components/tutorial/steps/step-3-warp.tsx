"use client"

import { useThree } from "@react-three/fiber"
import { useMemo } from "react"
import { Fn, mix, texture, uniform, uv } from "three/tsl"
import { MeshBasicNodeMaterial } from "three/webgpu"
import {
  applyHex,
  hexToVec3,
  PALETTE,
  TEXT_OPTIONS,
  TRAIL_DEFAULTS,
  TUTORIAL_TEXT,
  WARP_STRENGTH,
} from "@/components/tutorial/config"
import { alteHaas } from "@/lib/fonts"
import { useTextCanvasTexture } from "@/lib/tsl/shader-trail/text-texture"
import { brushes } from "@/lib/tsl/tutorial/brushes"
import { luminance } from "@/lib/tsl/tutorial/nodes"
import { useTrailField } from "@/lib/tsl/tutorial/use-trail-field"

/**
 * Step 3 — connect the field to the image.
 *
 * Step 1 sampled the text at `uv()`. Now we sample it at
 * `uv() + flow * strength` instead. That single line is the entire warp: the
 * letters smear because each fragment is reading from somewhere the cursor
 * has dragged it.
 *
 * The field is sampled *raw* here, on purpose. It's `NearestFilter` at
 * 200×200, so the warp comes out blocky and stair-stepped — which is the
 * problem step 4 exists to solve.
 */
export function Step3Warp({
  text = TUTORIAL_TEXT,
  ink = PALETTE.ink,
  paper = PALETTE.paper,
}: {
  text?: string
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
      const flow = texture(trailTex, uv()).rg
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
