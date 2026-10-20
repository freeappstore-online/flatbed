// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Page } from '../capture/camera'
import { PageReview } from './PageReview'

const pages = ['a', 'b', 'c'].map((id) => ({ id, url: `blob:${id}` })) as Page[]
afterEach(cleanup)

function setup(pageId = 'b') {
  const onPageChange = vi.fn()
  const onClose = vi.fn()
  const onCrop = vi.fn()
  const onFilter = vi.fn()
  const onRemove = vi.fn()
  const onRetake = vi.fn()
  const props = { pages, pageId, onPageChange, onClose, onCrop, onFilter, onRemove, onRetake }
  const rendered = render(<PageReview {...props} />)
  const dialog = screen.getByRole('dialog', { name: `Review page ${pages.findIndex((p) => p.id === pageId) + 1}` })
  return { ...rendered, props, dialog, onPageChange, onClose, onCrop, onFilter, onRemove, onRetake }
}

describe('PageReview', () => {
  it('navigates in order by buttons and keyboard, and exposes edits for the current page', () => {
    const result = setup()
    const button = (name: string) => within(result.dialog).getByRole('button', { name })
    fireEvent.click(button('Previous page'))
    expect(result.onPageChange).toHaveBeenCalledWith('a')
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(result.onPageChange).toHaveBeenCalledWith('c')
    fireEvent.click(button('Crop page 2'))
    fireEvent.click(button('Filter page 2'))
    fireEvent.click(button('Retake page 2'))
    fireEvent.click(button('Remove page 2'))
    for (const action of [result.onCrop, result.onFilter, result.onRetake, result.onRemove]) expect(action).toHaveBeenCalledWith('b')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(result.onClose).toHaveBeenCalledOnce()
  })

  it('zooms with controls and a double click, then resets for another page', () => {
    const result = setup()
    const image = within(result.dialog).getByRole('img', { name: 'Page 2 full-size preview' })
    const area = within(result.dialog).getByLabelText('Page 2 image; pinch or double tap to zoom')
    fireEvent.click(within(result.dialog).getByRole('button', { name: 'Zoom in' }))
    expect(within(result.dialog).getByRole('status').textContent).toBe('150%')
    fireEvent.doubleClick(area, { clientX: 0, clientY: 0 })
    expect(within(result.dialog).getByRole('status').textContent).toBe('100%')
    fireEvent.doubleClick(area, { clientX: 0, clientY: 0 })
    expect(image.getAttribute('style')).toContain('scale(2.5)')
    result.rerender(<PageReview {...result.props} pageId="c" />)
    expect(screen.getByRole('dialog', { name: 'Review page 3' }).textContent).toContain('100%')
  })

  it('pinches to zoom on touch pointers', () => {
    const { dialog } = setup()
    const area = within(dialog).getByLabelText('Page 2 image; pinch or double tap to zoom')
    Object.defineProperty(area, 'clientWidth', { value: 300 })
    Object.defineProperty(area, 'clientHeight', { value: 400 })
    Object.defineProperty(area, 'setPointerCapture', { value: vi.fn() })
    fireEvent.pointerDown(area, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 200 })
    fireEvent.pointerDown(area, { pointerId: 2, pointerType: 'touch', clientX: 200, clientY: 200 })
    fireEvent.pointerMove(area, { pointerId: 2, pointerType: 'touch', clientX: 300, clientY: 200 })
    expect(within(dialog).getByRole('status').textContent).toBe('200%')
  })

  it('toggles zoom on a touch double tap', () => {
    const { dialog } = setup()
    const area = within(dialog).getByLabelText('Page 2 image; pinch or double tap to zoom')
    Object.defineProperty(area, 'setPointerCapture', { value: vi.fn() })
    for (const id of [1, 2]) {
      fireEvent.pointerDown(area, { pointerId: id, pointerType: 'touch', clientX: 50, clientY: 80 })
      fireEvent.pointerUp(area, { pointerId: id, pointerType: 'touch', clientX: 50, clientY: 80 })
    }
    expect(within(dialog).getByRole('status').textContent).toBe('250%')
    // Mobile browsers may also synthesize a double-click after the touch events.
    fireEvent.doubleClick(area, { clientX: 50, clientY: 80 })
    expect(within(dialog).getByRole('status').textContent).toBe('250%')
    for (const id of [3, 4]) {
      fireEvent.pointerDown(area, { pointerId: id, pointerType: 'touch', clientX: 50, clientY: 80 })
      fireEvent.pointerUp(area, { pointerId: id, pointerType: 'touch', clientX: 50, clientY: 80 })
    }
    expect(within(dialog).getByRole('status').textContent).toBe('100%')
  })
})
