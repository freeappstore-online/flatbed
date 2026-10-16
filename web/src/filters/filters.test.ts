import { describe, expect, it } from 'vitest'
import { FILTERS, applyFilter, luma, magic, threshold } from './filters'
import { paint, pixel } from '../test/images'

const lumaRange = (img: { data: Uint8ClampedArray }) => {
  let min = 255
  let max = 0
  for (let i = 0; i < img.data.length; i += 4) {
    const y = luma(img.data[i], img.data[i + 1], img.data[i + 2])
    min = Math.min(min, y)
    max = Math.max(max, y)
  }
  return { min, max }
}

describe('original', () => {
  it('leaves every pixel as it was, in a new buffer', () => {
    const img = paint(8, 6, (x, y) => [x * 30, y * 40, 77])
    const out = applyFilter(img, 'original')
    expect(Array.from(out.data)).toEqual(Array.from(img.data))
    expect(out.data).not.toBe(img.data)
  })
})

describe('greyscale', () => {
  it('turns pure red into its luminance grey', () => {
    const out = applyFilter(paint(1, 1, () => [255, 0, 0]), 'greyscale')
    expect(pixel(out, 0, 0)).toEqual([76, 76, 76]) // 0.299 × 255
  })

  it('weights green most and blue least', () => {
    expect(pixel(applyFilter(paint(1, 1, () => [0, 255, 0]), 'greyscale'), 0, 0)).toEqual([150, 150, 150])
    expect(pixel(applyFilter(paint(1, 1, () => [0, 0, 255]), 'greyscale'), 0, 0)).toEqual([29, 29, 29])
  })

  it('keeps white white and alpha untouched', () => {
    const img = paint(1, 1, () => [255, 255, 255])
    img.data[3] = 128
    const out = applyFilter(img, 'greyscale')
    expect(Array.from(out.data)).toEqual([255, 255, 255, 128])
  })
})

describe('black & white (adaptive threshold)', () => {
  const isBinary = (data: Uint8ClampedArray) => data.every((v, i) => i % 4 === 3 || v === 0 || v === 255)

  it('turns a pixel well below its local mean black and well above it white', () => {
    // Mid-grey paper with one dark dot and one bright dot.
    const img = paint(64, 64, (x, y) => {
      if (Math.floor(x) === 20 && Math.floor(y) === 20) return [40, 40, 40]
      if (Math.floor(x) === 44 && Math.floor(y) === 44) return [250, 250, 250]
      return [160, 160, 160]
    })
    const out = threshold(img)
    expect(pixel(out, 20, 20)).toEqual([0, 0, 0])
    expect(pixel(out, 44, 44)).toEqual([255, 255, 255])
    expect(pixel(out, 5, 5)).toEqual([255, 255, 255])
    expect(isBinary(out.data)).toBe(true)
  })

  it('reads text under a shadow that a global threshold would lose', () => {
    // Paper fades from bright (left) to dark (right); dark text strokes every 8 px are 40% darker
    // than the paper around them. The shadowed paper is darker than the lit text.
    const paper = (x: number) => 230 - x * 1.5
    const img = paint(120, 40, (x) => {
      const v = Math.floor(x) % 8 < 2 ? paper(x) * 0.6 : paper(x)
      return [v, v, v]
    })
    expect(paper(110)).toBeLessThan(paper(10) * 0.6 + 70) // shadowed paper vs. lit ink are close
    const out = threshold(img)
    for (const x of [8, 56, 104]) expect(pixel(out, x, 20)).toEqual([0, 0, 0]) // ink everywhere
    for (const x of [12, 60, 108]) expect(pixel(out, x, 20)).toEqual([255, 255, 255]) // paper everywhere
  })

  it('keeps a flat page white', () => {
    const out = threshold(paint(32, 32, () => [90, 90, 90]))
    expect(out.data.every((v) => v === 255)).toBe(true)
  })
})

describe('magic colour', () => {
  it('stretches a low-contrast page to near full range', () => {
    // Washed-out photo: grey "ink" at 100 on greyish paper at 150.
    const img = paint(50, 50, (x, y) => (Math.floor(x) % 10 < 2 && y > 5 ? [100, 100, 100] : [150, 150, 150]))
    const before = lumaRange(img)
    const after = lumaRange(magic(img))
    expect(before.max - before.min).toBe(50)
    expect(after.min).toBeLessThanOrEqual(5)
    expect(after.max).toBeGreaterThanOrEqual(250)
  })

  it('whitens the paper and keeps ink darker than paper', () => {
    const img = paint(20, 20, (x) => (Math.floor(x) === 3 ? [60, 60, 70] : [190, 185, 175]))
    const out = magic(img)
    expect(pixel(out, 10, 10).every((v) => v >= 250)).toBe(true)
    expect(luma(...(pixel(out, 3, 3) as [number, number, number]))).toBeLessThan(30)
  })

  it('makes coloured ink more saturated, not grey', () => {
    const img = paint(20, 20, (x) => (Math.floor(x) === 3 ? [150, 60, 60] : [200, 200, 200]))
    const [r, g, b] = pixel(magic(img), 3, 3)
    const [r0, g0] = [150, 60]
    expect(r - g).toBeGreaterThan(r0 - g0)
    expect(g).toBe(b)
  })

  it('survives a completely flat image', () => {
    const out = magic(paint(4, 4, () => [128, 128, 128]))
    expect(out.data.every((v) => Number.isFinite(v))).toBe(true)
  })
})

describe('FILTERS', () => {
  it('lists the four filters with names, original first', () => {
    expect(FILTERS.map((f) => f.id)).toEqual(['original', 'greyscale', 'bw', 'magic'])
  })
})
