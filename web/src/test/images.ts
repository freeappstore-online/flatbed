import type { Point } from '../crop/perspective'
import type { Pixels } from '../crop/warp'

/** A w×h image filled by `colour(x, y)` (pixel centres), as RGBA pixels. */
export function paint(w: number, h: number, colour: (x: number, y: number) => [number, number, number]): Pixels {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = colour(x + 0.5, y + 0.5)
      data.set([r, g, b, 255], (y * w + x) * 4)
    }
  return { width: w, height: h, data }
}

/** Whether p is inside the convex polygon (clockwise on screen). */
export function inside(polygon: Point[], p: Point) {
  return polygon.every((a, i) => {
    const b = polygon[(i + 1) % polygon.length]
    return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) >= 0
  })
}

export function pixel(img: Pixels, x: number, y: number) {
  const i = (y * img.width + x) * 4
  return [img.data[i], img.data[i + 1], img.data[i + 2]]
}
