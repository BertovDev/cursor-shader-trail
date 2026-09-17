"use client"

import { type RootState, useFrame, useThree } from "@react-three/fiber"
import type { ComponentProps, ReactNode } from "react"
import { sin, time, uv, vec3 } from "three/tsl"
import { MeshBasicNodeMaterial } from "three/webgpu"

// biome-ignore lint/suspicious/noExplicitAny: TSL nodes are typed dynamically by three
type TslColorNode = any

type MeshPointerProps = Pick<
  ComponentProps<"mesh">,
  | "onClick"
  | "onContextMenu"
  | "onDoubleClick"
  | "onPointerCancel"
  | "onPointerDown"
  | "onPointerEnter"
  | "onPointerLeave"
  | "onPointerMove"
  | "onPointerOut"
  | "onPointerOver"
  | "onPointerUp"
  | "onWheel"
>

type TemplateImplProps = MeshPointerProps & {
  colorNode?: TslColorNode
  onFrame?: (material: MeshBasicNodeMaterial, state: RootState) => void
}

/**
 * Template implementation for a WebGPU sketch mesh. Renders a fullscreen quad
 * sized to the current viewport, with a MeshBasicNodeMaterial whose colorNode
 * defaults to vec3(uv, sin(time)).
 */
const TemplateImpl = ({
  colorNode,
  onFrame,
  ...pointerProps
}: TemplateImplProps) => {
  const material = new MeshBasicNodeMaterial({ transparent: true })
  const _uv = uv()
  const _colorNode = colorNode ?? vec3(_uv, sin(time))
  // biome-ignore lint/suspicious/noExplicitAny: TSL nodes are typed loosely by three
  ;(material as any).colorNode = _colorNode

  const { width, height } = useThree((state) => state.viewport)

  useFrame((state) => {
    if (onFrame) {
      onFrame(material, state)
    }
  })

  return (
    <mesh material={material} scale={[width, height, 1]} {...pointerProps}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  )
}

export type WebGPUSketchProps = MeshPointerProps & {
  colorNode?: TslColorNode
  onFrame?: (material: MeshBasicNodeMaterial, state: RootState) => void
  children?: ReactNode
}

/**
 * WebGPU sketch component. Renders children or a default template mesh.
 */
export const WebGPUSketch = ({
  colorNode,
  onFrame,
  children,
  ...pointerProps
}: WebGPUSketchProps) => {
  if (children) return <>{children}</>
  const props: TemplateImplProps = { ...pointerProps }
  if (colorNode !== undefined) props.colorNode = colorNode
  if (onFrame !== undefined) props.onFrame = onFrame
  return <TemplateImpl {...props} />
}
