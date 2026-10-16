import { PDFDocument } from 'pdf-lib'
import { describe, expect, it, vi } from 'vitest'
import type { Picture } from '../crop/image'
import type { Pixels } from '../crop/warp'
import { fakeJpeg } from '../test/jpeg'
import { buildPdf, exportPdf } from './pdf'

const sizes = async (bytes: Uint8Array) =>
  (await PDFDocument.load(bytes)).getPages().map((p) => {
    const { width, height } = p.getSize()
    return [Math.round(width), Math.round(height)]
  })

describe('buildPdf', () => {
  it('makes one page per image, in order, sized for the paper', async () => {
    const pdf = await buildPdf([fakeJpeg(1240, 1754), fakeJpeg(1754, 1240), fakeJpeg(600, 600)], 'a4')
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-')
    expect(await sizes(pdf)).toEqual([
      [595, 842],
      [842, 595],
      [595, 842],
    ])
  })

  it('uses Letter and fit sizes', async () => {
    expect(await sizes(await buildPdf([fakeJpeg(850, 1100)], 'letter'))).toEqual([[612, 792]])
    expect(await sizes(await buildPdf([fakeJpeg(1000, 500)], 'fit'))).toEqual([[842, 421]])
  })

  it('records Flatbed as the creator', async () => {
    const doc = await PDFDocument.load(await buildPdf([fakeJpeg(10, 10)], 'a4'))
    expect(doc.getCreator()).toBe('Flatbed')
  })
})

describe('exportPdf', () => {
  /** A fake decoded page that records the size it was asked to shrink to. */
  const picture = (w: number, h: number) => {
    const asked: (number | undefined)[] = []
    const close = vi.fn()
    const pic: Picture = {
      width: w,
      height: h,
      url: 'blob:x',
      pixels: (maxSide) => {
        asked.push(maxSide)
        const s = Math.min(1, (maxSide ?? Infinity) / Math.max(w, h))
        return { width: Math.round(w * s), height: Math.round(h * s), data: new Uint8ClampedArray(0) }
      },
      close,
    }
    return { pic, asked, close }
  }
  const encode = vi.fn(async (p: Pixels, _quality: number) => new Blob([fakeJpeg(p.width, p.height) as BlobPart]))

  it('scales each page to the preset, encodes at its quality and frees it', async () => {
    const a = picture(3000, 4000)
    const b = picture(500, 700)
    const pics = [a.pic, b.pic]
    const progress: number[] = []
    const pdf = await exportPdf([new Blob(['a']), new Blob(['b'])], 'a4', 'balanced', {
      open: async () => pics.shift()!,
      encode,
      onProgress: (n) => progress.push(n),
    })
    expect(pdf.type).toBe('application/pdf')
    // A 3:4 page on A4 is limited by the 8.27 in width: 1240 px at 150 dpi, so 1654 px tall.
    expect(a.asked[0]).toBe(1654)
    // A small page keeps its own size.
    expect(b.asked[0]).toBe(700)
    expect(encode.mock.calls.map((c) => c[1])).toEqual([0.75, 0.75])
    expect(progress).toEqual([1, 2])
    expect(a.close).toHaveBeenCalled()
    expect(b.close).toHaveBeenCalled()
    expect(await sizes(new Uint8Array(await pdf.arrayBuffer()))).toEqual([
      [595, 842],
      [595, 842],
    ])
  })

  it('frees the page even if encoding fails', async () => {
    const a = picture(100, 100)
    await expect(
      exportPdf([new Blob(['a'])], 'fit', 'small', {
        open: async () => a.pic,
        encode: () => Promise.reject(new Error('x')),
      }),
    ).rejects.toThrow()
    expect(a.close).toHaveBeenCalled()
  })
})
