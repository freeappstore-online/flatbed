// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Library } from './Library'
import { ScanView } from './ScanView'
import { type PageInput, type ScanStore, createScanStore } from './store'

let n = 0
const stores: ScanStore[] = []
afterEach(async () => {
  cleanup()
  await Promise.all(stores.splice(0).map((s) => s.close()))
})

function makeStore() {
  let t = 1_000
  const store = createScanStore({ dbName: `ui-${++n}`, now: () => t++, requestPersist: () => Promise.resolve(true) })
  stores.push(store)
  return store
}
const page = (id: string): PageInput => ({ id, blob: new Blob([id], { type: 'image/jpeg' }), source: 'camera' })
const btn = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement
const pageOrder = async (store: ScanStore, id: string) => (await store.getPages(id)).map((p) => p.id)

async function openScan(
  pages = ['a', 'b', 'c'],
  props: Partial<Parameters<typeof ScanView>[0]> = {},
  prepare?: (store: ScanStore, inputs: PageInput[]) => void,
) {
  const store = makeStore()
  const inputs = pages.map(page)
  const scan = await store.createScan('Lease', inputs)
  prepare?.(store, inputs)
  const onClose = vi.fn()
  render(<ScanView store={store} scanId={scan.id} onClose={onClose} {...props} />)
  await screen.findByRole('heading', { name: 'Lease' })
  return { store, scan, onClose }
}

describe('Library', () => {
  it('offers a recovered draft to resume or discard after reopening', async () => {
    const store = makeStore()
    await store.saveDraft({ kind: 'new', pages: [page('a'), page('b')] })
    const view = render(<Library store={store} onOpen={() => {}} onPrivacy={() => {}} />)
    expect((await screen.findByRole('region', { name: 'Unfinished scan' })).textContent).toMatch(/2 pages were saved on this device/)
    expect(btn('New scan').disabled).toBe(true)
    fireEvent.click(btn('Resume'))
    expect(await screen.findByRole('heading', { name: 'Review 2 pages' })).toBeTruthy()
    view.unmount()
    render(<Library store={store} onOpen={() => {}} onPrivacy={() => {}} />)
    expect(await screen.findByRole('region', { name: 'Unfinished scan' })).toBeTruthy()
    fireEvent.click(btn('Discard'))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Unfinished scan' })).toBeNull())
    expect(await store.getDraft()).toBeUndefined()
  })

  it('warns during capture when the draft cannot be saved', async () => {
    const store = makeStore()
    vi.spyOn(store, 'saveDraft').mockRejectedValue(new Error('QuotaExceededError'))
    render(<Library store={store} onOpen={() => {}} onPrivacy={() => {}} />)
    await waitFor(() => expect(btn('New scan').disabled).toBe(false))
    fireEvent.click(btn('New scan'))
    fireEvent.change(screen.getByTestId('import-input'), { target: { files: [new File(['photo'], 'page.jpg', { type: 'image/jpeg' })] } })
    expect((await screen.findByText(/Couldn't back up these pages/)).getAttribute('role')).toBe('alert')
  })

  it('keeps capture available if checking for a draft fails', async () => {
    const store = makeStore()
    vi.spyOn(store, 'getDraft').mockRejectedValue(new Error('IndexedDB unavailable'))
    render(<Library store={store} onOpen={() => {}} onPrivacy={() => {}} />)
    expect((await screen.findByRole('alert')).textContent).toMatch(/Couldn't check for an unfinished scan/)
    expect(btn('New scan').disabled).toBe(false)
  })

  it('lists saved scans newest first with their page counts', async () => {
    const store = makeStore()
    await store.createScan('Older', [page('a')])
    await store.createScan('Newer', [page('b'), page('c')])
    const onOpen = vi.fn()
    render(<Library store={store} onOpen={onOpen} onPrivacy={() => {}} />)
    const items = await screen.findAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringMatching(/^Newer2 pages · /),
      expect.stringMatching(/^Older1 page · /),
    ])
    fireEvent.click(within(items[1]).getByRole('button'))
    expect(onOpen).toHaveBeenCalledWith(expect.any(String))
  })

  it('says when there are no scans, and links to the privacy note', async () => {
    const onPrivacy = vi.fn()
    render(<Library store={makeStore()} onOpen={() => {}} onPrivacy={onPrivacy} />)
    expect(await screen.findByText(/No scans yet/)).toBeTruthy()
    expect(screen.getByText(/kept only in this browser on this device/)).toBeTruthy()
    fireEvent.click(btn('Privacy'))
    expect(onPrivacy).toHaveBeenCalled()
  })

  it('shows a scan the moment it is saved elsewhere', async () => {
    const store = makeStore()
    render(<Library store={store} onOpen={() => {}} onPrivacy={() => {}} />)
    await screen.findByText(/No scans yet/)
    await store.createScan('Fresh', [page('a')])
    expect(await screen.findByText('Fresh')).toBeTruthy()
  })
})

describe('ScanView', () => {
  it('shows the pages in order', async () => {
    await openScan()
    expect(screen.getByRole('heading', { name: '3 pages' })).toBeTruthy()
    expect(screen.getAllByRole('img').map((i) => i.getAttribute('alt'))).toEqual(['Page 1', 'Page 2', 'Page 3'])
  })

  it('renames the scan and saves the new name', async () => {
    const { store, scan } = await openScan()
    fireEvent.click(btn('Rename'))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  Lease 2026 ' } })
    fireEvent.click(btn('Save'))
    expect(await screen.findByRole('heading', { name: 'Lease 2026' })).toBeTruthy()
    expect((await store.getScan(scan.id))?.name).toBe('Lease 2026')
  })

  it('leaves the name alone when renaming is cancelled', async () => {
    const { store, scan } = await openScan()
    fireEvent.click(btn('Rename'))
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Other' } })
    fireEvent.click(btn('Cancel'))
    expect(screen.getByRole('heading', { name: 'Lease' })).toBeTruthy()
    expect((await store.getScan(scan.id))?.name).toBe('Lease')
  })

  it('reorders pages and saves the order', async () => {
    const { store, scan } = await openScan()
    expect(btn('Move page 1 earlier').disabled).toBe(true)
    expect(btn('Move page 3 later').disabled).toBe(true)
    fireEvent.click(btn('Move page 1 later'))
    await waitFor(async () => expect(await pageOrder(store, scan.id)).toEqual(['b', 'a', 'c']))
    fireEvent.click(btn('Move page 3 earlier'))
    await waitFor(async () => expect(await pageOrder(store, scan.id)).toEqual(['b', 'c', 'a']))
  })

  it('moves a page directly across several positions and persists it', async () => {
    const { store, scan } = await openScan(['a', 'b', 'c', 'd', 'e'])
    fireEvent.click(btn('Move page 1'))
    expect(btn('Move page 1').getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(btn('Place page 1 at position 5'))
    await waitFor(async () => expect(await pageOrder(store, scan.id)).toEqual(['b', 'c', 'd', 'e', 'a']))
    expect(screen.queryByRole('button', { name: 'Place page 1 at position 5' })).toBeNull()
  })

  it('accepts a pointer drag onto a distant page', async () => {
    const { store, scan } = await openScan(['a', 'b', 'c', 'd'])
    const handle = btn('Move page 1')
    const target = btn('Review page 4').closest('li')!
    Object.defineProperty(handle, 'setPointerCapture', { value: vi.fn() })
    const previous = Object.getOwnPropertyDescriptor(document, 'elementFromPoint')
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => target })
    try {
      fireEvent.pointerDown(handle, { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10 })
      fireEvent.pointerMove(handle, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 })
      fireEvent.pointerUp(handle, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 })
    } finally {
      if (previous) Object.defineProperty(document, 'elementFromPoint', previous)
      else Reflect.deleteProperty(document, 'elementFromPoint')
    }
    await waitFor(async () => expect(await pageOrder(store, scan.id)).toEqual(['b', 'c', 'd', 'a']))
  })

  it('removes a page from the scan', async () => {
    const { store, scan } = await openScan()
    fireEvent.click(btn('Remove page 2'))
    expect(screen.getByRole('heading', { name: '2 pages' })).toBeTruthy()
    await waitFor(async () => expect(await pageOrder(store, scan.id)).toEqual(['a', 'c']))
  })

  it('deletes the scan only after confirming', async () => {
    const { store, scan, onClose } = await openScan()
    fireEvent.click(btn('Delete scan'))
    const dialog = screen.getByRole('alertdialog')
    expect(dialog.textContent).toMatch(/Delete “Lease” and its 3 pages/)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep it' }))
    expect(await store.getScan(scan.id)).toBeDefined()
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.click(btn('Delete scan'))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(await store.getScan(scan.id)).toBeUndefined()
    expect(await store.getPages(scan.id)).toEqual([])
  })

  it('re-exports the saved pages, in their current order, named after the scan', async () => {
    const exporter = vi.fn().mockResolvedValue(new Blob(['%PDF-'], { type: 'application/pdf' }))
    // Under jsdom, Blobs read back from fake-indexeddb lose their contents (the store tests, in
    // Node, check contents survive). Hand back the original Blobs so the order is checked by identity.
    let originals: Blob[] = []
    await openScan(['a', 'b', 'c', 'd'], { exporter }, (store, inputs) => {
      originals = inputs.map((p) => p.blob)
      const getPages = store.getPages.bind(store)
      vi.spyOn(store, 'getPages').mockImplementation(async (id) =>
        (await getPages(id)).map((p) => ({ ...p, blob: inputs.find((i) => i.id === p.id)!.blob })),
      )
    })
    fireEvent.click(btn('Move page 1'))
    fireEvent.click(btn('Place page 1 at position 4'))
    fireEvent.click(btn(/^(Share|Download) PDF$/))
    await waitFor(() => expect(exporter).toHaveBeenCalled())
    const [blobs, paper, quality] = exporter.mock.calls[0]
    expect(blobs).toEqual([originals[1], originals[2], originals[3], originals[0]])
    expect((blobs as Blob[])[0]).toBe(originals[1])
    expect([paper, quality]).toEqual(['a4', 'balanced'])
  })

  it('says so when the scan no longer exists', async () => {
    const onClose = vi.fn()
    render(<ScanView store={makeStore()} scanId="gone" onClose={onClose} />)
    expect(await screen.findByRole('heading', { name: 'Scan not found' })).toBeTruthy()
    fireEvent.click(btn('All scans'))
    expect(onClose).toHaveBeenCalled()
  })

  it('says so, and shows what is really saved, when a change cannot be saved', async () => {
    const { store, scan } = await openScan()
    vi.spyOn(store, 'removePage').mockRejectedValueOnce(new Error('QuotaExceededError'))
    fireEvent.click(btn('Remove page 1'))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Couldn't save that change/)
    await waitFor(() => expect(screen.getByRole('heading', { name: '3 pages' })).toBeTruthy())
    expect(await pageOrder(store, scan.id)).toEqual(['a', 'b', 'c'])
  })
})
