// @ts-nocheck
"use client"

import { DialRoot, useDialKit } from "dialkit"
import "dialkit/styles.css"
import { useMemo } from "react"
import { WebGPUScene } from "@/components/webgpu/webgpu-scene"
import { WebGPUSketch } from "@/components/webgpu/webgpu-sketch"
import { alteHaas } from "@/lib/fonts"
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

    // ink
    u.inkEnabled.value = 1
    u.warpStrength.value = 0.5
    u.noiseScale.value = 3.6
    u.noiseSpeed.value = 0

    // threshold
    u.thresholdEnabled.value = 0
    u.threshold.value = 0.91
    u.softness.value = 0.36
    u.thresholdNoise.value = 0.46

    // blur
    u.blurEnabled.value = 0
    u.blurStrength.value = 0.04
    u.blurAngle.value = 0
    u.blurSamples.value = 12

    // grain
    u.grainEnabled.value = 0
    u.grainIntensity.value = 0.08
    u.grainScale.value = 8

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

  const params = useDialKit("Shader Text", {
    text: {
      value: {
        type: "text",
        default: "codrops",
        placeholder: "Type something…",
      },
      fontSize: [0.24, 0.05, 0.6],
      letterSpacing: [-0.12, -0.3, 0.3],
    },
    palette: {
      textColor: "#282828",
      bgColor: "#BCBDB8",
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
      grid: [200, 32, 400],
      radius: [0.05, 0.001, 0.5],
      strength: [0.71, 0, 3],
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
  })

  // Sync palette dials → shader uniforms each render
  applyHex(uniforms.coreColor, params.palette.textColor)
  applyHex(uniforms.midColor, params.palette.textColor)
  applyHex(uniforms.edgeColor, params.palette.textColor)
  applyHex(uniforms.bgColor, params.palette.bgColor)

  // Sync trail dials → shader uniforms each render
  uniforms.trailEnabled.value = params.trail.enabled ? 1 : 0
  uniforms.trailIntensity.value = params.trail.intensity
  uniforms.trailBlurRadius.value = params.trail.blurRadius
  applyHex(uniforms.trailColorLow, params.trail.colorLow)
  applyHex(uniforms.trailColorMid, params.trail.colorMid)
  applyHex(uniforms.trailColorHigh, params.trail.colorHigh)

  const trailTex = useGridTrailTexture({
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
      <div className="h-dvh w-screen bg-black">
        <WebGPUScene>
          <Sketch />
        </WebGPUScene>
      </div>
      <DialRoot position="top-right" defaultOpen={false} />
    </>
  )
}
