import { describe, expect, it, vi } from 'vitest'
import { applyTorch, supportsTorch } from './torch'

describe('torch controls', () => {
  it('shows support only when the live track reports a torch', () => {
    const track = (capabilities: object) => ({
      applyConstraints: vi.fn(), getCapabilities: () => capabilities,
    }) as unknown as MediaStreamTrack
    expect(supportsTorch(track({ torch: true }))).toBe(true)
    expect(supportsTorch(track({ torch: false }))).toBe(false)
    expect(supportsTorch(track({}))).toBe(false)
    expect(supportsTorch({ getCapabilities: () => { throw Error('unsupported') }, applyConstraints: vi.fn() } as unknown as MediaStreamTrack)).toBe(false)
    expect(supportsTorch(undefined)).toBe(false)
  })

  it('preserves camera constraints and replaces the prior torch request', async () => {
    const applyConstraints = vi.fn().mockResolvedValue(undefined)
    const track = {
      getConstraints: () => ({ width: { ideal: 1920 }, advanced: [{ frameRate: 30 }, { torch: true }] }),
      applyConstraints,
    } as unknown as MediaStreamTrack
    await applyTorch(track, false)
    expect(applyConstraints).toHaveBeenCalledWith({
      width: { ideal: 1920 }, advanced: [{ frameRate: 30 }, { torch: false }],
    })
  })
})
