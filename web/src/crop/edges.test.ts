import { describe, expect, it } from 'vitest'
import { detectQuad } from './edges'
import { type Point, type Quad, isConvex } from './perspective'
import { inside, paint } from '../test/images'

const WHITE: [number, number, number] = [240, 238, 230]
const DESK: [number, number, number] = [70, 55, 45]

/** A white page on a dark desk, with some grey "text" lines on the page. */
function photo(w: number, h: number, page: Quad) {
  return paint(w, h, (x, y) => {
    if (!inside(page, { x, y })) return DESK
    const line = Math.floor(y) % 14 < 2 && x > page[0].x + 30 && x < page[1].x - 30
    return line ? [120, 120, 120] : WHITE
  })
}

const close = (found: Quad, expected: Quad, tolerance: number) =>
  found.forEach((p: Point, i) => {
    expect(Math.abs(p.x - expected[i].x)).toBeLessThanOrEqual(tolerance)
    expect(Math.abs(p.y - expected[i].y)).toBeLessThanOrEqual(tolerance)
  })

describe('detectQuad', () => {
  it('finds an upright page', () => {
    const page: Quad = [
      { x: 60, y: 40 },
      { x: 260, y: 40 },
      { x: 260, y: 320 },
      { x: 60, y: 320 },
    ]
    const found = detectQuad(photo(320, 360, page))
    expect(found).not.toBeNull()
    close(found!, page, 4)
  })

  it('finds a page shot at an angle', () => {
    const page: Quad = [
      { x: 90, y: 50 },
      { x: 250, y: 70 },
      { x: 290, y: 330 },
      { x: 40, y: 300 },
    ]
    const found = detectQuad(photo(320, 360, page))!
    expect(isConvex(found)).toBe(true)
    close(found, page, 5)
  })

  it('finds a page turned about 30°', () => {
    const c = { x: 180, y: 180 }
    const a = Math.PI / 6
    const corner = (dx: number, dy: number) => ({
      x: c.x + dx * Math.cos(a) - dy * Math.sin(a),
      y: c.y + dx * Math.sin(a) + dy * Math.cos(a),
    })
    // Clockwise from the corner that ends up top-left after the turn.
    const page: Quad = [corner(-90, -120), corner(90, -120), corner(90, 120), corner(-90, 120)]
    const found = detectQuad(photo(360, 360, page))!
    expect(found).not.toBeNull()
    // Whatever corner is labelled top-left, the same four points come back.
    for (const p of page)
      expect(found.some((q) => Math.abs(q.x - p.x) <= 5 && Math.abs(q.y - p.y) <= 5)).toBe(true)
  })

  it('gives null for a blank photo', () => {
    expect(detectQuad(paint(200, 200, () => DESK))).toBeNull()
  })

  it('ignores a small object', () => {
    const scrap: Quad = [
      { x: 90, y: 90 },
      { x: 120, y: 90 },
      { x: 120, y: 120 },
      { x: 90, y: 120 },
    ]
    expect(detectQuad(photo(300, 300, scrap))).toBeNull()
  })

  it('gives null for tiny images', () => {
    expect(detectQuad(paint(4, 4, () => WHITE))).toBeNull()
  })
})
