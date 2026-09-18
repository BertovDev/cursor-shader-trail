// @ts-nocheck
"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three/webgpu";

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(value, max));

export type BrushShape =
  | "circle"
  | "hatch"
  | "corner"
  | "crossSquareCorner"
  | "cross"
  | "star";

export type TrailFilter = "nearest" | "linear";

export type UseGridTrailTextureProps = {
  grid?: number;
  radius?: number;
  strength?: number;
  decay?: number;
  influenceGain?: number;
  influenceGamma?: number;
  /** Brush stamp shape — "circle" (radial 1/dist) or one of the patterns */
  brushShape?: BrushShape;
  /** Hatch brush: diagonal stripes packed across the brush diameter */
  brushRepeat?: number;
  /** Hatch brush: 0..1, fraction of each stripe period that is "gap" */
  brushThickness?: number;
  /** Pattern brushes: radial envelope exponent (higher = softer outer edge) */
  brushFalloff?: number;
  /** Pattern brushes: scalar applied after envelope×pattern */
  brushScale?: number;
  /** Generic pattern "size" param (corner.size, cross.maskSize) */
  patternSize?: number;
  /** Generic pattern "thickness" param (corner.thickness, crossSquareCorner.thickness) */
  patternThickness?: number;
  /** Generic pattern "width" param (crossSquareCorner.width, cross.width) */
  patternWidth?: number;
  /**
   * Texture filtering mode. "nearest" preserves the original pixelated
   * brush stamps (used by shader-trail). "linear" softens them — useful
   * when the trail is sampled by a shader that already blurs/warps the
   * field.
   */
  filter?: TrailFilter;
  /**
   * Drives the field from somewhere other than the mouse. While `.current`
   * is non-null it replaces the pointer, in the same [0, 2] space (0 = left
   * / top). A ref rather than a prop so a caller can move it every frame
   * without re-rendering. Used by the intro sweep, which needs the real
   * brush, decay and filtering rather than a shader approximation.
   */
  pointerOverrideRef?: { current: { x: number; y: number } | null };
};

/**
 * Superset of the fragments-boilerplate grid-trail hook.
 *
 *   - R = inverted dx flow, G = dy flow, B = clamped speed.
 *   - All deposit params read from a ref each frame, so tweaks update live
 *     without rebuilding the texture (trail history preserved).
 *   - B-channel is clamped to SPEED_SATURATION = 1.0 so the consumer
 *     shader's brightness lift can't saturate to white.
 *   - brushShape: "circle" preserves original boilerplate behaviour.
 *     "hatch" / "corner" / "crossSquareCorner" / "cross" are SDF stamps,
 *     all multiplied by a radial (1 - rNorm)^brushFalloff envelope and
 *     scaled by brushScale to roughly match the radial brush magnitude.
 */
export const useGridTrailTexture = (
  options?: UseGridTrailTextureProps,
): THREE.DataTexture | null => {
  const {
    grid = 50,
    radius = 0.05,
    strength = 0.06,
    decay = 0.75,
    influenceGain = 1.0,
    influenceGamma = 1.0,
    brushShape = "circle",
    brushRepeat = 4,
    brushThickness = 0.4,
    brushFalloff = 2,
    brushScale = 8,
    patternSize = 0.25,
    patternThickness = 0.1,
    patternWidth = 0.98,
    filter = "nearest",
  pointerOverrideRef,
  } = options || {};

  const liveRef = useRef({
    radius,
    strength,
    decay,
    influenceGain,
    influenceGamma,
    brushShape,
    brushRepeat,
    brushThickness,
    brushFalloff,
    brushScale,
    patternSize,
    patternThickness,
    patternWidth,
  });
  liveRef.current.radius = radius;
  liveRef.current.strength = strength;
  liveRef.current.decay = decay;
  liveRef.current.influenceGain = influenceGain;
  liveRef.current.influenceGamma = influenceGamma;
  liveRef.current.brushShape = brushShape;
  liveRef.current.brushRepeat = brushRepeat;
  liveRef.current.brushThickness = brushThickness;
  liveRef.current.brushFalloff = brushFalloff;
  liveRef.current.brushScale = brushScale;
  liveRef.current.patternSize = patternSize;
  liveRef.current.patternThickness = patternThickness;
  liveRef.current.patternWidth = patternWidth;

  const dataTextureRef = useRef<THREE.DataTexture | undefined>(undefined);
  const [dataTexture, setDataTexture] = useState<THREE.DataTexture | null>(
    null,
  );

  const pointerVelocityRef = useRef({ x: 0, y: 0 });
  const pointerRef = useRef({ x: 0, y: 0 });
  const rawPointerRef = useRef<{ x: number; y: number } | null>(null);
  const canvasBoundsRef = useRef<DOMRect | null>(null);

  const size = grid;
  const width = size;
  const height = size;
  const dimensions = width * height;

  const { gl } = useThree();

  useEffect(() => {
    const regenerateGrid = () => {
      const data = new Float32Array(4 * dimensions);
      const dt = new THREE.DataTexture(
        data,
        width,
        height,
        THREE.RGBAFormat,
        THREE.FloatType,
      );
      const filterMode =
        filter === "linear" ? THREE.LinearFilter : THREE.NearestFilter;
      dt.minFilter = dt.magFilter = filterMode;
      dt.needsUpdate = true;
      dataTextureRef.current = dt;
      setDataTexture(dt);
    };

    const updateCanvasBounds = () => {
      const canvas = gl.domElement;
      if (canvas) {
        canvasBoundsRef.current = canvas.getBoundingClientRect();
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      let bounds = canvasBoundsRef.current;
      if (!bounds) {
        updateCanvasBounds();
        bounds = canvasBoundsRef.current;
        if (!bounds) {
          throw new Error("Canvas bounds not found");
        }
      }
      const x = (event.clientX - bounds.left) / bounds.width;
      const y = (event.clientY - bounds.top) / bounds.height;
      const ndcX = clamp(x * 2, 0, 2);
      const ndcY = clamp(y * 2, 0, 2);
      rawPointerRef.current = { x: ndcX, y: ndcY };
    };

    const handlePointerLeave = () => {
      rawPointerRef.current = null;
      pointerVelocityRef.current.x = 0;
      pointerVelocityRef.current.y = 0;
    };

    const resetVelocity = () => {
      pointerVelocityRef.current.x = 0;
      pointerVelocityRef.current.y = 0;
    };

    updateCanvasBounds();
    regenerateGrid();

    const canvas = gl.domElement;
    if (canvas) {
      canvas.addEventListener("pointermove", handlePointerMove);
      canvas.addEventListener("pointerleave", handlePointerLeave);
      canvas.addEventListener("pointerup", resetVelocity);
    }
    window.addEventListener("resize", updateCanvasBounds);
    window.addEventListener("scroll", updateCanvasBounds, { passive: true });
    window.addEventListener("blur", resetVelocity);

    return () => {
      if (canvas) {
        canvas.removeEventListener("pointermove", handlePointerMove);
        canvas.removeEventListener("pointerleave", handlePointerLeave);
        canvas.removeEventListener("pointerup", resetVelocity);
      }
      window.removeEventListener("resize", updateCanvasBounds);
      window.removeEventListener("scroll", updateCanvasBounds);
      window.removeEventListener("blur", resetVelocity);
    };
  }, [dimensions, height, width, gl, filter]);

  useFrame(() => {
    const dt = dataTextureRef.current;
    if (!dt) return;

    const radius = liveRef.current.radius;
    const strength = liveRef.current.strength;
    const decay = liveRef.current.decay;
    const influenceGain = liveRef.current.influenceGain;
    const influenceGamma = liveRef.current.influenceGamma;
    const brushShape = liveRef.current.brushShape;
    const brushRepeat = liveRef.current.brushRepeat;
    const brushThickness = liveRef.current.brushThickness;
    const brushFalloff = liveRef.current.brushFalloff;
    const brushScale = liveRef.current.brushScale;
    const patternSize = liveRef.current.patternSize;
    const patternThickness = liveRef.current.patternThickness;
    const patternWidth = liveRef.current.patternWidth;

    const rawPointer = pointerOverrideRef?.current ?? rawPointerRef.current;
    if (!rawPointer) {
      const data = dt.image.data as Float32Array;
      for (let i = 0; i < data.length; i += 4) {
        data[i] *= decay;
        data[i + 1] *= decay;
        data[i + 2] *= decay;
      }
      dt.needsUpdate = true;
      return;
    }

    const pointerNormX = rawPointer.x;
    const pointerNormY = rawPointer.y;
    const prevPointerX = pointerRef.current.x;
    const prevPointerY = pointerRef.current.y;
    pointerVelocityRef.current.x = pointerNormX - prevPointerX;
    pointerVelocityRef.current.y = pointerNormY - prevPointerY;
    pointerRef.current.x = pointerNormX;
    pointerRef.current.y = pointerNormY;
    const data = dt.image.data as Float32Array;

    const mouseRadius = size * radius;
    const cellX = pointerRef.current.x * 0.5 * size - mouseRadius * 0.5;
    const cellY = (2 - pointerRef.current.y) * 0.5 * size + mouseRadius * 0.5;

    for (let i = 0; i < data.length; i += 4) {
      data[i] *= decay;
      data[i + 1] *= decay;
      data[i + 2] *= decay;
    }

    const HALF_EDGE = 0.005;
    const SPEED_SATURATION = 1.0;
    for (let x = 0; x < size; x++)
      for (let y = 0; y < size; y++) {
        const cellCenterX = x + 0.5;
        const cellCenterY = y + 0.5;
        const dx = cellCenterX - cellX;
        const dy = cellCenterY - cellY;
        const distSq = dx * dx + dy * dy;
        const distMax = mouseRadius ** 2;
        if (distSq >= distMax || distSq <= 0) continue;

        let force: number;
        if (brushShape === "circle") {
          const dist = Math.sqrt(distSq);
          force = clamp(mouseRadius / dist, 0, 10);
        } else {
          const lx = dx / mouseRadius;
          const ly = dy / mouseRadius;
          const rNorm = Math.sqrt(distSq) / mouseRadius;

          let patternMask = 0;
          if (brushShape === "hatch") {
            const ru = (lx - ly) * Math.SQRT1_2;
            const stripe = (((ru * brushRepeat) % 1) + 1) % 1;
            if (stripe <= brushThickness) {
              patternMask = 0;
            } else if (stripe >= brushThickness + HALF_EDGE) {
              patternMask = 1;
            } else {
              const t = (stripe - brushThickness) / HALF_EDGE;
              patternMask = t * t * (3 - 2 * t);
            }
          } else if (brushShape === "corner") {
            const sdBox = Math.max(Math.abs(lx), Math.abs(ly));
            const innerSquare = sdBox <= patternSize ? 1 : 0;
            const vL = Math.abs(lx) <= patternThickness ? 1 : 0;
            const hL = Math.abs(ly) <= patternThickness ? 1 : 0;
            const cross = Math.max(0, Math.min(1, vL + hL));
            patternMask = Math.max(0, Math.min(1, cross + innerSquare));
          } else if (brushShape === "crossSquareCorner") {
            const vL = Math.abs(lx) <= patternThickness ? 1 : 0;
            const hL = Math.abs(ly) <= patternThickness ? 1 : 0;
            const cross = Math.max(0, Math.min(1, vL + hL));
            const invertedCross = 1 - cross;
            const ruX = (lx - ly) * Math.SQRT1_2;
            const ruY = (lx + ly) * Math.SQRT1_2;
            const cvL = 1 - Math.abs(ruX) >= patternWidth ? 1 : 0;
            const chL = 1 - Math.abs(ruY) >= patternWidth ? 1 : 0;
            const diag = Math.max(0, Math.min(1, cvL + chL));
            patternMask = Math.max(0, Math.min(1, invertedCross + diag));
          } else if (brushShape === "cross") {
            const ruX = (lx - ly) * Math.SQRT1_2;
            const ruY = (lx + ly) * Math.SQRT1_2;
            const vL = 1 - Math.abs(ruX) >= patternWidth ? 1 : 0;
            const hL = 1 - Math.abs(ruY) >= patternWidth ? 1 : 0;
            const lines = Math.max(0, Math.min(1, vL + hL));
            const sdDiamond = Math.abs(lx) + Math.abs(ly);
            const mask = sdDiamond <= patternSize ? 1 : 0;
            patternMask = mask * lines;
          }

          const envelope = (1 - rNorm) ** brushFalloff;
          force = envelope * patternMask * brushScale;
          if (force <= 0) continue;
        }

        const dataIndex = 4 * (x + size * y);
        const vxGrid = pointerVelocityRef.current.x * (size / 2);
        const vyGrid = -pointerVelocityRef.current.y * (size / 2);
        const speedGrid = Math.hypot(vxGrid, vyGrid);
        const vxCurved = Math.sign(vxGrid) * Math.abs(vxGrid) ** influenceGamma;
        const vyCurved = Math.sign(vyGrid) * Math.abs(vyGrid) ** influenceGamma;
        const speedCurved = speedGrid ** influenceGamma;

        const scale = influenceGain * strength * force;
        const dispBase = scale * speedCurved;
        const len = Math.hypot(vxCurved, vyCurved) || 1;
        const ndx = vxCurved / len;
        const ndy = vyCurved / len;

        data[dataIndex] += dispBase * -ndx;
        data[dataIndex + 1] += dispBase * ndy;
        const nextSpeed = data[dataIndex + 2] + scale * speedCurved;
        data[dataIndex + 2] =
          nextSpeed > SPEED_SATURATION ? SPEED_SATURATION : nextSpeed;
      }

    dt.needsUpdate = true;

    pointerVelocityRef.current.x *= decay;
    pointerVelocityRef.current.y *= decay;
    const EPS = 1e-3;
    if (Math.abs(pointerVelocityRef.current.x) < EPS) {
      pointerVelocityRef.current.x = 0;
    }
    if (Math.abs(pointerVelocityRef.current.y) < EPS) {
      pointerVelocityRef.current.y = 0;
    }
  });

  return dataTexture;
};
