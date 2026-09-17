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
  TUTORIAL_TEXT,
} from "@/components/tutorial/config"
import { alteHaas } from "@/lib/fonts"
import { useTextCanvasTexture } from "@/lib/tsl/shader-trail/text-texture"
import { luminance } from "@/lib/tsl/tutorial/nodes"

/**
 * Step 1 — a word on screen.
 *
 * The text is rendered to an offscreen 2D canvas (white on black) and
 * uploaded as a texture. Its luminance is a *mask*, not a colour: we use it
 * to choose between paper and ink per fragment.
 *
 * No cursor, no trail, no warp. This is the "before" every later step
 * builds on, and it's also the reduced-motion fallback — worth noticing
 * that it already looks like a finished thing standing still.
 */
export function Step1Text({
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

  const colors = useMemo(
    () => ({
      paper: uniform(hexToVec3(PALETTE.paper)),
      ink: uniform(hexToVec3(PALETTE.ink)),
    }),
    []
  )
  // Ink / paper are pickers, so write them straight into the live
  // uniforms — rebuilding the material here would recompile the shader.
  applyHex(colors.ink, ink)
  applyHex(colors.paper, paper)

  const material = useMemo(() => {
    if (!sourceTex) return null
    const node = Fn(() => {
      const source = texture(sourceTex, uv()).rgb
      const textMask = luminance(source)
      return mix(colors.paper, colors.ink, textMask)
    })()
    const m = new MeshBasicNodeMaterial()
    // biome-ignore lint/suspicious/noExplicitAny: TSL nodes are typed loosely.
    ;(m as any).colorNode = node
    return m
  }, [sourceTex, colors])

  if (!material) return null

  return (
    <mesh scale={[viewport.width, viewport.height, 1]} material={material}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  )
}
