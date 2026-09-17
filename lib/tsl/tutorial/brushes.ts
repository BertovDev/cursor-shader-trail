/**
 * Brushes for the cursor trail field.
 *
 * A brush is a *pure function* evaluated in local brush coordinates. It
 * knows nothing about the cursor, the grid, or the shader. It just answers
 * one question: how much ink lands at this point inside the brush?
 *
 * Every brush writes into the trail field the same way:
 *
 *     force = envelope × pattern × scale
 *
 * `envelope` (a radial fade) and `scale` (a magnitude fix-up) are applied by
 * the trail hook and never change. Only `pattern` — the function below —
 * varies. That is the entire extensibility story: write a new `BrushFn`, pass
 * it in, and every other part of the pipeline keeps working untouched.
 */

/** Tunables shared by the built-in brushes. Add your own fields freely. */
export type BrushParams = {
  /** How many pattern cells fit across the brush diameter. */
  repeat: number
  /** 0..1, for line-based patterns: the fraction of a period that is gap. */
  thickness: number
  /** Generic "size" knob: dot radius, inner-square extent, diamond clip. */
  size: number
  /** Generic "width" knob for diagonal line masks. */
  width: number
  /** Half-width of the axis-aligned bars in `crossSquareCorner`. */
  bar: number
}

/**
 * `lx` / `ly` are local brush coordinates, normalised to the brush radius:
 * roughly [-1, 1] across the diameter, (0, 0) at the centre. Return 0..1.
 */
export type BrushFn = (lx: number, ly: number, p: BrushParams) => number

/** Width of the anti-aliasing band on pattern edges, in local units. */
const EDGE = 0.005

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** Smoothstep from `edge` to `edge + EDGE`, so stripes don't alias. */
const softEdge = (x: number, edge: number) => {
  if (x <= edge) return 0
  if (x >= edge + EDGE) return 1
  const t = (x - edge) / EDGE
  return t * t * (3 - 2 * t)
}

/** JS `%` keeps the operand's sign — this wraps into a true 0..1 fract. */
const fract = (x: number) => ((x % 1) + 1) % 1

/** Rotate local coords 45°, returning both diagonal axes. */
const diagonal = (lx: number, ly: number) => [
  (lx - ly) * Math.SQRT1_2,
  (lx + ly) * Math.SQRT1_2,
]

/**
 * The default. Uniformly solid — the radial envelope alone shapes it, which
 * gives you the familiar soft blob every mouse-trail demo starts from.
 */
export const circle: BrushFn = () => 1

/** Diagonal screenprint hatching. The shipped look. */
export const hatch: BrushFn = (lx, ly, { repeat, thickness }) => {
  const [ru] = diagonal(lx, ly)
  return softEdge(fract((ru as number) * repeat), thickness)
}

/** Two diagonal lines clipped by a diamond — a sparkle / star mark. */
export const cross: BrushFn = (lx, ly, { size, width }) => {
  const [ru, rv] = diagonal(lx, ly)
  const lineA = 1 - Math.abs(ru as number) >= width ? 1 : 0
  const lineB = 1 - Math.abs(rv as number) >= width ? 1 : 0
  const lines = clamp01(lineA + lineB)
  const diamond = Math.abs(lx) + Math.abs(ly) <= size ? 1 : 0
  return lines * diamond
}

/** An axis-aligned cross unioned with an inner square — a registration mark. */
export const corner: BrushFn = (lx, ly, { size, thickness }) => {
  const innerSquare = Math.max(Math.abs(lx), Math.abs(ly)) <= size ? 1 : 0
  const vertical = Math.abs(lx) <= thickness ? 1 : 0
  const horizontal = Math.abs(ly) <= thickness ? 1 : 0
  return clamp01(clamp01(vertical + horizontal) + innerSquare)
}

/**
 * Halftone dots: a grid of circles. Five lines, and it composes with the
 * envelope, the scale, and every flow mode for free. This is the example to
 * copy when writing your own.
 */
export const dots: BrushFn = (lx, ly, { repeat, size }) => {
  const cx = fract(lx * repeat) - 0.5
  const cy = fract(ly * repeat) - 0.5
  return Math.hypot(cx, cy) <= size ? 1 : 0
}

/**
 * A solid square with an axis-aligned cross *cut out* of it, plus two
 * diagonals drawn back over the gap. Inverting the cross instead of adding it
 * is the whole trick — the mark reads as a printed registration corner rather
 * than a plus sign.
 */
export const crossSquareCorner: BrushFn = (lx, ly, { bar, width }) => {
  const vertical = Math.abs(lx) <= bar ? 1 : 0
  const horizontal = Math.abs(ly) <= bar ? 1 : 0
  const invertedCross = 1 - clamp01(vertical + horizontal)

  const [ru, rv] = diagonal(lx, ly)
  const diagA = 1 - Math.abs(ru as number) >= width ? 1 : 0
  const diagB = 1 - Math.abs(rv as number) >= width ? 1 : 0
  const diagonals = clamp01(diagA + diagB)

  return clamp01(invertedCross + diagonals)
}

export const brushes = {
  circle,
  hatch,
  crossSquareCorner,
  cross,
  corner,
  dots,
} satisfies Record<string, BrushFn>

export type BrushName = keyof typeof brushes

export const BRUSH_NAMES = Object.keys(brushes) as BrushName[]

export const DEFAULT_BRUSH_PARAMS: BrushParams = {
  repeat: 6,
  thickness: 0.44,
  size: 0.25,
  width: 0.92,
  bar: 0.1,
}
