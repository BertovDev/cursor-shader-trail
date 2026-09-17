"use client"

import { useFrame, useThree } from "@react-three/fiber"
import { useEffect, useRef, useState } from "react"
import * as THREE from "three/webgpu"
import {
  type BrushFn,
  type BrushParams,
  circle,
  DEFAULT_BRUSH_PARAMS,
} from "@/lib/tsl/tutorial/brushes"

/**
 * The cursor trail field.
 *
 * A small RGBA-float `DataTexture` that JavaScript writes into every frame
 * and the shader reads. No render targets, no ping-pong buffers, no compute
 * pass. At this resolution a nested `for` loop costs well under a
 * millisecond, and you can log a brush while you're designing it.
 *
 * Channel layout:
 *   R, G — flow vector (which way to push the UVs)
 *   B    — speed (how hot this spot is)
 *   A    — unused
 *
 * Three things vary independently, which is the point of the whole design:
 *   - the `brush` function decides the *shape* of each mark
 *   - `flowMode` decides the *direction* written into R/G
 *   - whatever samples the texture decides what any of it *means*
 */

export type FlowMode =
  /** Along the cursor's travel. The classic drag smear. */
  | "velocity"
  /** Outward from the brush centre. A lens or bulge. */
  | "radial"
  /** Perpendicular to radial. A swirl. */
  | "tangent"

export type UseTrailFieldOptions = {
  /** Field resolution. The decay pass is O(grid²), so this is the real knob. */
  grid?: number
  /** Brush radius, as a fraction of the field. */
  radius?: number
  /** Deposit magnitude. */
  strength?: number
  /** Per-frame survival factor, normalised to 60fps. 0 = instant, 1 = never. */
  decay?: number
  /** Radial envelope exponent. Higher = softer outer edge. */
  falloff?: number
  /** Scalar applied after envelope × pattern. */
  scale?: number
  /** Bend the speed → intensity response. >1 = slow moves stay faint. */
  gamma?: number
  /** Scales the whole deposit. The canonical effect runs at 0.3. */
  gain?: number
  brush?: BrushFn
  brushParams?: Partial<BrushParams>
  flowMode?: FlowMode
  /**
   * Keep this at "nearest". You want the brush pattern preserved in the field
   * and blurred at the *read*, where the shader controls the kernel.
   */
  filter?: "nearest" | "linear"
}

/** B is clamped so a slow scrub in one spot can't accumulate to white. */
const SPEED_SATURATION = 1

export function useTrailField(
  options: UseTrailFieldOptions = {}
): THREE.DataTexture | null {
  const {
    grid = 200,
    radius = 0.04,
    strength = 0.71,
    decay = 0.92,
    falloff = 2.6,
    scale = 2,
    gamma = 0.9,
    gain = 0.3,
    brush = circle,
    brushParams,
    flowMode = "velocity",
    filter = "nearest",
  } = options

  // Everything the frame loop reads lives in a ref, so changing a dial
  // updates the simulation on the next frame instead of rebuilding the
  // texture, which would wipe the trail history you're trying to tune.
  const live = useRef({
    radius,
    strength,
    decay,
    falloff,
    scale,
    gamma,
    gain,
    brush,
    brushParams: { ...DEFAULT_BRUSH_PARAMS, ...brushParams },
    flowMode,
  })
  live.current.radius = radius
  live.current.strength = strength
  live.current.decay = decay
  live.current.falloff = falloff
  live.current.scale = scale
  live.current.gamma = gamma
  live.current.gain = gain
  live.current.brush = brush
  live.current.brushParams = { ...DEFAULT_BRUSH_PARAMS, ...brushParams }
  live.current.flowMode = flowMode

  const textureRef = useRef<THREE.DataTexture | null>(null)
  const [texture, setTexture] = useState<THREE.DataTexture | null>(null)

  /** Last frame's cursor position, in 0..1 canvas space. */
  const prevPointerRef = useRef({ x: 0, y: 0 })
  /**
   * Set on the first frame, and again whenever the cursor leaves the canvas.
   * Leaving on one side and coming back on the other would otherwise read as a
   * single enormous velocity and paint a smear across the whole screen.
   */
  const reseedRef = useRef(true)

  const { gl } = useThree()

  useEffect(() => {
    const data = new Float32Array(4 * grid * grid)
    const tex = new THREE.DataTexture(
      data,
      grid,
      grid,
      THREE.RGBAFormat,
      THREE.FloatType
    )
    const mode = filter === "linear" ? THREE.LinearFilter : THREE.NearestFilter
    tex.minFilter = mode
    tex.magFilter = mode
    tex.needsUpdate = true
    textureRef.current = tex
    setTexture(tex)

    return () => {
      tex.dispose()
      textureRef.current = null
    }
  }, [grid, filter])

  // React Three Fiber already tracks the cursor for us, so the only listener
  // left is the one it doesn't cover: knowing when the cursor left, so we can
  // reseed instead of reading a jump as a stroke.
  useEffect(() => {
    const canvas = gl.domElement
    if (!canvas) return

    const reseed = () => {
      reseedRef.current = true
    }

    canvas.addEventListener("pointerleave", reseed)
    window.addEventListener("blur", reseed)

    return () => {
      canvas.removeEventListener("pointerleave", reseed)
      window.removeEventListener("blur", reseed)
    }
  }, [gl])

  useFrame((state, delta) => {
    const tex = textureRef.current
    if (!tex) return
    const data = tex.image.data as Float32Array
    const p = live.current

    // Frame-rate independent decay. A flat `*= decay` would fade twice as
    // fast on a 120Hz display as on a 60Hz one.
    const k = p.decay ** (delta * 60)
    for (let i = 0; i < data.length; i += 4) {
      data[i] = data[i]! * k
      data[i + 1] = data[i + 1]! * k
      data[i + 2] = data[i + 2]! * k
    }

    // R3F hands us the cursor in normalised device coordinates (-1..1),
    // already relative to the canvas and already y-up like the texture. That
    // saves a bounding-rect cache, a resize listener and a Y flip.
    const { pointer } = state
    const x = (pointer.x + 1) * 0.5
    const y = (pointer.y + 1) * 0.5

    const prev = prevPointerRef.current
    if (reseedRef.current) {
      prev.x = x
      prev.y = y
      reseedRef.current = false
      tex.needsUpdate = true
      return
    }

    // Velocity is a per-frame delta, not an event property. `pointermove`
    // fires at whatever rate the OS feels like, and we want it in step with
    // the render loop.
    const vx = (x - prev.x) * grid
    const vy = (y - prev.y) * grid
    prev.x = x
    prev.y = y

    const speed = Math.hypot(vx, vy)
    if (speed <= 0) {
      tex.needsUpdate = true
      return
    }

    // Gamma bends the response so slow movement stays faint and fast movement
    // pops, instead of the mushy linear ramp.
    const curvedSpeed = speed ** p.gamma
    const dirX = vx / speed
    const dirY = vy / speed

    const brushRadius = grid * p.radius
    const centerX = x * grid
    const centerY = y * grid

    // Only scan the cells the brush can reach. At grid=200 with radius=0.04 the
    // brush touches a ~16×16 neighbourhood, so testing all 40,000 cells every
    // frame is ~150× more work than the effect needs. That saved budget is
    // what lets you afford an expensive brush function.
    const x0 = Math.max(0, Math.floor(centerX - brushRadius))
    const x1 = Math.min(grid - 1, Math.ceil(centerX + brushRadius))
    const y0 = Math.max(0, Math.floor(centerY - brushRadius))
    const y1 = Math.min(grid - 1, Math.ceil(centerY + brushRadius))

    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const dx = cx + 0.5 - centerX
        const dy = cy + 0.5 - centerY
        const dist = Math.hypot(dx, dy)
        if (dist >= brushRadius || dist <= 0) continue

        // force = envelope × pattern × scale. The envelope and the scale
        // never change. Only the brush function does.
        const lx = dx / brushRadius
        const ly = dy / brushRadius
        const envelope = (1 - dist / brushRadius) ** p.falloff
        const pattern = p.brush(lx, ly, p.brushParams)
        const force = envelope * pattern * p.scale
        if (force <= 0) continue

        // Same brush, three different-feeling interactions.
        let flowX: number
        let flowY: number
        if (p.flowMode === "radial") {
          flowX = dx / dist
          flowY = dy / dist
        } else if (p.flowMode === "tangent") {
          flowX = -dy / dist
          flowY = dx / dist
        } else {
          // Matches the shipped effect: X is negated, Y is not. The
          // asymmetry is deliberate here only because it is what the
          // canonical `/shader-trail` version does.
          flowX = -dirX
          flowY = dirY
        }

        const magnitude = p.gain * p.strength * force * curvedSpeed
        const i = 4 * (cx + grid * cy)
        data[i] = data[i]! + magnitude * flowX
        data[i + 1] = data[i + 1]! + magnitude * flowY
        const next = data[i + 2]! + magnitude
        data[i + 2] = next > SPEED_SATURATION ? SPEED_SATURATION : next
      }
    }

    tex.needsUpdate = true
  })

  return texture
}
