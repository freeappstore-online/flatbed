// Saved scans. Local-only: scans and their page images live in IndexedDB on
// this device and nothing here makes a network request. The database opens
// lazily on first use, so importing this module doesn't touch IndexedDB.

import { type DBSchema, type IDBPDatabase, openDB } from 'idb'
import { movePage } from '../capture/camera'
import type { Crop } from '../crop/perspective'
import type { Filter } from '../filters/filters'
import type { Adjustments } from '../filters/adjustments'

export const DB_NAME = 'flatbed'
const DB_VERSION = 2

/** A saved scan: its name and the order of its pages. */
export type Scan = {
  id: string
  name: string
  /** Page ids, in document order. */
  pages: string[]
  createdAt: number
  updatedAt: number
}

/** One page of a scan, with everything needed to redo its crop and filter. */
export type StoredPage = {
  id: string
  scanId: string
  /** The page as it is now (cropped and filtered). */
  blob: Blob
  source: 'camera' | 'import'
  original?: Blob
  cropped?: Blob
  crop?: Crop
  filter?: Filter
  adjustments?: Adjustments
}

/** A page as the editor holds it; the store adds the scan id. */
export type PageInput = Omit<StoredPage, 'scanId'>

/** The one unfinished batch on this device. Images stay in IndexedDB. */
export type ScanDraft = {
  id: 'active'
  kind: 'new' | 'append'
  scanId?: string
  pages: PageInput[]
  updatedAt: number
}

/** A scan for the list: its first page for a thumbnail. */
export type ScanSummary = Scan & { cover?: Blob }

interface FlatbedDB extends DBSchema {
  scans: { key: string; value: Scan; indexes: { updatedAt: number } }
  pages: { key: string; value: StoredPage; indexes: { scanId: string } }
  drafts: { key: string; value: ScanDraft }
}

export interface ScanStore {
  /** Every scan, most recently changed first, with its cover page. */
  listScans(): Promise<ScanSummary[]>
  getScan(id: string): Promise<Scan | undefined>
  /** A scan's pages, in order. */
  getPages(scanId: string): Promise<StoredPage[]>
  createScan(name: string, pages: PageInput[], finishDraft?: boolean): Promise<Scan>
  renameScan(id: string, name: string): Promise<Scan>
  /** Adds pages to the end of a scan. */
  addPages(scanId: string, pages: PageInput[], finishDraft?: boolean): Promise<Scan>
  getDraft(): Promise<ScanDraft | undefined>
  saveDraft(draft: Omit<ScanDraft, 'id' | 'updatedAt'>): Promise<void>
  discardDraft(): Promise<void>
  /** Saves a page's new image and edits. */
  updatePage(scanId: string, page: PageInput): Promise<void>
  /** Moves the page at `from` by `by` places (-1 earlier, +1 later), clamped to the ends. */
  movePage(scanId: string, from: number, by: number): Promise<Scan>
  removePage(scanId: string, pageId: string): Promise<Scan>
  /** Deletes a scan and all its pages. */
  deleteScan(id: string): Promise<void>
  /** Calls `listener` after every change; returns an unsubscribe. */
  subscribe(listener: () => void): () => void
  close(): Promise<void>
}

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`)
    this.name = 'NotFoundError'
  }
}

/** Trims a scan name; an empty one falls back to "Untitled scan". */
export function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, 120) || 'Untitled scan'
}

export function createScanStore({
  dbName = DB_NAME,
  now = () => Date.now(),
  newId = () => crypto.randomUUID(),
  requestPersist = () => navigator.storage?.persist?.() ?? Promise.resolve(false),
}: {
  dbName?: string
  now?: () => number
  newId?: () => string
  /** Asks the browser not to evict saved scans when space runs low. */
  requestPersist?: () => Promise<boolean>
} = {}): ScanStore {
  let db: Promise<IDBPDatabase<FlatbedDB>> | undefined
  let askedPersist = false
  let draftWrite: Promise<void> = Promise.resolve()
  const listeners = new Set<() => void>()

  const open = () =>
    (db ??= openDB<FlatbedDB>(dbName, DB_VERSION, {
      upgrade(d, oldVersion) {
        if (oldVersion < 1) {
          d.createObjectStore('scans', { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt')
          d.createObjectStore('pages', { keyPath: 'id' }).createIndex('scanId', 'scanId')
        }
        if (oldVersion < 2) d.createObjectStore('drafts', { keyPath: 'id' })
      },
    }))

  const changed = () => listeners.forEach((l) => l())

  // Serialize writes so a slow image clone cannot restore an older draft after
  // a newer edit, discard, or final save.
  const queueDraft = (write: () => Promise<void>) => {
    const pending = draftWrite.catch(() => {}).then(write)
    draftWrite = pending.catch(() => {})
    return pending
  }

  /** Runs `edit` on a scan inside one read-write transaction over both stores, then saves it. */
  async function editScan(
    id: string,
    edit: (scan: Scan, pages: IDBPObjectStoreLike) => Promise<Partial<Scan> | void> | Partial<Scan> | void,
    finishDraft = false,
  ): Promise<Scan> {
    if (finishDraft) await draftWrite
    const tx = (await open()).transaction(finishDraft ? ['scans', 'pages', 'drafts'] : ['scans', 'pages'], 'readwrite')
    const scan = await tx.objectStore('scans').get(id)
    if (!scan) {
      tx.abort()
      await tx.done.catch(() => {})
      throw new NotFoundError('Scan')
    }
    let changes: Partial<Scan> | void
    try {
      changes = await edit(scan, tx.objectStore('pages'))
    } catch (err) {
      tx.abort()
      await tx.done.catch(() => {})
      throw err
    }
    const saved = { ...scan, ...changes, updatedAt: now() }
    await tx.objectStore('scans').put(saved)
    if (finishDraft) await tx.objectStore('drafts').delete('active')
    await tx.done
    changed()
    return saved
  }

  return {
    async getDraft() {
      await draftWrite
      return (await open()).get('drafts', 'active')
    },

    saveDraft(draft) {
      return queueDraft(async () => {
        const tx = (await open()).transaction('drafts', 'readwrite')
        if (draft.pages.length) await tx.store.put({ ...draft, id: 'active', updatedAt: now() })
        else await tx.store.delete('active')
        await tx.done
        changed()
      })
    },

    discardDraft() {
      return queueDraft(async () => {
        const tx = (await open()).transaction('drafts', 'readwrite')
        await tx.store.delete('active')
        await tx.done
        changed()
      })
    },

    async listScans() {
      const d = await open()
      const scans = (await d.getAllFromIndex('scans', 'updatedAt')).reverse()
      return Promise.all(
        scans.map(async (scan) => ({ ...scan, cover: scan.pages[0] ? (await d.get('pages', scan.pages[0]))?.blob : undefined })),
      )
    },

    async getScan(id) {
      return (await open()).get('scans', id)
    },

    async getPages(scanId) {
      const d = await open()
      const scan = await d.get('scans', scanId)
      if (!scan) return []
      const pages = await d.getAllFromIndex('pages', 'scanId', scanId)
      const byId = new Map(pages.map((p) => [p.id, p]))
      return scan.pages.map((id) => byId.get(id)).filter((p): p is StoredPage => p !== undefined)
    },

    async createScan(name, pages, finishDraft = false) {
      if (finishDraft) await draftWrite
      const t = now()
      const scan: Scan = { id: newId(), name: cleanName(name), pages: pages.map((p) => p.id), createdAt: t, updatedAt: t }
      const tx = (await open()).transaction(finishDraft ? ['scans', 'pages', 'drafts'] : ['scans', 'pages'], 'readwrite')
      await Promise.all([
        tx.objectStore('scans').add(scan),
        ...pages.map((p) => tx.objectStore('pages').put({ ...p, scanId: scan.id })),
        ...(finishDraft ? [tx.objectStore('drafts').delete('active')] : []),
        tx.done,
      ])
      changed()
      if (!askedPersist) {
        askedPersist = true
        requestPersist().catch(() => false)
      }
      return scan
    },

    renameScan(id, name) {
      return editScan(id, () => ({ name: cleanName(name) }))
    },

    addPages(scanId, pages, finishDraft = false) {
      return editScan(scanId, async (scan, store) => {
        for (const p of pages) await store.put({ ...p, scanId })
        return { pages: [...scan.pages, ...pages.map((p) => p.id)] }
      }, finishDraft)
    },

    async updatePage(scanId, page) {
      await editScan(scanId, async (scan, store) => {
        if (!scan.pages.includes(page.id)) throw new NotFoundError('Page')
        await store.put({ ...page, scanId })
      })
    },

    movePage(scanId, from, by) {
      return editScan(scanId, (scan) => ({ pages: movePage(scan.pages, from, by) }))
    },

    removePage(scanId, pageId) {
      return editScan(scanId, async (scan, store) => {
        await store.delete(pageId)
        return { pages: scan.pages.filter((id) => id !== pageId) }
      })
    },

    async deleteScan(id) {
      const tx = (await open()).transaction(['scans', 'pages'], 'readwrite')
      const pageIds = await tx.objectStore('pages').index('scanId').getAllKeys(id)
      await Promise.all([...pageIds.map((k) => tx.objectStore('pages').delete(k)), tx.objectStore('scans').delete(id), tx.done])
      changed()
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    async close() {
      if (db) (await db).close()
      db = undefined
    },
  }
}

/** The bit of an idb object store editScan's callers use. */
type IDBPObjectStoreLike = {
  put(value: StoredPage): Promise<unknown>
  delete(key: string): Promise<unknown>
}
