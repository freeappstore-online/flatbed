import { describe, expect, it } from 'vitest'
import {
  type Point,
  type Quad,
  apply,
  area,
  clampPoint,
  homography,
  isConvex,
  orderCorners,
  outputSize,
  rect,
  rotateQuad,
  scaleQuad,
} from './perspective'

const near = (a: Point, b: Point, eps = 1e-6) => {
  expect(a.x).toBeCloseTo(b.x, -Math.log10(eps))
  expect(a.y).toBeCloseTo(b.y, -Math.log10(eps))
}
// A page photographed at an angle: narrower at the top.
const tilted: Quad = [
  { x: 120, y: 80 },
  { x: 520, y: 100 },
  { x: 600, y: 700 },
  { x: 40, y: 660 },
]

describe('homography', () => {
  it('maps each corner onto its target', () => {
    const m = homography(tilted, rect(400, 600))!
    rect(400, 600).forEach((target, i) => near(apply(m, tilted[i]), target))
  })

  it('is the identity for a quad onto itself', () => {
    const m = homography(tilted, tilted)!
    const expected = [1, 0, 0, 0, 1, 0, 0, 0, 1]
    m.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 9))
  })

  it('reduces to scale and translation for axis-aligned rectangles', () => {
    const from = rect(100, 50)
    const to: Quad = from.map((p) => ({ x: p.x * 2 + 10, y: p.y * 3 - 5 })) as Quad
    const m = homography(from, to)!
    near(apply(m, { x: 25, y: 10 }), { x: 60, y: 25 })
    expect(m[6]).toBeCloseTo(0, 12)
    expect(m[7]).toBeCloseTo(0, 12)
  })

  it('round-trips with its inverse direction', () => {
    const forward = homography(tilted, rect(400, 600))!
    const back = homography(rect(400, 600), tilted)!
    for (const p of [
      { x: 300, y: 400 },
      { x: 130, y: 90 },
      { x: 580, y: 650 },
    ])
      near(apply(back, apply(forward, p)), p, 1e-6)
  })

  it('keeps straight lines straight (the midpoint of an edge stays on the edge)', () => {
    const m = homography(rect(400, 600), tilted)!
    const mid = apply(m, { x: 200, y: 0 })
    const [tl, tr] = tilted
    // Collinear with the top edge: zero cross product.
    expect((tr.x - tl.x) * (mid.y - tl.y) - (tr.y - tl.y) * (mid.x - tl.x)).toBeCloseTo(0, 6)
    // But not the plain average of the ends: perspective foreshortens.
    const square = homography(rect(1, 1), [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 3, y: 2 },
      { x: -2, y: 2 },
    ])!
    expect(apply(square, { x: 0.5, y: 0.5 }).y).not.toBeCloseTo(1, 3)
  })

  it('refuses degenerate corners', () => {
    const line: Quad = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ]
    expect(homography(line, rect(10, 10))).toBeNull()
  })
})

describe('outputSize', () => {
  it('uses the longer of each pair of opposite edges', () => {
    expect(outputSize(rect(300, 200))).toEqual({ width: 300, height: 200 })
    const trapezoid: Quad = [
      { x: 50, y: 0 },
      { x: 150, y: 0 },
      { x: 200, y: 100 },
      { x: 0, y: 100 },
    ]
    expect(outputSize(trapezoid).width).toBe(200)
    expect(outputSize(trapezoid).height).toBe(Math.round(Math.hypot(50, 100)))
  })

  it('never returns zero', () => {
    const p = { x: 5, y: 5 }
    expect(outputSize([p, p, p, p])).toEqual({ width: 1, height: 1 })
  })
})

describe('orderCorners', () => {
  it('orders shuffled corners clockwise from top-left', () => {
    const shuffled = [tilted[2], tilted[0], tilted[3], tilted[1]]
    expect(orderCorners(shuffled)).toEqual(tilted)
  })

  it('handles a page turned 45°', () => {
    const diamond = [
      { x: 100, y: 0 },
      { x: 200, y: 100 },
      { x: 100, y: 200 },
      { x: 0, y: 100 },
    ]
    const q = orderCorners([diamond[2], diamond[3], diamond[0], diamond[1]])
    expect(isConvex(q)).toBe(true)
    expect(area(q)).toBeGreaterThan(0)
  })
})

describe('isConvex and area', () => {
  it('accepts a clockwise page and rejects crossed or reversed corners', () => {
    expect(isConvex(tilted)).toBe(true)
    expect(isConvex([tilted[0], tilted[2], tilted[1], tilted[3]])).toBe(false)
    expect(isConvex([tilted[3], tilted[2], tilted[1], tilted[0]])).toBe(false)
  })

  it('rejects a dented quad', () => {
    expect(isConvex([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 30, y: 30 }, { x: 0, y: 100 }])).toBe(false)
  })

  it('measures area with the shoelace formula', () => {
    expect(area(rect(30, 20))).toBe(600)
  })
})

describe('rotateQuad', () => {
  it('turns clockwise by relabelling corners', () => {
    const [tl, tr, br, bl] = tilted
    expect(rotateQuad(tilted, 1)).toEqual([bl, tl, tr, br])
    expect(rotateQuad(tilted, 2)).toEqual([br, bl, tl, tr])
    expect(rotateQuad(tilted, 3)).toEqual([tr, br, bl, tl])
  })

  it('wraps whole and negative turns', () => {
    expect(rotateQuad(tilted, 4)).toEqual(tilted)
    expect(rotateQuad(tilted, -1)).toEqual(rotateQuad(tilted, 3))
  })

  it('swaps the output width and height on a quarter turn', () => {
    expect(outputSize(rotateQuad(rect(300, 200), 1))).toEqual({ width: 200, height: 300 })
  })

  it('maps the old bottom-left corner to the new top-left', () => {
    const m = homography(rect(200, 300), rotateQuad(rect(300, 200), 1))!
    near(apply(m, { x: 0, y: 0 }), { x: 0, y: 200 })
  })
})

describe('helpers', () => {
  it('scales and clamps', () => {
    expect(scaleQuad(rect(10, 20), 2)[2]).toEqual({ x: 20, y: 40 })
    expect(scaleQuad(rect(10, 20), 2, 0.5)[2]).toEqual({ x: 20, y: 10 })
    expect(clampPoint({ x: -5, y: 120 }, 100, 100)).toEqual({ x: 0, y: 100 })
  })
})
