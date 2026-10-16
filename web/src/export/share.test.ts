import { describe, expect, it, vi } from 'vitest'
import { canShareFiles, deliver } from './share'

const pdf = new Blob(['%PDF-'], { type: 'application/pdf' })

describe('deliver', () => {
  it('opens the share sheet with the PDF where files can be shared', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const download = vi.fn()
    const how = await deliver(pdf, 'Scan.pdf', { nav: { canShare: () => true, share }, download })
    expect(how).toBe('shared')
    const { files, title } = share.mock.calls[0][0]
    expect(files[0].name).toBe('Scan.pdf')
    expect(files[0].type).toBe('application/pdf')
    expect(title).toBe('Scan.pdf')
    expect(download).not.toHaveBeenCalled()
  })

  it('downloads where sharing files is not supported', async () => {
    const download = vi.fn()
    expect(await deliver(pdf, 'Scan.pdf', { nav: {}, download })).toBe('downloaded')
    expect(await deliver(pdf, 'Scan.pdf', { nav: { canShare: () => false, share: vi.fn() }, download })).toBe(
      'downloaded',
    )
    expect(download).toHaveBeenCalledTimes(2)
    expect(download).toHaveBeenCalledWith(pdf, 'Scan.pdf')
  })

  it('does nothing more when the person closes the share sheet', async () => {
    const download = vi.fn()
    const share = vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'AbortError' }))
    expect(await deliver(pdf, 'Scan.pdf', { nav: { canShare: () => true, share }, download })).toBe('cancelled')
    expect(download).not.toHaveBeenCalled()
  })

  it('falls back to downloading when sharing fails', async () => {
    const download = vi.fn()
    const share = vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'NotAllowedError' }))
    expect(await deliver(pdf, 'Scan.pdf', { nav: { canShare: () => true, share }, download })).toBe('downloaded')
    expect(download).toHaveBeenCalled()
  })
})

describe('canShareFiles', () => {
  it('needs both share and a canShare that accepts files', () => {
    expect(canShareFiles({})).toBe(false)
    expect(canShareFiles({ canShare: () => true })).toBe(false)
    expect(canShareFiles({ canShare: () => true, share: vi.fn() })).toBe(true)
    const throws = () => {
      throw new TypeError()
    }
    expect(canShareFiles({ canShare: throws, share: vi.fn() })).toBe(false)
  })
})
