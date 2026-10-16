import { type Point, type Quad, area, isConvex, orderCorners } from './perspective'
import type { Pixels } from './warp'

/** Long side to downscale to before detecting; plenty for finding page edges. */
export const DETECT_SIDE = 360

/** A page must cover at least this share of the photo to count as found. */
const MIN_AREA_SHARE = 0.12

/**
 * Finds the page in a photo: Sobel edges on a blurred greyscale copy, the
 * connected edge outlines, and of those the largest four-cornered shape that
 * fills its outline. Returns the corners, or null if nothing page-like was found.
 * Pass a downscaled image (DETECT_SIDE); the corners come back in its coordinates.
 */
export function detectQuad(img: Pixels): Quad | null {
  const { width: w, height: h } = img
  if (w < 8 || h < 8) return null
  const edges = edgeMap(img)
  let best: Quad | null = null
  let bestArea = MIN_AREA_SHARE * w * h
  for (const outline of outlines(edges, w, h)) {
    const hull = simplify(convexHull(outline), 40)
    if (hull.length < 4) continue
    const quad = largestQuad(hull)
    const a = area(quad)
    // A page outline is close to its own quad; a blob of clutter isn't.
    if (a > bestArea && a >= 0.85 * area(hull) && isConvex(quad)) {
      best = quad
      bestArea = a
    }
  }
  return best
}

/** Strong-edge mask: greyscale, separable [1 4 6 4 1] blur, Sobel magnitude, adaptive threshold. */
export function edgeMap({ width: w, height: h, data }: Pixels): Uint8Array {
  const n = w * h
  const grey = new Float32Array(n)
  for (let i = 0; i < n; i++) grey[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]

  const k = [1, 4, 6, 4, 1]
  const tmp = new Float32Array(n)
  const blur = new Float32Array(n)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0
      for (let j = -2; j <= 2; j++) s += k[j + 2] * grey[y * w + Math.min(w - 1, Math.max(0, x + j))]
      tmp[y * w + x] = s / 16
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0
      for (let j = -2; j <= 2; j++) s += k[j + 2] * tmp[Math.min(h - 1, Math.max(0, y + j)) * w + x]
      blur[y * w + x] = s / 16
    }

  const mag = new Float32Array(n)
  let max = 0
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const gx =
        blur[i - w + 1] + 2 * blur[i + 1] + blur[i + w + 1] - blur[i - w - 1] - 2 * blur[i - 1] - blur[i + w - 1]
      const gy =
        blur[i + w - 1] + 2 * blur[i + w] + blur[i + w + 1] - blur[i - w - 1] - 2 * blur[i - w] - blur[i - w + 1]
      mag[i] = Math.hypot(gx, gy)
      if (mag[i] > max) max = mag[i]
    }

  // Keep the strongest ~8% of gradients, but never faint noise on a flat photo.
  const bins = 256
  const hist = new Uint32Array(bins)
  if (max > 0) for (let i = 0; i < n; i++) hist[Math.min(bins - 1, Math.floor((mag[i] / max) * bins))]++
  let seen = 0
  let cut = bins - 1
  while (cut > 0 && seen + hist[cut] < n * 0.08) seen += hist[cut--]
  const threshold = Math.max(40, (cut / bins) * max)

  // Thresholded and dilated by one pixel so small gaps in an outline join up.
  const strong = new Uint8Array(n)
  for (let i = 0; i < n; i++) if (mag[i] >= threshold) strong[i] = 1
  const out = new Uint8Array(n)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!strong[y * w + x]) continue
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy
          const xx = x + dx
          if (yy >= 0 && yy < h && xx >= 0 && xx < w) out[yy * w + xx] = 1
        }
    }
  return out
}

/**
 * Each 8-connected group of edge pixels, reduced to its leftmost and rightmost
 * pixel per row (all a convex hull needs). Tiny groups are dropped.
 */
function outlines(mask: Uint8Array, w: number, h: number): Point[][] {
  const seen = new Uint8Array(w * h)
  const result: Point[][] = []
  const stack: number[] = []
  const minPixels = (w + h) / 4
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || seen[start]) continue
    const left = new Map<number, number>()
    const right = new Map<number, number>()
    let count = 0
    stack.push(start)
    seen[start] = 1
    while (stack.length) {
      const i = stack.pop()!
      const x = i % w
      const y = (i - x) / w
      count++
      if (!left.has(y) || x < left.get(y)!) left.set(y, x)
      if (!right.has(y) || x > right.get(y)!) right.set(y, x)
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx
          const yy = y + dy
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue
          const j = yy * w + xx
          if (mask[j] && !seen[j]) {
            seen[j] = 1
            stack.push(j)
          }
        }
    }
    if (count < minPixels) continue
    const points: Point[] = []
    left.forEach((x, y) => points.push({ x, y }))
    right.forEach((x, y) => points.push({ x, y }))
    result.push(points)
  }
  return result
}

/** Convex hull by Andrew's monotone chain, clockwise on screen (y down). */
export function convexHull(points: Point[]): Point[] {
  const p = points.slice().sort((a, b) => a.x - b.x || a.y - b.y)
  if (p.length < 3) return p
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: Point[] = []
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop()
    lower.push(q)
  }
  const upper: Point[] = []
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop()
    upper.push(q)
  }
  // Counter-clockwise in y-up maths, which is clockwise on screen.
  return lower.slice(0, -1).concat(upper.slice(0, -1))
}

/** Drops the hull vertices that matter least (smallest triangle) until at most `max` remain. */
function simplify(hull: Point[], max: number): Point[] {
  const p = hull.slice()
  while (p.length > max) {
    let drop = 0
    let least = Infinity
    for (let i = 0; i < p.length; i++) {
      const a = Math.abs(area([p[(i - 1 + p.length) % p.length], p[i], p[(i + 1) % p.length]]))
      if (a < least) {
        least = a
        drop = i
      }
    }
    p.splice(drop, 1)
  }
  return p
}

/** The largest-area quadrilateral with corners on the hull (brute force over a small hull). */
function largestQuad(hull: Point[]): Quad {
  const n = hull.length
  let best: Point[] = hull.slice(0, 4)
  let bestArea = -1
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++) {
          const q = [hull[a], hull[b], hull[c], hull[d]]
          const s = Math.abs(area(q))
          if (s > bestArea) {
            bestArea = s
            best = q
          }
        }
  return orderCorners(best)
}
