import type { Quad } from '../crop/perspective'

/** Require a steady page for about 0.7 seconds before taking a photo. */
export function autoCapture() {
  let previous: Quad | null = null
  let steadySince = 0
  let armed = true
  let missing = 0
  const disarm = () => {
    armed = false
    previous = null
    steadySince = 0
    missing = 0
  }

  return {
    captured: disarm,
    observe(quad: Quad | null, now: number): boolean {
      if (!quad) {
        previous = null
        steadySince = 0
        if (++missing >= 3) armed = true
        return false
      }
      missing = 0
      if (!armed) return false
      const steady = previous?.every((point, i) =>
        Math.hypot(point.x - quad[i].x, point.y - quad[i].y) <= 9,
      ) ?? false
      if (!steady) steadySince = now
      previous = quad
      if (steady && now - steadySince >= 700) {
        disarm()
        return true
      }
      return false
    },
  }
}
