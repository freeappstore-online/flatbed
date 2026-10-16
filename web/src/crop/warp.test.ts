import { describe, expect, it } from 'vitest'
import { type Quad, rect } from './perspective'
import { warp } from './warp'
import { inside, paint, pixel } from '../test/images'

const RED: [number, number, number] = [220, 30, 30]
const BLUE: [number, number, number] = [30, 30, 220]
const GREY: [number, number, number] = [40, 40, 40]

describe('warp', () => {
  it('copies pixels unchanged for the full-image quad', () => {
    const img = paint(16, 12, (x, y) => [x * 10, y * 10, 100])
    const out = warp(img, rect(16, 12))
    expect([out.width, out.height]).toEqual([16, 12])
    expect(Array.from(out.data)).toEqual(Array.from(img.data))
  })

  it('crops an axis-aligned region', () => {
    const img = paint(40, 40, (x, y) => (x > 10 && x < 30 && y > 5 && y < 25 ? RED : GREY))
    const quad: Quad = [
      { x: 10, y: 5 },
      { x: 30, y: 5 },
      { x: 30, y: 25 },
      { x: 10, y: 25 },
    ]
    const out = warp(img, quad)
    expect([out.width, out.height]).toEqual([20, 20])
    for (const [x, y] of [[0, 0], [19, 0], [10, 10], [0, 19], [19, 19]]) expect(pixel(out, x, y)).toEqual(RED)
  })

  it('straightens a tilted page: top half red, bottom half blue', () => {
    const page: Quad = [
      { x: 60, y: 30 },
      { x: 150, y: 40 },
      { x: 170, y: 170 },
      { x: 30, y: 150 },
    ]
    // Split along the line joining the midpoints of the left and right edges... in
    // perspective that's not quite halfway, so colour by which side of it we're on.
    const ml = { x: (page[0].x + page[3].x) / 2, y: (page[0].y + page[3].y) / 2 }
    const mr = { x: (page[1].x + page[2].x) / 2, y: (page[1].y + page[2].y) / 2 }
    const img = paint(200, 200, (x, y) => {
      if (!inside(page, { x, y })) return GREY
      return (mr.x - ml.x) * (y - ml.y) - (mr.y - ml.y) * (x - ml.x) < 0 ? RED : BLUE
    })
    const out = warp(img, page)
    const { width: w, height: h } = out
    // Well inside each region (away from the blurry boundaries) the colour is pure.
    expect(pixel(out, Math.floor(w / 2), Math.floor(h * 0.15))).toEqual(RED)
    expect(pixel(out, Math.floor(w * 0.1), Math.floor(h * 0.1))).toEqual(RED)
    expect(pixel(out, Math.floor(w / 2), Math.floor(h * 0.9))).toEqual(BLUE)
    expect(pixel(out, Math.floor(w * 0.9), Math.floor(h * 0.9))).toEqual(BLUE)
    // No background grey leaked in anywhere near the middle of each edge.
    for (const [x, y] of [[2, h >> 1], [w - 3, h >> 1], [w >> 1, 2], [w >> 1, h - 3]])
      expect(pixel(out, x, y)).not.toEqual(GREY)
  })

  it('rotates a quarter turn clockwise', () => {
    // Red stripe along the top of a 30×20 image.
    const img = paint(30, 20, (_x, y) => (y < 5 ? RED : GREY))
    const out = warp(img, rect(30, 20), 1)
    expect([out.width, out.height]).toEqual([20, 30])
    // After turning clockwise, the top edge is on the right.
    expect(pixel(out, 19, 15)).toEqual(RED)
    expect(pixel(out, 0, 15)).toEqual(GREY)
  })

  it('turns half way round', () => {
    const img = paint(10, 10, (_x, y) => (y < 3 ? RED : GREY))
    const out = warp(img, rect(10, 10), 2)
    expect(pixel(out, 5, 9)).toEqual(RED)
    expect(pixel(out, 5, 0)).toEqual(GREY)
  })

  it('scales a huge crop down to the size cap, keeping its shape', () => {
    const img = paint(4, 4, () => RED)
    const big: Quad = rect(8000, 4000)
    const out = warp(img, big, 0, 1000)
    expect([out.width, out.height]).toEqual([1000, 500])
  })
})
