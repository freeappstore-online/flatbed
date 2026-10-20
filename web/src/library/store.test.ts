import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openDB } from 'idb'
import { NotFoundError, type PageInput, type ScanStore, cleanName, createScanStore } from './store'

let n = 0
const open: ScanStore[] = []

/** A store on a fresh database, with a clock that ticks 1ms per call and readable ids. */
function makeStore(requestPersist = () => Promise.resolve(true)) {
  let t = 1_000
  let id = 0
  const store = createScanStore({ dbName: `test-${++n}`, now: () => t++, newId: () => `scan-${++id}`, requestPersist })
  open.push(store)
  return store
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((s) => s.close()))
})

const page = (id: string, extra: Partial<PageInput> = {}): PageInput => ({
  id,
  blob: new Blob([id], { type: 'image/jpeg' }),
  source: 'camera',
  ...extra,
})
const ids = async (store: ScanStore, scanId: string) => (await store.getPages(scanId)).map((p) => p.id)
// fake-indexeddb clones Blobs as Blobs, so content survives the round trip.
const text = (b: Blob | undefined) => b?.text()

describe('scans', () => {
  it('saves a scan with its pages in order and reads them back', async () => {
    const store = makeStore()
    const scan = await store.createScan('  Lease   agreement ', [page('a'), page('b'), page('c')])
    expect(scan).toMatchObject({ id: 'scan-1', name: 'Lease agreement', pages: ['a', 'b', 'c'] })
    expect(await store.getScan(scan.id)).toEqual(scan)
    const pages = await store.getPages(scan.id)
    expect(pages.map((p) => p.id)).toEqual(['a', 'b', 'c'])
    expect(pages.every((p) => p.scanId === scan.id)).toBe(true)
    expect(await text(pages[1].blob)).toBe('b')
  })

  it('keeps crop, filter and the original image with each page', async () => {
    const store = makeStore()
    const crop = { quad: [{ x: 1, y: 2 }, { x: 3, y: 2 }, { x: 3, y: 4 }, { x: 1, y: 4 }], turns: 1 } as PageInput['crop']
    const scan = await store.createScan('Receipt', [
      page('a', { original: new Blob(['raw']), cropped: new Blob(['cut']), crop, filter: 'bw', adjustments: { brightness: 20, contrast: -15 }, source: 'import' }),
    ])
    const [p] = await store.getPages(scan.id)
    expect(p).toMatchObject({ crop, filter: 'bw', adjustments: { brightness: 20, contrast: -15 }, source: 'import' })
    expect(await text(p.original)).toBe('raw')
    expect(await text(p.cropped)).toBe('cut')
  })

  it('lists scans most recently changed first, each with its first page as cover', async () => {
    const store = makeStore()
    const first = await store.createScan('First', [page('a1'), page('a2')])
    const second = await store.createScan('Second', [page('b1')])
    expect((await store.listScans()).map((s) => s.name)).toEqual(['Second', 'First'])
    await store.renameScan(first.id, 'First, renamed')
    const list = await store.listScans()
    expect(list.map((s) => s.id)).toEqual([first.id, second.id])
    expect(await text(list[0].cover)).toBe('a1')
  })

  it('names an unnamed scan', () => {
    expect(cleanName('   ')).toBe('Untitled scan')
    expect(cleanName('x'.repeat(200))).toHaveLength(120)
  })

  it('asks once for persistent storage, on the first save', async () => {
    const persist = vi.fn().mockResolvedValue(true)
    const store = makeStore(persist)
    await store.createScan('One', [page('a')])
    await store.createScan('Two', [page('b')])
    expect(persist).toHaveBeenCalledTimes(1)
  })
})

describe('rename', () => {
  it('renames a scan and bumps its change time', async () => {
    const store = makeStore()
    const scan = await store.createScan('Scan 2026-10-16 09.05', [page('a')])
    const renamed = await store.renameScan(scan.id, ' Tax return 2025 ')
    expect(renamed.name).toBe('Tax return 2025')
    expect(renamed.updatedAt).toBeGreaterThan(scan.updatedAt)
    expect((await store.getScan(scan.id))?.name).toBe('Tax return 2025')
    expect(await ids(store, scan.id)).toEqual(['a'])
  })

  it('refuses a scan that does not exist', async () => {
    await expect(makeStore().renameScan('nope', 'x')).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('reorder', () => {
  it('moves pages earlier and later, clamped at the ends', async () => {
    const store = makeStore()
    const { id } = await store.createScan('Doc', [page('a'), page('b'), page('c')])
    await store.movePage(id, 0, 1)
    expect(await ids(store, id)).toEqual(['b', 'a', 'c'])
    await store.movePage(id, 2, -2)
    expect(await ids(store, id)).toEqual(['c', 'b', 'a'])
    await store.movePage(id, 0, -1)
    expect(await ids(store, id)).toEqual(['c', 'b', 'a'])
    await store.movePage(id, 2, 5)
    expect(await ids(store, id)).toEqual(['c', 'b', 'a'])
  })
})

describe('pages', () => {
  it('replaces a captured page in place, discards old edits, and persists after reopening', async () => {
    const store = makeStore()
    const { id } = await store.createScan('Doc', [page('a'), page('b', {
      original: new Blob(['old original']), cropped: new Blob(['old crop']), filter: 'bw', source: 'import',
    }), page('c')])
    await store.updatePage(id, page('b', { blob: new Blob(['new capture']) }))
    await store.close()
    const pages = await store.getPages(id)
    expect(pages.map((p) => p.id)).toEqual(['a', 'b', 'c'])
    expect(await Promise.all(pages.map((p) => text(p.blob)))).toEqual(['a', 'new capture', 'c'])
    expect(pages[1]).toMatchObject({ source: 'camera', scanId: id })
    expect(pages[1].original).toBeUndefined()
    expect(pages[1].cropped).toBeUndefined()
    expect(pages[1].filter).toBeUndefined()
    expect(pages[1].crop).toBeUndefined()
  })

  it('adds pages to the end', async () => {
    const store = makeStore()
    const { id } = await store.createScan('Doc', [page('a')])
    await store.addPages(id, [page('b'), page('c')])
    expect(await ids(store, id)).toEqual(['a', 'b', 'c'])
  })

  it('saves a re-edited page in place', async () => {
    const store = makeStore()
    const { id } = await store.createScan('Doc', [page('a'), page('b')])
    await store.updatePage(id, page('b', { blob: new Blob(['b, filtered']), filter: 'greyscale' }))
    const pages = await store.getPages(id)
    expect(pages.map((p) => p.id)).toEqual(['a', 'b'])
    expect(pages[1].filter).toBe('greyscale')
    expect(await text(pages[1].blob)).toBe('b, filtered')
  })

  it("won't save a page into a scan it isn't part of", async () => {
    const store = makeStore()
    const one = await store.createScan('One', [page('a')])
    const two = await store.createScan('Two', [page('b')])
    await expect(store.updatePage(two.id, page('a', { filter: 'bw' }))).rejects.toBeInstanceOf(NotFoundError)
    const [a] = await store.getPages(one.id)
    expect(a.filter).toBeUndefined()
    expect(a.scanId).toBe(one.id)
  })

  it('removes a page from the scan and the database', async () => {
    const store = makeStore()
    const { id } = await store.createScan('Doc', [page('a'), page('b'), page('c')])
    const scan = await store.removePage(id, 'b')
    expect(scan.pages).toEqual(['a', 'c'])
    expect(await ids(store, id)).toEqual(['a', 'c'])
  })
})

describe('delete', () => {
  it('deletes a scan and all its pages, leaving others alone', async () => {
    const store = makeStore()
    const gone = await store.createScan('Gone', [page('a'), page('b')])
    const kept = await store.createScan('Kept', [page('c')])
    await store.deleteScan(gone.id)
    expect(await store.getScan(gone.id)).toBeUndefined()
    expect(await store.getPages(gone.id)).toEqual([])
    expect((await store.listScans()).map((s) => s.name)).toEqual(['Kept'])
    expect(await ids(store, kept.id)).toEqual(['c'])
  })
})

describe('subscribe', () => {
  it('tells listeners after each change until they unsubscribe', async () => {
    const store = makeStore()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    const { id } = await store.createScan('Doc', [page('a'), page('b')])
    await store.renameScan(id, 'Doc 2')
    await store.movePage(id, 0, 1)
    expect(listener).toHaveBeenCalledTimes(3)
    unsubscribe()
    await store.deleteScan(id)
    expect(listener).toHaveBeenCalledTimes(3)
  })
})

describe('persistence', () => {
  it('keeps scans across reopening the database', async () => {
    const dbName = `test-${++n}`
    const a = createScanStore({ dbName, requestPersist: () => Promise.resolve(true) })
    const { id } = await a.createScan('Kept', [page('a', { adjustments: { brightness: 25, contrast: -10 }, original: new Blob(['raw']) })])
    await a.close()
    const b = createScanStore({ dbName })
    open.push(b)
    expect((await b.getScan(id))?.name).toBe('Kept')
    expect(await ids(b, id)).toEqual(['a'])
    expect((await b.getPages(id))[0].adjustments).toEqual({ brightness: 25, contrast: -10 })
    expect(await text((await b.getPages(id))[0].original)).toBe('raw')
  })
})

describe('unfinished drafts', () => {
  it('recovers image blobs and edits after a fresh store opens the same database', async () => {
    const dbName = `test-${++n}`
    const first = createScanStore({ dbName })
    const image = page('a', { source: 'import', original: new Blob(['raw']), filter: 'bw' })
    await first.saveDraft({ kind: 'new', pages: [image] })
    await first.close()
    const reopened = createScanStore({ dbName })
    open.push(reopened)
    const draft = await reopened.getDraft()
    expect(draft).toMatchObject({ kind: 'new', pages: [{ id: 'a', source: 'import', filter: 'bw' }] })
    expect(await text(draft?.pages[0].blob)).toBe('a')
    expect(await text(draft?.pages[0].original)).toBe('raw')
  })

  it('upgrades an existing version-one database without losing saved scans', async () => {
    const dbName = `test-${++n}`
    const old = await openDB(dbName, 1, { upgrade(db) {
      db.createObjectStore('scans', { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt')
      db.createObjectStore('pages', { keyPath: 'id' }).createIndex('scanId', 'scanId')
    } })
    await old.put('scans', { id: 'old', name: 'Earlier', pages: [], createdAt: 1, updatedAt: 1 })
    old.close()
    const store = createScanStore({ dbName })
    open.push(store)
    expect((await store.getScan('old'))?.name).toBe('Earlier')
    await store.saveDraft({ kind: 'new', pages: [page('new')] })
    expect((await store.getDraft())?.pages.map((p) => p.id)).toEqual(['new'])
  })

  it('discards blobs and atomically clears a draft when a new scan is saved', async () => {
    const store = makeStore()
    await store.saveDraft({ kind: 'new', pages: [page('a')] })
    const saved = await store.createScan('Recovered', [page('a')], true)
    expect((await store.listScans()).map((s) => s.id)).toEqual([saved.id])
    expect(await store.getDraft()).toBeUndefined()
    await store.saveDraft({ kind: 'new', pages: [page('b')] })
    await store.discardDraft()
    expect(await store.getDraft()).toBeUndefined()
    expect(await ids(store, saved.id)).toEqual(['a'])
  })

  it('atomically clears an append draft without adding its pages twice', async () => {
    const store = makeStore()
    const saved = await store.createScan('Doc', [page('a')])
    await store.saveDraft({ kind: 'append', scanId: saved.id, pages: [page('b')] })
    await store.addPages(saved.id, [page('b')], true)
    expect(await ids(store, saved.id)).toEqual(['a', 'b'])
    expect(await store.getDraft()).toBeUndefined()
  })

  it('reports a failed draft write, keeps the previous draft, and accepts the next write', async () => {
    let fail = false
    const store = createScanStore({ dbName: `test-${++n}`, now: () => {
      if (fail) { fail = false; throw new Error('QuotaExceededError') }
      return Date.now()
    } })
    open.push(store)
    await store.saveDraft({ kind: 'new', pages: [page('a')] })
    fail = true
    await expect(store.saveDraft({ kind: 'new', pages: [page('b')] })).rejects.toThrow('QuotaExceededError')
    expect((await store.getDraft())?.pages.map((p) => p.id)).toEqual(['a'])
    await store.saveDraft({ kind: 'new', pages: [page('c')] })
    expect((await store.getDraft())?.pages.map((p) => p.id)).toEqual(['c'])
  })
})
