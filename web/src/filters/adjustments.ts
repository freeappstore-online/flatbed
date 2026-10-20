import type { Pixels } from '../crop/warp'

/** Values are percentages in the range -100 to 100; zero leaves the image unchanged. */
export type Adjustments = { brightness: number; contrast: number }
export const DEFAULT_ADJUSTMENTS: Adjustments = { brightness: 0, contrast: 0 }

const clamp = (value: number) => Math.max(-100, Math.min(100, Number.isFinite(value) ? value : 0))

/** Adjusts a filtered image without modifying its source pixels. */
export function applyAdjustments(src: Pixels, adjustments: Adjustments): Pixels {
  const gain = 1 + clamp(adjustments.contrast) / 100
  const offset = clamp(adjustments.brightness) * 2.55
  const out = new Uint8ClampedArray(src.data.length)
  for (let i = 0; i < out.length; i += 4) {
    out[i] = (src.data[i] - 128) * gain + 128 + offset
    out[i + 1] = (src.data[i + 1] - 128) * gain + 128 + offset
    out[i + 2] = (src.data[i + 2] - 128) * gain + 128 + offset
    out[i + 3] = src.data[i + 3]
  }
  return { width: src.width, height: src.height, data: out }
}

export const hasAdjustments = ({ brightness, contrast }: Adjustments) => brightness !== 0 || contrast !== 0
