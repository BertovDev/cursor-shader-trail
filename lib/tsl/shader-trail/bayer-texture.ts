"use client";

import { useMemo } from "react";
import * as THREE from "three/webgpu";

const BAYER_4X4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/**
 * Builds a 4x4 RGBA8 DataTexture holding the standard Bayer 4x4 dithering
 * matrix, normalized to 0..255. Sampled with NearestFilter + RepeatWrapping
 * for tileable, blocky ordered dithering.
 */
export function useBayerTexture(): THREE.DataTexture {
  return useMemo(() => {
    const data = new Uint8Array(16 * 4);
    for (let i = 0; i < 16; i++) {
      const v = Math.round(((BAYER_4X4[i] as number) / 15) * 255);
      data[i * 4 + 0] = v;
      data[i * 4 + 1] = v;
      data[i * 4 + 2] = v;
      data[i * 4 + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, 4, 4, THREE.RGBAFormat);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.needsUpdate = true;
    return tex;
  }, []);
}
