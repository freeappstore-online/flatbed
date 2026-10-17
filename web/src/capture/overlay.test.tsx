// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Capture } from './Capture'
import { detectQuad } from '../crop/edges'

vi.mock('../crop/edges', () => ({ DETECT_SIDE: 360, detectQuad: vi.fn() }))

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.mocked(detectQuad).mockReset()
})

async function viewfinder(width: number, height: number) {
  const context = {
    clearRect: vi.fn(), drawImage: vi.fn(), getImageData: vi.fn(() => ({ width: 360, height: 180 })),
    beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(),
    fill: vi.fn(), stroke: vi.fn(), fillRect: vi.fn(),
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
  const media = { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop() {} }] }) }
  const snap = vi.fn().mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }))
  const view = render(<Capture media={media} snap={snap} onDone={() => {}} onCancel={() => {}} />)
  await waitFor(() => expect((screen.getByRole('button', { name: 'Take photo' }) as HTMLButtonElement).disabled).toBe(false))
  const video = screen.getByLabelText('Camera viewfinder')
  Object.defineProperties(video, {
    clientWidth: { configurable: true, value: width }, clientHeight: { configurable: true, value: height },
    videoWidth: { value: 1280 }, videoHeight: { value: 640 }, readyState: { value: 2 },
  })
  vi.mocked(detectQuad).mockReturnValue([
    { x: 90, y: 45 }, { x: 270, y: 45 }, { x: 270, y: 135 }, { x: 90, y: 135 },
  ])
  vi.useFakeTimers()
  // Restart the effect under fake timers by taking a multi-page capture.
  fireEvent.click(screen.getByRole('button', { name: 'Multi-page' }))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Take photo' })) })
  return { ...view, context, video, snap }
}

it.each([
  [400, 400, 100, 150], // Letterbox above and below a landscape camera image.
  [800, 200, 300, 50], // Letterbox on the left and right.
])('maps corners into a %s x %s viewfinder and clears missing detections', async (width, height, x, y) => {
  const { context, video } = await viewfinder(width, height)
  act(() => vi.advanceTimersByTime(100))
  expect(context.drawImage).toHaveBeenCalledWith(video, 0, 0, 360, 180)
  expect(context.moveTo).toHaveBeenCalledWith(x, y)
  expect(context.fillRect).toHaveBeenCalledWith(x - 4, y - 4, 8, 8)
  vi.mocked(detectQuad).mockReturnValue(null)
  context.stroke.mockClear()
  act(() => vi.advanceTimersByTime(100))
  expect(context.clearRect).toHaveBeenLastCalledWith(0, 0, width, height)
  expect(context.stroke).not.toHaveBeenCalled()
})

it('stops during capture, resumes for another page, and stops on dismissal and unmount', async () => {
  const { context, snap, unmount } = await viewfinder(400, 400)
  act(() => vi.advanceTimersByTime(100))
  let resolve!: (blob: Blob | null) => void
  snap.mockImplementationOnce(() => new Promise<Blob | null>((done) => { resolve = done }))
  fireEvent.click(screen.getByRole('button', { name: 'Take photo' }))
  vi.mocked(detectQuad).mockClear()
  act(() => vi.advanceTimersByTime(500))
  expect(detectQuad).not.toHaveBeenCalled()
  await act(async () => { resolve(null) })
  act(() => vi.advanceTimersByTime(100))
  expect(detectQuad).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  fireEvent.click(screen.getByRole('button', { name: 'Discard 1 page?' }))
  vi.mocked(detectQuad).mockClear()
  act(() => vi.advanceTimersByTime(500))
  expect(detectQuad).not.toHaveBeenCalled()
  expect(context.clearRect).toHaveBeenCalled()
  unmount()
  expect(vi.getTimerCount()).toBe(0)
})

it('skips frames with zero display dimensions', async () => {
  const { context } = await viewfinder(0, 0)
  act(() => vi.advanceTimersByTime(300))
  expect(context.drawImage).not.toHaveBeenCalled()
  expect(detectQuad).not.toHaveBeenCalled()
})
