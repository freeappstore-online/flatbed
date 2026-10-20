import { expect, it } from 'vitest'
import { autoCapture } from './auto'
import type { Quad } from '../crop/perspective'

const page: Quad = [
  { x: 20, y: 20 }, { x: 300, y: 20 }, { x: 300, y: 320 }, { x: 20, y: 320 },
]

it('captures a steady page once and waits for it to leave before rearming', () => {
  const capture = autoCapture()
  for (let t = 0; t < 700; t += 100) expect(capture.observe(page, t)).toBe(false)
  expect(capture.observe(page, 700)).toBe(true)
  for (let t = 800; t < 2000; t += 100) expect(capture.observe(page, t)).toBe(false)
  for (let t = 2000; t <= 2200; t += 100) expect(capture.observe(null, t)).toBe(false)
  expect(capture.observe(page, 2300)).toBe(false)
  expect(capture.observe(page, 3000)).toBe(true)
})

it('does not capture a page whose corners keep moving', () => {
  const capture = autoCapture()
  for (let t = 0; t <= 2000; t += 100) {
    const shifted = page.map((point) => ({ x: point.x + t / 10, y: point.y })) as Quad
    expect(capture.observe(shifted, t)).toBe(false)
  }
})

it('does not automatically recapture a page after a manual shutter press', () => {
  const capture = autoCapture()
  capture.observe(page, 0)
  capture.observe(page, 600)
  capture.captured()
  for (let t = 700; t < 1800; t += 100) expect(capture.observe(page, t)).toBe(false)
})
