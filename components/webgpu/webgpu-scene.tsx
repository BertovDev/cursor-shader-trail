"use client";

import { AdaptiveDpr, OrthographicCamera, Preload } from "@react-three/drei";
import { Canvas, type CanvasProps } from "@react-three/fiber";
import type { ReactNode } from "react";
import { useState } from "react";
import { WebGPURenderer } from "three/webgpu";
import { ColorSpaceCorrection } from "./color-space-correction";

type FrameLoop = "always" | "demand" | "never";

type WebGPUSceneProps = {
  debug?: boolean;
  frameloop?: FrameLoop;
  orthographic?: boolean;
  children?: ReactNode;
} & Omit<CanvasProps, "frameloop" | "gl" | "children">;

/**
 * WebGPUScene
 *
 * Renders a three.js scene using the WebGPURenderer inside a @react-three/fiber Canvas.
 *
 * Notes:
 * - Uses WebGPURenderer (three.js) for next-gen rendering
 * - Handles color space and tone mapping for WebGPU
 * - Preloads assets and adapts DPR
 * - Keeps the Canvas frameloop at "never" until the renderer finishes async init,
 *   then flips to the caller-specified frameloop. This is correctness-critical.
 */
export const WebGPUScene = ({
  debug = false,
  frameloop = "always",
  orthographic: _orthographic = false,
  children,
  ...props
}: WebGPUSceneProps) => {
  const [canvasFrameloop, setCanvasFrameloop] = useState<FrameLoop>("never");

  return (
    <Canvas
      id="__webgpucanvas"
      {...props}
      dpr={[1, 1]}
      frameloop={canvasFrameloop}
      gl={async (canvasProps) => {
        // biome-ignore lint/suspicious/noExplicitAny: WebGPURenderer accepts the R3F gl props at runtime
        const renderer = new WebGPURenderer(canvasProps as any);

        await renderer.init();
        setCanvasFrameloop(frameloop);

        // biome-ignore lint/suspicious/noExplicitAny: cast back to the Renderer type R3F expects
        return renderer as any;
      }}
    >
      <Preload all />

      <AdaptiveDpr />

      {children}

      <ColorSpaceCorrection />

      {debug ? null : null}

      <OrthographicCamera makeDefault position={[0, 0, 1]} />
    </Canvas>
  );
};

export default WebGPUScene;
