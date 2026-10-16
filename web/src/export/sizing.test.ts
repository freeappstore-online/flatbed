import { describe, expect, it } from 'vitest'
import { PAPER, QUALITIES, formatBytes, pdfName, placement, targetPixels } from './sizing'

const A4 = { w: 595.28, h: 841.89 }

describe('paper sizes', () => {
  it('are A4 (210×297 mm) and US Letter (8.5×11 in) in points', () => {
    expect(PAPER.a4.width).toBeCloseTo(A4.w, 1)
    expect(PAPER.a4.height).toBeCloseTo(A4.h, 1)
    expect(PAPER.letter).toEqual({ width: 612, height: 792 })
  })
})

describe('placement on A4 and Letter', () => {
  it('fills an A4 page exactly with an A4-shaped scan', () => {
    const p = placement(2480, 3508, 'a4') // A4 at 300 dpi
    expect(p.pageWidth).toBeCloseTo(A4.w, 1)
    expect(p.pageHeight).toBeCloseTo(A4.h, 1)
    expect(p.width).toBeCloseTo(p.pageWidth, 0)
    expect(p.height).toBeCloseTo(p.pageHeight, 0)
    expect(p.x).toBeCloseTo(0, 0)
    expect(p.y).toBeCloseTo(0, 0)
  })

  it('centres a narrow receipt left to right, full height', () => {
    const p = placement(600, 3000, 'a4')
    expect(p.height).toBeCloseTo(PAPER.a4.height, 6)
    expect(p.width).toBeCloseTo((PAPER.a4.height * 600) / 3000, 6)
    expect(p.x).toBeCloseTo((PAPER.a4.width - p.width) / 2, 6)
    expect(p.y).toBeCloseTo(0, 6)
  })

  it('centres a square scan top to bottom, full width', () => {
    const p = placement(1000, 1000, 'letter')
    expect([p.pageWidth, p.pageHeight]).toEqual([612, 792])
    expect([p.width, p.height]).toEqual([612, 612])
    expect([p.x, p.y]).toEqual([0, 90])
  })

  it('turns the paper for a landscape scan', () => {
    const p = placement(3000, 2000, 'letter')
    expect([p.pageWidth, p.pageHeight]).toEqual([792, 612])
    // 3:2 on 792×612 is limited by width: 792 × 528.
    expect(p.width).toBe(792)
    expect(p.height).toBe(528)
    expect(p.y).toBe(42)
  })

  it("never stretches: the drawn box keeps the scan's shape and is centred on the page", () => {
    for (const [w, h] of [
      [1, 1],
      [1240, 1754],
      [4000, 300],
      [300, 4000],
      [1700, 2200],
    ])
      for (const paper of ['a4', 'letter'] as const) {
        const p = placement(w, h, paper)
        expect(p.width / p.height).toBeCloseTo(w / h, 6)
        expect(p.x).toBeGreaterThanOrEqual(-1e-9)
        expect(p.y).toBeGreaterThanOrEqual(-1e-9)
        expect(p.x * 2 + p.width).toBeCloseTo(p.pageWidth, 6)
        expect(p.y * 2 + p.height).toBeCloseTo(p.pageHeight, 6)
        // One side always touches the paper edges.
        expect(Math.min(p.x, p.y)).toBeCloseTo(0, 6)
      }
  })
})

describe('placement with fit', () => {
  it("makes the page the scan's shape, long side as long as A4", () => {
    const portrait = placement(1000, 2000, 'fit')
    expect(portrait.pageHeight).toBeCloseTo(A4.h, 1)
    expect(portrait.pageWidth).toBeCloseTo(A4.h / 2, 1)
    expect(portrait).toMatchObject({ x: 0, y: 0, width: portrait.pageWidth, height: portrait.pageHeight })

    const landscape = placement(3000, 1000, 'fit')
    expect(landscape.pageWidth).toBeCloseTo(A4.h, 1)
    expect(landscape.pageHeight).toBeCloseTo(A4.h / 3, 1)
  })
})

describe('targetPixels', () => {
  const dpi = (q: string) => QUALITIES.find((p) => p.id === q)!.dpi

  it('scales a big scan down to the preset resolution on paper', () => {
    const p = placement(3000, 4000, 'a4')
    const t = targetPixels(3000, 4000, p, dpi('balanced'))
    expect(t.width).toBe(Math.round((p.width / 72) * 150))
    expect(t.height / t.width).toBeCloseTo(4000 / 3000, 2)
  })

  it('never scales a small scan up', () => {
    const p = placement(800, 1000, 'a4')
    expect(targetPixels(800, 1000, p, dpi('best'))).toEqual({ width: 800, height: 1000 })
  })

  it('keeps more pixels for better presets', () => {
    const p = placement(4000, 5000, 'letter')
    const [small, balanced, best] = ['small', 'balanced', 'best'].map((q) => targetPixels(4000, 5000, p, dpi(q)).width)
    expect(small).toBeLessThan(balanced)
    expect(balanced).toBeLessThan(best)
  })

  it('raises JPEG quality with resolution', () => {
    const jpeg = QUALITIES.map((q) => q.jpeg)
    expect(jpeg).toEqual([...jpeg].sort())
    expect(jpeg.every((q) => q > 0 && q <= 1)).toBe(true)
  })
})

describe('names and sizes', () => {
  it('names the file by local date and time', () => {
    expect(pdfName(new Date(2026, 9, 6, 9, 5))).toBe('Scan 2026-10-06 09.05.pdf')
  })

  it('formats byte counts', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB')
  })
})
