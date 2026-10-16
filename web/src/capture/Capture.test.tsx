// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Capture } from './Capture'
import type { Page } from './camera'

afterEach(cleanup)

const fakeStream = () => {
  const track = { stop: vi.fn() }
  return { stream: { getTracks: () => [track] } as unknown as MediaStream, track }
}
const liveCamera = () => {
  const { stream, track } = fakeStream()
  return { media: { getUserMedia: vi.fn().mockResolvedValue(stream) }, track }
}
const denied = (name: string) => ({
  getUserMedia: () => Promise.reject(Object.assign(new Error(name), { name })),
})
const snap = () => Promise.resolve(new Blob(['jpeg'], { type: 'image/jpeg' }))
const shutter = () => screen.getByRole('button', { name: 'Take photo' }) as HTMLButtonElement
const live = () => waitFor(() => expect(shutter().disabled).toBe(false))
const pickFiles = (files: File[]) =>
  fireEvent.change(screen.getByTestId('import-input'), { target: { files } })

describe('Capture with a camera', () => {
  it('shows the viewfinder and asks for the back camera', async () => {
    const { media } = liveCamera()
    render(<Capture media={media} snap={snap} onDone={() => {}} onCancel={() => {}} />)
    expect(screen.getByLabelText('Camera viewfinder')).toBeTruthy()
    await live()
    expect(media.getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: false }))
    expect(document.activeElement).toBe(shutter())
  })

  it('hands back one page per shot in single-page mode', async () => {
    const onDone = vi.fn()
    render(<Capture media={liveCamera().media} snap={snap} onDone={onDone} onCancel={() => {}} />)
    await live()
    fireEvent.click(shutter())
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    const [pages] = onDone.mock.calls[0] as [Page[]]
    expect(pages).toHaveLength(1)
    expect(pages[0].source).toBe('camera')
  })

  it('shoots when the viewfinder itself is tapped', async () => {
    const onDone = vi.fn()
    render(<Capture media={liveCamera().media} snap={snap} onDone={onDone} onCancel={() => {}} />)
    await live()
    fireEvent.click(screen.getByLabelText('Camera viewfinder'))
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
  })

  it('collects pages in multi-page mode until Done', async () => {
    const onDone = vi.fn()
    render(<Capture media={liveCamera().media} snap={snap} onDone={onDone} onCancel={() => {}} />)
    await live()
    fireEvent.click(screen.getByRole('button', { name: 'Multi-page' }))
    fireEvent.click(shutter())
    await screen.findByAltText('Page 1')
    fireEvent.click(shutter())
    await screen.findByAltText('Page 2')
    fireEvent.click(shutter())
    await screen.findByAltText('Page 3')
    expect(onDone).not.toHaveBeenCalled()
    expect(screen.getByText('3 pages')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Remove page 2' }))
    expect(screen.queryByAltText('Page 3')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onDone).toHaveBeenCalledTimes(1)
    expect((onDone.mock.calls[0][0] as Page[]).length).toBe(2)
  })

  it('says so when the camera has no frame yet', async () => {
    const onDone = vi.fn()
    render(
      <Capture media={liveCamera().media} snap={() => Promise.resolve(null)} onDone={onDone} onCancel={() => {}} />,
    )
    await live()
    fireEvent.click(shutter())
    expect((await screen.findByRole('status')).textContent).toMatch(/still starting/)
    expect(onDone).not.toHaveBeenCalled()
  })

  it('stops the camera when it closes', async () => {
    const { media, track } = liveCamera()
    const view = render(<Capture media={media} snap={snap} onDone={() => {}} onCancel={() => {}} />)
    await live()
    view.unmount()
    expect(track.stop).toHaveBeenCalled()
  })

  it('cancels straight away with no pages, and confirms before discarding pages', async () => {
    const onCancel = vi.fn()
    render(<Capture media={liveCamera().media} snap={snap} onDone={() => {}} onCancel={onCancel} />)
    await live()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)

    cleanup()
    onCancel.mockClear()
    render(<Capture media={liveCamera().media} snap={snap} onDone={() => {}} onCancel={onCancel} />)
    await live()
    fireEvent.click(screen.getByRole('button', { name: 'Multi-page' }))
    fireEvent.click(shutter())
    await screen.findByAltText('Page 1')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Discard 1 page?' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})

describe('Capture without a camera', () => {
  it('explains a denied permission and offers retry and import', async () => {
    const media = { getUserMedia: vi.fn(denied('NotAllowedError').getUserMedia) }
    render(<Capture media={media} snap={snap} onDone={() => {}} onCancel={() => {}} />)
    expect((await screen.findByRole('alert')).textContent).toMatch(/Camera access is off/)
    expect(screen.queryByLabelText('Camera viewfinder')).toBeNull()
    expect(shutter().disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Import photos' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(media.getUserMedia).toHaveBeenCalledTimes(2))
  })

  it('recovers when the retry is allowed', async () => {
    const { stream } = fakeStream()
    const getUserMedia = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('x'), { name: 'NotAllowedError' }))
      .mockResolvedValue(stream)
    render(<Capture media={{ getUserMedia }} snap={snap} onDone={() => {}} onCancel={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    await live()
    expect(screen.getByLabelText('Camera viewfinder')).toBeTruthy()
  })

  it('offers only import when the browser has no camera API', async () => {
    render(<Capture media={{}} snap={snap} onDone={() => {}} onCancel={() => {}} />)
    expect((await screen.findByRole('alert')).textContent).toMatch(/can't use the camera/)
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })

  it('imports photos as pages and skips other files', async () => {
    const onDone = vi.fn()
    render(<Capture media={denied('NotFoundError')} snap={snap} onDone={onDone} onCancel={() => {}} />)
    await screen.findByRole('alert')
    const photos = [new File(['a'], 'a.jpg', { type: 'image/jpeg' }), new File(['b'], 'b.png', { type: 'image/png' })]
    pickFiles([...photos, new File(['c'], 'c.pdf', { type: 'application/pdf' })])
    expect(onDone).toHaveBeenCalledTimes(1)
    const pages = onDone.mock.calls[0][0] as Page[]
    expect(pages.map((p) => p.blob)).toEqual(photos)
    expect(pages.every((p) => p.source === 'import')).toBe(true)
  })

  it('stays open and says why when nothing importable was picked', async () => {
    const onDone = vi.fn()
    render(<Capture media={denied('NotFoundError')} snap={snap} onDone={onDone} onCancel={() => {}} />)
    await screen.findByRole('alert')
    pickFiles([new File(['c'], 'c.pdf', { type: 'application/pdf' })])
    expect(screen.getByRole('status').textContent).toMatch(/Skipped c\.pdf/)
    expect(onDone).not.toHaveBeenCalled()
  })

  it('adds imports to the pages in multi-page mode', async () => {
    const onDone = vi.fn()
    render(<Capture media={liveCamera().media} snap={snap} onDone={onDone} onCancel={() => {}} />)
    await live()
    fireEvent.click(screen.getByRole('button', { name: 'Multi-page' }))
    fireEvent.click(shutter())
    await screen.findByAltText('Page 1')
    pickFiles([new File(['a'], 'a.jpg', { type: 'image/jpeg' })])
    expect(screen.getByAltText('Page 2')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect((onDone.mock.calls[0][0] as Page[]).map((p) => p.source)).toEqual(['camera', 'import'])
  })
})
