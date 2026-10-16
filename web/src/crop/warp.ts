import { type Quad, apply, homography, outputSize, rect, rotateQuad } from './perspective'

/** RGBA pixels, shaped like ImageData so either can be passed in. */
export type Pixels = { width: number; height: number; data: Uint8ClampedArray }

/** Longest side of a straightened page; larger crops are scaled down to this. */
export const MAX_OUTPUT_SIDE = 4000

/**
 * Straightens the region inside `quad` into a flat rectangle, turned `turns`
 * quarter-turns clockwise. Each output pixel is mapped back into the source
 * through the inverse homography and sampled bilinearly.
 */
export function warp(src: Pixels, quad: Quad, turns = 0, maxSide = MAX_OUTPUT_SIDE): Pixels {
  const corners = rotateQuad(quad, turns)
  const size = outputSize(corners)
  const scale = Math.min(1, maxSide / Math.max(size.width, size.height))
  const width = Math.max(1, Math.round(size.width * scale))
  const height = Math.max(1, Math.round(size.height * scale))
  const out = new Uint8ClampedArray(width * height * 4)
  const m = homography(rect(width, height), corners)
  if (!m) return { width, height, data: out }

  const { width: sw, height: sh, data: sd } = src
  let o = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++, o += 4) {
      // Pixel centres sit at +0.5 in both images.
      const p = apply(m, { x: x + 0.5, y: y + 0.5 })
      const fx = Math.max(0, Math.min(sw - 1, p.x - 0.5))
      const fy = Math.max(0, Math.min(sh - 1, p.y - 0.5))
      const x0 = Math.floor(fx)
      const y0 = Math.floor(fy)
      const x1 = Math.min(sw - 1, x0 + 1)
      const y1 = Math.min(sh - 1, y0 + 1)
      const ax = fx - x0
      const ay = fy - y0
      const i00 = (y0 * sw + x0) * 4
      const i10 = (y0 * sw + x1) * 4
      const i01 = (y1 * sw + x0) * 4
      const i11 = (y1 * sw + x1) * 4
      for (let c = 0; c < 4; c++) {
        const top = sd[i00 + c] + (sd[i10 + c] - sd[i00 + c]) * ax
        const bottom = sd[i01 + c] + (sd[i11 + c] - sd[i01 + c]) * ax
        out[o + c] = top + (bottom - top) * ay
      }
    }
  }
  return { width, height, data: out }
}
