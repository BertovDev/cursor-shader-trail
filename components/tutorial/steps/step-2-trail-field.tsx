"use client"

import { useThree } from "@react-three/fiber"
import { useMemo } from "react"
import { Fn, texture, uv, vec3 } from "three/tsl"
import { MeshBasicNodeMaterial } from "three/webgpu"
import { TRAIL_DEFAULTS } from "@/components/tutorial/config"
import { brushes } from "@/lib/tsl/tutorial/brushes"
import { useTrailField } from "@/lib/tsl/tutorial/use-trail-field"

/**
 * Step 2 — the field itself, drawn raw.
 *
 * The cursor writes into a 200×200 RGBA-float `DataTexture` every frame:
 * R/G hold a flow vector, B holds speed, and the whole thing decays. Here we
 * render that texture directly to the screen with no effect on top, so you
 * can see the actual data the rest of the tutorial consumes.
 *
 * Flow is signed, so it's shown as |R| and |G| (amplified to be visible);
 * speed goes straight into blue. Nothing else is happening yet.
 */
export function Step2TrailField() {
  const { viewport } = useThree()

  const trailTex = useTrailField({
    ...TRAIL_DEFAULTS,
    brush: brushes.circle,
    flowMode: "velocity",
  })

  const material = useMemo(() => {
    if (!trailTex) return null
    const node = Fn(() => {
      const field = texture(trailTex, uv())
      return vec3(field.r.abs().mul(4), field.g.abs().mul(4), field.b)
    })()
    const m = new MeshBasicNodeMaterial()
    // biome-ignore lint/suspicious/noExplicitAny: TSL nodes are typed loosely.
    ;(m as any).colorNode = node
    return m
  }, [trailTex])

  if (!material) return null

  return (
    <mesh scale={[viewport.width, viewport.height, 1]} material={material}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  )
}
