// Page filters: original, greyscale, black & white (adaptive threshold) and
// magic colour (contrast boost). Pure functions on RGBA pixels, no DOM.

import type { Pixels } from '../crop/warp'

export type Filter = 'original' | 'greyscale' | 'bw' | 'magic'

export const FILTERS: { id: Filter; name: string }[] = [
  { id: 'original', name: 'Original' },
  { id: 'greyscale', name: 'Greyscale' },
  { id: 'bw', name: 'Black & white' },
  { id: 'magic', name: 'Magic colour' },
]

/** Rec. 601 luma, as the edge detector uses. */
export const luma = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b

/** Returns a new image with the filter applied; the input is never changed. */
export function applyFilter(src: Pixels, filter: Filter): Pixels {
  switch (filter) {
    case 'greyscale':
      return greyscale(src)
    case 'bw':
      return threshold(src)
    case 'magic':
      return magic(src)
    default:
      return { width: src.width, height: src.height, data: new Uint8ClampedArray(src.data) }
  }
}

export function greyscale({ width, height, data }: Pixels): Pixels {
  const out = new Uint8ClampedArray(data.length)
  for (let i = 0; i < data.length; i += 4) {
    const y = luma(data[i], data[i + 1], data[i + 2])
    out[i] = out[i + 1] = out[i + 2] = y
    out[i + 3] = data[i + 3]
  }
  return { width, height, data: out }
}

/**
 * Black & white by adaptive threshold (Bradley–Roth): a pixel turns black when
 * it's more than `t` darker than the mean of the window around it, so text stays
 * crisp under uneven light and shadows. The window scales with the image, so a
 * preview and the full page come out alike.
 */
export function threshold({ width: w, height: h, data }: Pixels, t = 0.15): Pixels {
  const n = w * h
  const lum = new Uint8ClampedArray(n)
  for (let i = 0; i < n; i++) lum[i] = luma(data[i * 4], data[i * 4 + 1], data[i * 4 + 2])

  // Integral image, one row and column of padding. Uint32 holds 255 × 16.8M pixels,
  // above the 4000×4000 output cap.
  const iw = w + 1
  const sum = new Uint32Array(iw * (h + 1))
  for (let y = 0; y < h; y++) {
    let row = 0
    for (let x = 0; x < w; x++) {
      row += lum[y * w + x]
      sum[(y + 1) * iw + x + 1] = sum[y * iw + x + 1] + row
    }
  }

  const r = Math.max(1, Math.round(Math.max(w, h) / 16))
  const out = new Uint8ClampedArray(n * 4)
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r)
    const y1 = Math.min(h, y + r + 1)
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r)
      const x1 = Math.min(w, x + r + 1)
      const total = sum[y1 * iw + x1] - sum[y0 * iw + x1] - sum[y1 * iw + x0] + sum[y0 * iw + x0]
      const mean = total / ((x1 - x0) * (y1 - y0))
      const v = lum[y * w + x] < mean * (1 - t) ? 0 : 255
      const o = (y * w + x) * 4
      out[o] = out[o + 1] = out[o + 2] = v
      out[o + 3] = 255
    }
  }
  return { width: w, height: h, data: out }
}

/**
 * Magic colour: stretches contrast so the darkest ink goes black and the paper
 * goes white, then lifts saturation a little so coloured ink and highlights
 * stay vivid. Black is the 1st brightness percentile; white is the average
 * colour of everything above the 92nd (the paper), per channel, so a yellowish
 * or bluish cast from the room light is balanced out too.
 */
export function magic({ width, height, data }: Pixels, saturation = 1.25): Pixels {
  const n = width * height
  const hist = new Uint32Array(256)
  for (let i = 0; i < data.length; i += 4) hist[Math.round(luma(data[i], data[i + 1], data[i + 2]))]++
  const percentile = (p: number) => {
    let seen = 0
    for (let v = 0; v < 256; v++) {
      seen += hist[v]
      if (seen >= n * p) return v
    }
    return 255
  }
  const lo = percentile(0.01)
  const hi = percentile(0.92)
  const paper = [0, 0, 0]
  let count = 0
  for (let i = 0; i < data.length; i += 4) {
    if (Math.round(luma(data[i], data[i + 1], data[i + 2])) < hi) continue
    paper[0] += data[i]
    paper[1] += data[i + 1]
    paper[2] += data[i + 2]
    count++
  }
  // A flat image has nothing to stretch; keep each scale finite.
  const [sr, sg, sb] = paper.map((s) => 255 / Math.max(1, s / Math.max(1, count) - lo))

  const out = new Uint8ClampedArray(data.length)
  for (let i = 0; i < data.length; i += 4) {
    const r = (data[i] - lo) * sr
    const g = (data[i + 1] - lo) * sg
    const b = (data[i + 2] - lo) * sb
    const y = luma(r, g, b)
    out[i] = y + (r - y) * saturation
    out[i + 1] = y + (g - y) * saturation
    out[i + 2] = y + (b - y) * saturation
    out[i + 3] = data[i + 3]
  }
  return { width, height, data: out }
}
