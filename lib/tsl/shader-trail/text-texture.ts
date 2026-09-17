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
}: TextTextureOptions): THREE.CanvasTexture | null {
  return useMemo(() => {
    if (typeof document === "undefined") return null
    const canvas = document.createElement("canvas")
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext("2d")
    if (!ctx) return null

    const fontSize = size * fontSizeRatio

    const paint = () => {
      ctx.fillStyle = "#000000"
      ctx.fillRect(0, 0, size, size)
      ctx.fillStyle = color
      ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.letterSpacing = `${letterSpacing * fontSize}px`
      ctx.fillText(text, size / 2, size / 2)
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
  }, [text, size, fontSizeRatio, fontWeight, letterSpacing, color, fontFamily])
}
