"use client"

import { useThree } from "@react-three/fiber"
import { useEffect } from "react"
import { LinearSRGBColorSpace, NoToneMapping } from "three/webgpu"

/**
 * ColorSpaceCorrection
 *
 * Sets the renderer's outputColorSpace to LinearSRGBColorSpace and disables tone mapping.
 * Ensures correct color output for WebGPU rendering.
 */
export const ColorSpaceCorrection = () => {
  const set = useThree((state) => state.set)

  useEffect(() => {
    set((state) => {
      const next = { ...state }
      // biome-ignore lint/suspicious/noExplicitAny: WebGPU renderer is assigned via R3F state
      const gl = next.gl as any
      gl.outputColorSpace = LinearSRGBColorSpace
      gl.toneMapping = NoToneMapping
      return next
    })
  }, [set])

  return null
}
