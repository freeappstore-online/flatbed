// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FullScreen } from './FullScreen'

afterEach(cleanup)

function Page({ open }: { open: boolean }) {
  return (
    <>
      <button type="button">Behind</button>
      {open && (
        <FullScreen label="Crop page 1">
          <button type="button">Inside</button>
        </FullScreen>
      )}
    </>
  )
}

describe('FullScreen', () => {
  it('is a labelled modal dialog that makes the rest of the page inert', () => {
    const view = render(<Page open />)
    const dialog = screen.getByRole('dialog', { name: 'Crop page 1' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(view.container.inert).toBe(true)
    expect(dialog.closest('[inert]')).toBeNull()
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('takes focus when opened and gives it back when closed', () => {
    const view = render(<Page open={false} />)
    const behind = screen.getByRole('button', { name: 'Behind' })
    behind.focus()
    view.rerender(<Page open />)
    expect(document.activeElement).toBe(screen.getByRole('dialog'))
    view.rerender(<Page open={false} />)
    expect(view.container.inert).toBe(false)
    expect(document.body.style.overflow).toBe('')
    expect(document.activeElement).toBe(behind)
  })

  it('stays dark whatever the theme', () => {
    render(<Page open />)
    expect(screen.getByRole('dialog').className).toMatch(/bg-black/)
    expect(screen.getByRole('dialog').className).toMatch(/\[color-scheme:dark\]/)
  })
})
