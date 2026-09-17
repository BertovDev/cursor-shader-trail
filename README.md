# Cursor Shader Trail

A cursor trail where the brush is a pluggable function. Swap ten lines of
JavaScript and the whole mark changes.

Built with [Three.js](https://threejs.org), the WebGPU renderer and
[TSL](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language),
wired into React with [React Three Fiber](https://r3f.docs.pmnd.rs).

Companion demo for a Codrops tutorial.

## Running it

```bash
bun install
bun dev
```

- `/` — the finished effect, with a live control panel
- `/tutorial` — the same effect built in nine steps

On the tutorial page: `←` `→` move between steps, `H` hides the overlay, and
the input at the bottom right changes the word.

## How it works

Two halves that barely know about each other.

**The trail field** is a 200×200 RGBA float `DataTexture` that JavaScript
writes into every frame. R and G hold a flow vector, B holds speed, and
everything decays. No render targets, no ping-pong buffers, no compute pass.

**The shader** reads that texture and decides what to draw. It offsets its UV
by the flow, so every fragment samples from wherever the cursor dragged it.

Once the interaction is just a texture, each half swaps independently.

## The brush

Every mark deposited into the field is the same product:

```
force = envelope × pattern × scale
```

The envelope is a radial fade and never changes. `pattern` is a pure function
of local coordinates, and it is the only part that varies:

```js
const dots = (lx, ly, { repeat, size }) => {
  const cx = fract(lx * repeat) - 0.5
  const cy = fract(ly * repeat) - 0.5
  return Math.hypot(cx, cy) <= size ? 1 : 0
}

useTrailField({ brush: dots })
```

Six brushes ship in `lib/tsl/tutorial/brushes.ts`. Writing a seventh is five
lines, and nothing downstream changes.

## Layout

```
app/
  page.tsx                   the finished effect
  tutorial/page.tsx          the nine-step walkthrough
components/
  shader-trail/              the finished effect
  tutorial/steps/            one file per step, each the previous plus one idea
  webgpu/                    renderer boot and the fullscreen quad
lib/tsl/
  tutorial/brushes.ts        the BrushFn registry
  tutorial/use-trail-field.ts the CPU simulation
  tutorial/nodes.ts          shared TSL fragments
  shader-trail/              the full pipeline behind the finished effect
```

The step files deliberately repeat each other. Diff step N against N-1 and you
see exactly one change.

## Credits

The trail field grew out of the grid-trail hook in
[phobon/fragments-boilerplate](https://github.com/phobon/fragments-boilerplate).

Simplex noise is the standard
[webgl-noise](https://github.com/ashima/webgl-noise) implementation, transpiled
to TSL.

## License

MIT
