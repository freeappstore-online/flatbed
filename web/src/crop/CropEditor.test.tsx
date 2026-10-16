// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CropEditor } from './CropEditor'
import type { Picture } from './image'
import type { Crop, Quad } from './perspective'
import type { Pixels } from './warp'
import { inside, paint } from '../test/images'

afterEach(cleanup)

const W = 320
const H = 360
const PAGE: Quad = [
  { x: 60, y: 40 },
  { x: 260, y: 40 },
  { x: 260, y: 320 },
  { x: 60, y: 320 },
]

/** A fake decoded photo: a white page on a dark desk. */
function fakePicture(close = vi.fn()): Picture {
  const img = paint(W, H, (x, y) => (inside(PAGE, { x, y }) ? [240, 240, 235] : [60, 50, 40]))
  return { width: W, height: H, url: 'blob:photo', pixels: () => img, close }
}
const setup = (props: { initial?: Crop; open?: (b: Blob) => Promise<Picture> } = {}) => {
  const onApply = vi.fn()
  const onSkip = vi.fn()
  const encode = vi.fn(async (p: Pixels) => new Blob([`${p.width}x${p.height}`], { type: 'image/jpeg' }))
  render(
    <CropEditor
      blob={new Blob(['photo'])}
      title="Crop page 1"
      open={props.open ?? (async () => fakePicture())}
      encode={encode}
      initial={props.initial}
      onApply={onApply}
      onSkip={onSkip}
    />,
  )
  return { onApply, onSkip, encode }
}
const corner = (name: string) => screen.getByRole('button', { name: `${name} corner` })
const position = (el: HTMLElement) => ({ x: (parseFloat(el.style.left) / 100) * W, y: (parseFloat(el.style.top) / 100) * H })
const done = () => screen.getByRole('button', { name: 'Done' }) as HTMLButtonElement

describe('CropEditor', () => {
  it('finds the page and puts the corners on it', async () => {
    setup()
    expect(await screen.findByText(/Found the page/)).toBeTruthy()
    const tl = position(corner('Top-left'))
    const br = position(corner('Bottom-right'))
    expect(Math.abs(tl.x - 60)).toBeLessThanOrEqual(4)
    expect(Math.abs(tl.y - 40)).toBeLessThanOrEqual(4)
    expect(Math.abs(br.x - 260)).toBeLessThanOrEqual(4)
    expect(Math.abs(br.y - 320)).toBeLessThanOrEqual(4)
  })

  it('straightens the page at its own size and hands back the crop', async () => {
    const { onApply, encode } = setup()
    await screen.findByText(/Found the page/)
    fireEvent.click(done())
    await waitFor(() => expect(onApply).toHaveBeenCalled())
    const out = encode.mock.calls[0][0]
    expect(Math.abs(out.width - 200)).toBeLessThanOrEqual(8)
    expect(Math.abs(out.height - 280)).toBeLessThanOrEqual(8)
    const [blob, crop] = onApply.mock.calls[0] as [Blob, Crop]
    expect(blob.type).toBe('image/jpeg')
    expect(crop.turns).toBe(0)
  })

  it('rotates in quarter turns', async () => {
    const { onApply, encode } = setup()
    await screen.findByText(/Found the page/)
    fireEvent.click(screen.getByRole('button', { name: 'Rotate right' }))
    expect(screen.getByText('Preview, turned 90°')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Rotate right' }))
    fireEvent.click(screen.getByRole('button', { name: 'Rotate left' }))
    fireEvent.click(done())
    await waitFor(() => expect(onApply).toHaveBeenCalled())
    const out = encode.mock.calls[0][0]
    expect(out.width).toBeGreaterThan(out.height)
    expect((onApply.mock.calls[0][1] as Crop).turns).toBe(1)
  })

  it('moves a corner with the arrow keys, inside the photo', async () => {
    setup()
    await screen.findByText(/Found the page/)
    const before = position(corner('Top-left'))
    fireEvent.keyDown(corner('Top-left'), { key: 'ArrowRight' })
    expect(position(corner('Top-left')).x).toBeCloseTo(before.x + 3.6, 5)
    for (let i = 0; i < 20; i++) fireEvent.keyDown(corner('Top-left'), { key: 'ArrowUp', shiftKey: true })
    expect(position(corner('Top-left')).y).toBe(0)
  })

  it('refuses to straighten when the corners cross', async () => {
    setup()
    await screen.findByText(/Found the page/)
    for (let i = 0; i < 15; i++) fireEvent.keyDown(corner('Top-left'), { key: 'ArrowRight', shiftKey: true })
    expect(screen.getByText(/corners cross over/)).toBeTruthy()
    expect(done().disabled).toBe(true)
  })

  it('switches between the whole photo and the detected page', async () => {
    setup()
    await screen.findByText(/Found the page/)
    fireEvent.click(screen.getByRole('button', { name: 'Whole photo' }))
    expect(position(corner('Bottom-right'))).toEqual({ x: W, y: H })
    fireEvent.click(screen.getByRole('button', { name: 'Auto-detect' }))
    expect(position(corner('Bottom-right')).x).toBeLessThan(W)
  })

  it('starts from a previous crop when there is one', async () => {
    const quad: Quad = [
      { x: 10, y: 10 },
      { x: 100, y: 10 },
      { x: 100, y: 200 },
      { x: 10, y: 200 },
    ]
    setup({ initial: { quad, turns: 2 } })
    await screen.findByText(/Found the page/)
    expect(position(corner('Top-right'))).toEqual({ x: 100, y: 10 })
    expect(screen.getByText('Preview, turned 180°')).toBeTruthy()
  })

  it('keeps the page as it is on request or Escape', async () => {
    const { onSkip, onApply } = setup()
    await screen.findByText(/Found the page/)
    fireEvent.click(screen.getByRole('button', { name: 'Keep as is' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onSkip).toHaveBeenCalledTimes(2)
    expect(onApply).not.toHaveBeenCalled()
  })

  it('says when the image cannot be opened', async () => {
    setup({ open: () => Promise.reject(new Error('HEIC')) })
    expect((await screen.findByRole('alert')).textContent).toMatch(/Couldn't open this image/)
    expect(done().disabled).toBe(true)
  })

  it('frees the decoded photo when it closes', async () => {
    const close = vi.fn()
    setup({ open: async () => fakePicture(close) })
    await screen.findByText(/Found the page/)
    cleanup()
    expect(close).toHaveBeenCalled()
  })
})
