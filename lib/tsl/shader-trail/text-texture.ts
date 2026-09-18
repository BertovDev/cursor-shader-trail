"use client"

import { useMemo } from "react"
import * as THREE from "three/webgpu"

export type TextTextureOptions = {
  text: string
  size?: number
  fontSizeRatio?: number
  fontWeight?: number
  letterSpacing?: number
  color?: string
  /** Optional CSS font-family string. Defaults to system sans-serif. */
  fontFamily?: string
  /** Wrap onto at most this many lines before shrinking to fit. */
  maxLines?: number
  /** Widest a line may get, as a fraction of the canvas. */
  maxWidthRatio?: number
  /** Baseline-to-baseline distance, as a multiple of the font size. */
  lineHeight?: number
}

/**
 * Renders `text` onto an offscreen square canvas and wraps it as a
 * THREE.CanvasTexture. If the font is still loading (e.g. from next/font),
 * a `document.fonts.load()` promise re-paints the canvas + flips
 * `needsUpdate` once the face is ready — so the GPU never ships a fallback
 * permanently.
 */
export function useTextCanvasTexture({
  text,
  size = 1024,
  fontSizeRatio = 0.18,
  fontWeight = 700,
  letterSpacing = -0.04,
  color = "#ffffff",
  fontFamily = "ui-sans-serif, system-ui, sans-serif",
  maxLines = 2,
  maxWidthRatio = 0.88,
  lineHeight = 1.02,
}: TextTextureOptions): THREE.CanvasTexture | null {
  return useMemo(() => {
    if (typeof document === "undefined") return null
    const canvas = document.createElement("canvas")
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext("2d")
    if (!ctx) return null

    const fontSize = size * fontSizeRatio
    const maxWidth = size * maxWidthRatio

    // `letterSpacing` is in px and scales with the font, so it has to be set
    // before every measurement or the widths come back wrong.
    const useFont = (px: number) => {
      ctx.font = `${fontWeight} ${px}px ${fontFamily}`
      ctx.letterSpacing = `${letterSpacing * px}px`
    }

    /** Greedy word wrap. Anything past `maxLines` stays on the last line. */
    const wrap = (px: number): string[] => {
      useFont(px)
      const words = text.split(/\s+/).filter(Boolean)
      if (words.length === 0) return [""]
      const lines: string[] = []
      let current = words[0] as string
      for (const word of words.slice(1)) {
        const candidate = `${current} ${word}`
        // Once we are on the final allowed line, keep appending — shrinking
        // to fit is the escape hatch, not a third line.
        const atLastLine = lines.length === maxLines - 1
        if (atLastLine || ctx.measureText(candidate).width <= maxWidth) {
          current = candidate
        } else {
          lines.push(current)
          current = word
        }
      }
      lines.push(current)
      return lines
    }

    const paint = () => {
      ctx.fillStyle = "#000000"
      ctx.fillRect(0, 0, size, size)
      ctx.fillStyle = color
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"

      const lines = wrap(fontSize)
      // A single word cannot wrap, and a two-line break may still leave a
      // line too long. Scale the whole block down by whatever the worst line
      // overflows by, then re-measure, since letter spacing moved with it.
      const widest = Math.max(...lines.map((l) => ctx.measureText(l).width))
      const scaled = widest > maxWidth ? fontSize * (maxWidth / widest) : fontSize
      useFont(scaled)

      const step = scaled * lineHeight
      const top = (size - (lines.length - 1) * step) / 2
      lines.forEach((line, i) => {
        ctx.fillText(line, size / 2, top + i * step)
      })
    }

    paint()

    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.LinearSRGBColorSpace
    tex.minFilter = THREE.LinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.wrapS = THREE.ClampToEdgeWrapping
    tex.wrapT = THREE.ClampToEdgeWrapping
    tex.needsUpdate = true

    if (document.fonts?.load) {
      document.fonts
        .load(`${fontWeight} ${fontSize}px ${fontFamily}`)
        .then(() => {
          paint()
          tex.needsUpdate = true
        })
        .catch(() => {})
    }

    return tex
  }, [
    text,
    size,
    fontSizeRatio,
    fontWeight,
    letterSpacing,
    color,
    fontFamily,
    maxLines,
    maxWidthRatio,
    lineHeight,
  ])
}
