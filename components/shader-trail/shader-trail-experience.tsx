// @ts-nocheck
"use client"

import { useFrame } from "@react-three/fiber"
import { DialRoot, useDialKit } from "dialkit"
import "dialkit/styles.css"
import { useEffect, useMemo, useRef } from "react"
import { WebGPUScene } from "@/components/webgpu/webgpu-scene"
import { WebGPUSketch } from "@/components/webgpu/webgpu-sketch"
import { alteHaas } from "@/lib/fonts"
import { PAPER } from "@/lib/palette"
import {
  type BrushShape,
  useGridTrailTexture,
} from "@/lib/tsl/interactivity/use-grid-trail-texture"
import { useBayerTexture } from "@/lib/tsl/shader-trail/bayer-texture"
import {
  buildColorNode,
  createColorNodeUniforms,
} from "@/lib/tsl/shader-trail/build-color-node"
import { useTextCanvasTexture } from "@/lib/tsl/shader-trail/text-texture"

const hexToRgb = (hex: string): [number, number, number] => {
  const v = hex.startsWith("#") ? hex.slice(1) : hex
  return [
    Number.parseInt(v.slice(0, 2), 16) / 255,
    Number.parseInt(v.slice(2, 4), 16) / 255,
    Number.parseInt(v.slice(4, 6), 16) / 255,
  ]
}

const applyHex = (
  u: { value: { set: (r: number, g: number, b: number) => void } },
  hex: string
) => {
  const [r, g, b] = hexToRgb(hex)
  u.value.set(r, g, b)
}

function Sketch() {
  // Uniforms created once. Hardcode every non-trail dial here so they're
  // still applied to the shader but invisible to the panel.
  const uniforms = useMemo(() => {
    const u = createColorNodeUniforms()

    // filterToText
    u.filterToText.value = 1

    // ink — amount / scale / speed / grain all come from the `letters` dials
    u.inkEnabled.value = 1
    u.warpStrength.value = 0.5

    // threshold
    u.thresholdEnabled.value = 0
    u.threshold.value = 0.91
    u.softness.value = 0.36

    // blur
    u.blurEnabled.value = 0
    u.blurStrength.value = 0.04
    u.blurAngle.value = 0
    u.blurSamples.value = 12

    // dither
    u.ditherEnabled.value = 0
    u.ditherOpacity.value = 0.36
    u.ditherPixelSize.value = 1
    u.ditherSpread.value = 0.4
    u.ditherLevels.value = 3

    // vignette
    u.vignetteEnabled.value = 1
    u.vignetteAmount.value = 1.5

    // palette — driven by the `palette` dials below. All three ink stops share
    // the text colour so the gradient stays uniform; the noise / grain /
    // dither stages still modulate it on top.

    return u
  }, [])

  // Declared ahead of the panel so the Replay action can reset it.
  const introT = useRef(0)

  const params = useDialKit("Shader Text", {
    text: {
      value: {
        type: "text",
        default: "codrops",
        placeholder: "Type something…",
      },
      fontSize: [0.24, 0.05, 0.6],
      letterSpacing: [-0.12, -0.3, 0.3],
      // Longer text wraps onto this many lines before it shrinks to fit.
      maxLines: [2, 1, 3, 1],
    },
    intro: {
      enabled: true,
      replay: { type: "action", label: "Replay" },
      duration: [1.4, 0.2, 8],
      // How far the letters start out of focus. Collapses to sharp on land.
      blur: [0.01, 0, 0.12],
      // The virtual cursor's path while the intro runs. Direction is in
      // degrees — 0 is left to right, 90 is bottom to top — and wave is how
      // far it swings across that line.
      direction: [15, 0, 360, 15],
      wave: [0.2, 0, 1],
    },
    palette: {
      textColor: "#282828",
      bgColor: PAPER,
    },
    letters: {
      // 0 = flat ink, 1 = the full noisy treatment
      noiseAmount: [1, 0, 1],
      noiseScale: [3, 0.2, 20],
      noiseSpeed: [0, 0, 2],
      // per-pixel hash jitter on top of the noise
      grain: [0.46, 0, 1],
      filmGrain: false,
      filmGrainAmount: [0.08, 0, 0.5],
      filmGrainScale: [8, 1, 40],
    },
    trail: {
      enabled: true,
      intensity: [4.5, 0, 5],
      blurRadius: [0.02, 0, 0.1],
      colorLow: "#eb0000",
      colorMid: "#ffd70f",
      colorHigh: "#ffa600",
    },
    cursor: {
      shape: {
        type: "select",
        default: "crossSquareCorner",
        options: [
          "circle",
          "hatch",
          "corner",
          "crossSquareCorner",
          "cross",
          "star",
        ],
      },
      filter: {
        type: "select",
        default: "nearest",
        options: ["nearest", "linear"],
      },
      grid: [202, 32, 400],
      radius: [0.05, 0.001, 0.5],
      strength: [0.7, 0, 3],
      decay: [0.97, 0, 1],
      influenceGain: [0.3, 0, 3],
      influenceGamma: [0.9, 0.1, 3],
      brushRepeat: [6, 1, 24],
      brushThickness: [0.44, 0, 1],
      brushFalloff: [2.6, 0.1, 10],
      brushScale: [2, 0, 20],
      patternSize: [0.25, 0, 1],
      patternThickness: [0.1, 0, 1],
      patternWidth: [0.92, 0, 1],
    },
  },
  {
    onAction: (action) => {
      if (action.endsWith("replay")) introT.current = 0
    },
  })

  // Sync palette dials → shader uniforms each render
  applyHex(uniforms.coreColor, params.palette.textColor)
  applyHex(uniforms.midColor, params.palette.textColor)
  applyHex(uniforms.edgeColor, params.palette.textColor)
  applyHex(uniforms.bgColor, params.palette.bgColor)

  // Sync letter dials → shader uniforms each render
  uniforms.inkNoiseAmount.value = params.letters.noiseAmount
  uniforms.noiseScale.value = params.letters.noiseScale
  uniforms.noiseSpeed.value = params.letters.noiseSpeed
  uniforms.thresholdNoise.value = params.letters.grain
  uniforms.grainEnabled.value = params.letters.filmGrain ? 1 : 0
  uniforms.grainIntensity.value = params.letters.filmGrainAmount
  uniforms.grainScale.value = params.letters.filmGrainScale

  // Sync trail dials → shader uniforms each render
  uniforms.trailEnabled.value = params.trail.enabled ? 1 : 0
  uniforms.trailIntensity.value = params.trail.intensity
  uniforms.trailBlurRadius.value = params.trail.blurRadius
  applyHex(uniforms.trailColorLow, params.trail.colorLow)
  applyHex(uniforms.trailColorMid, params.trail.colorMid)
  applyHex(uniforms.trailColorHigh, params.trail.colorHigh)

  // ── Intro reveal. Driven off useFrame rather than a timer so it starts on
  // the first rendered frame — the canvas sits at frameloop "never" until the
  // WebGPU renderer finishes its async init, and a timer would burn most of
  // the animation against a blank canvas.
  // Retyping replays it, as does the panel's Replay button.
  useEffect(() => {
    introT.current = 0
  }, [params.text.value])

  // While the intro runs this stands in for the mouse, so the trail comes
  // from the real field — same brush, grid, decay and colour ramp as hovering.
  // Cleared on the last frame, which hands control straight back to the
  // pointer. Note this useFrame is registered before useGridTrailTexture's,
  // so the override is always in place before the field reads it.
  const introPointer = useRef<{ x: number; y: number } | null>(null)

  useFrame((_, delta) => {
    if (!params.intro.enabled) {
      introPointer.current = null
      uniforms.introReveal.value = 1
      return
    }
    if (introT.current >= 1) {
      introPointer.current = null
      uniforms.introReveal.value = 1
      return
    }
    const d = Math.max(params.intro.duration, 0.0001)
    introT.current = Math.min(1, introT.current + delta / d)
    const p = introT.current

    // The fade and the cursor want different curves. smoothstep spreads the
    // opacity evenly across the whole duration — easeOutCubic put it at 0.9
    // by the halfway point, which read as a flash rather than a fade.
    uniforms.introReveal.value = p * p * (3 - 2 * p)

    // The cursor keeps easeOutCubic, so it still leaves fast and settles.
    const t = 1 - (1 - p) ** 3

    // Walk the cursor across the canvas along `direction`, swinging along
    // the perpendicular. The letters fade in underneath it, so the trail is
    // what gives the intro its movement.
    const rad = (params.intro.direction * Math.PI) / 180
    const dirX = Math.cos(rad)
    const dirY = Math.sin(rad)
    const span = Math.abs(dirX) + Math.abs(dirY)
    const swing = Math.sin(t * Math.PI * 2) * params.intro.wave * 0.5

    // UV space: x right, y up.
    const uvX = 0.5 + dirX * (t - 0.5) * span - dirY * swing
    const uvY = 0.5 + dirY * (t - 0.5) * span + dirX * swing

    // Pointer space is [0, 2] with 0 at the left/top edge, so y flips.
    introPointer.current = { x: uvX * 2, y: (1 - uvY) * 2 }
  })
  uniforms.introBlur.value = params.intro.blur

  const trailTex = useGridTrailTexture({
    pointerOverrideRef: introPointer,
    grid: params.cursor.grid,
    radius: params.cursor.radius,
    strength: params.cursor.strength,
    decay: params.cursor.decay,
    influenceGain: params.cursor.influenceGain,
    influenceGamma: params.cursor.influenceGamma,
    brushShape: params.cursor.shape as BrushShape,
    filter: params.cursor.filter,
    brushRepeat: params.cursor.brushRepeat,
    brushThickness: params.cursor.brushThickness,
    brushFalloff: params.cursor.brushFalloff,
    brushScale: params.cursor.brushScale,
    patternSize: params.cursor.patternSize,
    patternThickness: params.cursor.patternThickness,
    patternWidth: params.cursor.patternWidth,
  })

  const sourceTex = useTextCanvasTexture({
    text: params.text.value,
    size: 1024,
    fontSizeRatio: params.text.fontSize,
    fontWeight: 700,
    letterSpacing: params.text.letterSpacing,
    fontFamily: alteHaas.style.fontFamily,
    maxLines: Math.round(params.text.maxLines),
  })

  const bayerTex = useBayerTexture()

  const colorNode = useMemo(() => {
    if (!(trailTex && sourceTex)) return null
    return buildColorNode(trailTex, sourceTex, bayerTex, uniforms)
  }, [trailTex, sourceTex, bayerTex, uniforms])

  if (!colorNode) return null
  return <WebGPUSketch colorNode={colorNode} />
}

export default function ShaderTrailExperience() {
  return (
    <>
      {/* Fills the stage from app/page.tsx rather than the viewport. Paper,
          not black: the canvas shows nothing between mount and the WebGPU
          renderer's first frame, and whatever is behind it is what you see. */}
      <div className="size-full" style={{ background: PAPER }}>
        <WebGPUScene>
          <Sketch />
        </WebGPUScene>
      </div>
      <DialRoot position="top-right" defaultOpen={false} />
    </>
  )
}
