// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExportPanel } from './ExportPanel'

afterEach(cleanup)

const pages = [new Blob(['1']), new Blob(['2'])]
const pdf = new Blob([new Uint8Array(2048)], { type: 'application/pdf' })
const btn = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement

describe('ExportPanel', () => {
  it('exports with the chosen paper and quality and shares the PDF', async () => {
    const exporter = vi.fn().mockResolvedValue(pdf)
    const hand = vi.fn().mockResolvedValue('shared')
    render(<ExportPanel pages={pages} exporter={exporter} hand={hand} share />)
    expect(btn('A4').getAttribute('aria-pressed')).toBe('true')
    expect(btn('Balanced').getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(btn('Letter'))
    fireEvent.click(btn('Best'))
    fireEvent.click(btn('Share PDF'))
    await screen.findByText(/^Shared Scan .*\.pdf \(2 KB\)\.$/)
    expect(exporter).toHaveBeenCalledWith(pages, 'letter', 'best', expect.any(Object))
    expect(hand.mock.calls[0][0]).toBe(pdf)
    expect(hand.mock.calls[0][1]).toMatch(/^Scan \d{4}-\d\d-\d\d \d\d\.\d\d\.pdf$/)
  })

  it('offers a download where sharing files is not possible', async () => {
    const hand = vi.fn().mockResolvedValue('downloaded')
    render(<ExportPanel pages={pages} exporter={async () => pdf} hand={hand} share={false} />)
    fireEvent.click(btn('Download PDF'))
    await screen.findByText(/^Downloaded Scan/)
  })

  it('shows progress and locks the options while working', async () => {
    let finish: (b: Blob) => void = () => {}
    const exporter = (_p: Blob[], _s: string, _q: string, { onProgress }: { onProgress: (n: number) => void }) =>
      new Promise<Blob>((resolve) => {
        onProgress(1)
        finish = resolve
      })
    render(<ExportPanel pages={pages} exporter={exporter} hand={async () => 'downloaded'} share={false} />)
    fireEvent.click(btn('Download PDF'))
    expect(await screen.findByText('Making page 2 of 2…')).toBeTruthy()
    expect(btn('Fit to page').disabled).toBe(true)
    expect(btn('Download PDF').disabled).toBe(true)
    finish(pdf)
    await waitFor(() => expect(btn('Download PDF').disabled).toBe(false))
  })

  it('goes back to ready when the share sheet is closed', async () => {
    render(<ExportPanel pages={pages} exporter={async () => pdf} hand={async () => 'cancelled'} share />)
    fireEvent.click(btn('Share PDF'))
    await waitFor(() => expect(btn('Share PDF').disabled).toBe(false))
    expect(screen.getByText(/nothing is uploaded/)).toBeTruthy()
  })

  it('says so when the PDF cannot be made', async () => {
    render(<ExportPanel pages={pages} exporter={() => Promise.reject(new Error('x'))} hand={vi.fn()} share />)
    fireEvent.click(btn('Share PDF'))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Couldn't make the PDF/)
  })
})
