// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Picture } from '../crop/image'
import type { Pixels } from '../crop/warp'
import { paint } from '../test/images'
import { FilterEditor } from './FilterEditor'
import type { Filter } from './filters'
import { filterBlob } from './render'

afterEach(cleanup)

const RED = paint(4, 4, () => [255, 0, 0])
const fakePicture = (close = vi.fn()): Picture => ({ width: 4, height: 4, url: 'blob:p', pixels: () => RED, close })
const encodeAsText = vi.fn(async (p: Pixels) => new Blob([Array.from(p.data.slice(0, 3)).join(',')]))

const setup = (props: { initial?: Filter; open?: (b: Blob) => Promise<Picture> } = {}) => {
  const onApply = vi.fn()
  const onSkip = vi.fn()
  const blob = new Blob(['page'])
  render(
    <FilterEditor
      blob={blob}
      title="Filter page 1"
      initial={props.initial}
      open={props.open ?? (async () => fakePicture())}
      encode={encodeAsText}
      onApply={onApply}
      onSkip={onSkip}
    />,
  )
  return { onApply, onSkip, blob }
}
const choice = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement
const ready = () => screen.findByRole('img', { name: /Preview/ })

describe('FilterEditor', () => {
  it('offers the four filters with the current one chosen', async () => {
    setup({ initial: 'bw' })
    await ready()
    for (const name of ['Original', 'Greyscale', 'Black & white', 'Magic colour']) expect(choice(name)).toBeTruthy()
    expect(choice('Black & white').getAttribute('aria-pressed')).toBe('true')
    expect(choice('Original').getAttribute('aria-pressed')).toBe('false')
  })

  it('previews the chosen filter', async () => {
    setup()
    await ready()
    expect(screen.getByRole('img', { name: 'Preview: Original' })).toBeTruthy()
    fireEvent.click(choice('Greyscale'))
    expect(screen.getByRole('img', { name: 'Preview: Greyscale' })).toBeTruthy()
    expect(choice('Greyscale').getAttribute('aria-pressed')).toBe('true')
  })

  it('applies the chosen filter to the whole page', async () => {
    const { onApply } = setup()
    await ready()
    fireEvent.click(choice('Greyscale'))
    fireEvent.click(choice('Done'))
    await waitFor(() => expect(onApply).toHaveBeenCalled())
    const [filter, blob] = onApply.mock.calls[0] as [Filter, Blob]
    expect(filter).toBe('greyscale')
    expect(await blob.text()).toBe('76,76,76')
  })

  it('hands back the same page for Original, without re-encoding', async () => {
    encodeAsText.mockClear()
    const { onApply, blob } = setup({ initial: 'magic' })
    await ready()
    fireEvent.click(choice('Original'))
    fireEvent.click(choice('Done'))
    await waitFor(() => expect(onApply).toHaveBeenCalledWith('original', blob))
    expect(encodeAsText).not.toHaveBeenCalled()
  })

  it('keeps the page as it is on request or Escape', async () => {
    const { onSkip, onApply } = setup()
    await ready()
    fireEvent.click(choice('Keep as is'))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onSkip).toHaveBeenCalledTimes(2)
    expect(onApply).not.toHaveBeenCalled()
  })

  it('says when the image cannot be opened', async () => {
    setup({ open: () => Promise.reject(new Error('bad')) })
    expect((await screen.findByRole('alert')).textContent).toMatch(/Couldn't open this image/)
    expect(choice('Done').disabled).toBe(true)
    expect(choice('Greyscale').disabled).toBe(true)
  })
})

describe('filterBlob', () => {
  it('applies the filter and frees the decoded image', async () => {
    const close = vi.fn()
    const out = await filterBlob(new Blob(['x']), 'greyscale', async () => fakePicture(close), encodeAsText)
    expect(await out.text()).toBe('76,76,76')
    expect(close).toHaveBeenCalled()
  })

  it('returns the same blob for Original without decoding', async () => {
    const blob = new Blob(['x'])
    const open = vi.fn()
    expect(await filterBlob(blob, 'original', open)).toBe(blob)
    expect(open).not.toHaveBeenCalled()
  })
})
