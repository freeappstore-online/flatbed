import { describe, expect, it } from 'vitest'
import { applyAdjustments } from './adjustments'

describe('applyAdjustments', () => {
  const source = { width: 2, height: 1, data: new Uint8ClampedArray([40, 130, 220, 255, 220, 130, 40, 128]) }

  it('keeps default pixels and the source unchanged', () => {
    const copy = new Uint8ClampedArray(source.data)
    expect(applyAdjustments(source, { brightness: 0, contrast: 0 }).data).toEqual(copy)
    expect(source.data).toEqual(copy)
  })

  it('brightens, darkens, and changes contrast around middle grey', () => {
    expect([...applyAdjustments(source, { brightness: 20, contrast: 0 }).data.slice(0, 4)]).toEqual([91, 181, 255, 255])
    expect([...applyAdjustments(source, { brightness: -20, contrast: 0 }).data.slice(0, 4)]).toEqual([0, 79, 169, 255])
    expect([...applyAdjustments(source, { brightness: 0, contrast: 50 }).data.slice(0, 4)]).toEqual([0, 131, 255, 255])
    expect([...applyAdjustments(source, { brightness: 0, contrast: -100 }).data.slice(4, 8)]).toEqual([128, 128, 128, 128])
  })

  it('clamps out-of-range settings and preserves alpha', () => {
    const adjusted = applyAdjustments(source, { brightness: 1000, contrast: Number.NaN })
    expect([...adjusted.data.slice(4, 8)]).toEqual([255, 255, 255, 128])
  })
})
