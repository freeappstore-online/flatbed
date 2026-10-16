// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PrivacyNote } from './Privacy'

afterEach(cleanup)

describe('PrivacyNote', () => {
  it('says images and PDFs never leave the device and discloses the analytics', () => {
    render(<PrivacyNote />)
    const note = screen.getByRole('region', { name: /Privacy/ })
    const text = note.textContent ?? ''
    expect(text).toMatch(/Images and PDFs never leave it/)
    expect(text).toMatch(/nothing is uploaded/)
    expect(text).toMatch(/IndexedDB/)
    expect(text).toMatch(/store analytics script/)
    expect(text).toMatch(/Cloudflare Web Analytics/)
    expect(text).toMatch(/Your scans, their pages and their names are never included/)
  })
})
