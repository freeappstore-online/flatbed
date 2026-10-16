// Perspective maths for straightening a photographed page: the homography
// between a quadrilateral and a rectangle, corner ordering, output size and
// rotation. Pure functions, no DOM.

export type Point = { x: number; y: number }
/** Corners in order: top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Point, Point, Point, Point]
/** A 3×3 matrix, row-major, with m[8] normalised to 1. */
export type Matrix = number[]

/** How a page is cropped: its corners in the original image and quarter turns clockwise. */
export type Crop = { quad: Quad; turns: number }

/**
 * Solves an n×n linear system in place with partial pivoting.
 * Returns null when the system is singular (degenerate corners).
 */
function solve(a: number[][], b: number[]): number[] | null {
  const n = b.length
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let row = col + 1; row < n; row++) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row
    if (Math.abs(a[pivot][col]) < 1e-10) return null
    ;[a[col], a[pivot]] = [a[pivot], a[col]]
    ;[b[col], b[pivot]] = [b[pivot], b[col]]
    for (let row = col + 1; row < n; row++) {
      const f = a[row][col] / a[col][col]
      for (let k = col; k < n; k++) a[row][k] -= f * a[col][k]
      b[row] -= f * b[col]
    }
  }
  const x = new Array<number>(n)
  for (let row = n - 1; row >= 0; row--) {
    let sum = b[row]
    for (let k = row + 1; k < n; k++) sum -= a[row][k] * x[k]
    x[row] = sum / a[row][row]
  }
  return x
}

/** The homography taking each `from[i]` to `to[i]`, or null if the points are degenerate. */
export function homography(from: Quad, to: Quad): Matrix | null {
  const a: number[][] = []
  const b: number[] = []
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i]
    const { x: u, y: v } = to[i]
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y])
    b.push(u)
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y])
    b.push(v)
  }
  const h = solve(a, b)
  return h && [...h, 1]
}

export function apply(m: Matrix, { x, y }: Point): Point {
  const w = m[6] * x + m[7] * y + m[8]
  return { x: (m[0] * x + m[1] * y + m[2]) / w, y: (m[3] * x + m[4] * y + m[5]) / w }
}

/** The corners of a w×h rectangle as a Quad. */
export function rect(w: number, h: number): Quad {
  return [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ]
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

/** The size of the straightened page: the longer of each pair of opposite edges. */
export function outputSize([tl, tr, br, bl]: Quad): { width: number; height: number } {
  return {
    width: Math.max(1, Math.round(Math.max(dist(tl, tr), dist(bl, br)))),
    height: Math.max(1, Math.round(Math.max(dist(tl, bl), dist(tr, br)))),
  }
}

/** Puts four points in Quad order (clockwise from top-left) whatever order they came in. */
export function orderCorners(points: Point[]): Quad {
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length
  // With y pointing down, increasing angle runs clockwise on screen.
  const around = points.slice().sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx))
  let start = 0
  around.forEach((p, i) => {
    if (p.x + p.y < around[start].x + around[start].y) start = i
  })
  return [0, 1, 2, 3].map((i) => around[(start + i) % 4]) as Quad
}

/** Signed area by the shoelace formula; positive for clockwise-on-screen order. */
export function area(points: Point[]): number {
  let s = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    s += a.x * b.y - b.x * a.y
  }
  return s / 2
}

/** Whether the quad is convex and clockwise: a page shape we can straighten. */
export function isConvex(quad: Quad): boolean {
  for (let i = 0; i < 4; i++) {
    const a = quad[i]
    const b = quad[(i + 1) % 4]
    const c = quad[(i + 2) % 4]
    if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) <= 0) return false
  }
  return true
}

/**
 * Re-labels the corners so straightening also turns the page `turns`
 * quarter-turns clockwise: after one turn the old bottom-left is the new top-left.
 */
export function rotateQuad(quad: Quad, turns: number): Quad {
  const t = ((turns % 4) + 4) % 4
  return [0, 1, 2, 3].map((i) => quad[(i - t + 4) % 4]) as Quad
}

/** Scales every corner, e.g. from a downscaled preview back to the full image. */
export function scaleQuad(quad: Quad, sx: number, sy = sx): Quad {
  return quad.map((p) => ({ x: p.x * sx, y: p.y * sy })) as Quad
}

export function clampPoint(p: Point, width: number, height: number): Point {
  return { x: Math.max(0, Math.min(width, p.x)), y: Math.max(0, Math.min(height, p.y)) }
}
