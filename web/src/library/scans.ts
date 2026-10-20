import { useEffect, useState } from 'react'
import type { Page } from '../capture/camera'
import { type PageInput, type ScanStore, type StoredPage, createScanStore } from './store'

/** The app's one store. Opens IndexedDB lazily, on the first read or write. */
export const scans: ScanStore = createScanStore()

/** A page for saving: everything but its object URL. */
export function toInput({ url: _url, ...page }: Page): PageInput {
  return page
}

/** A saved page for showing, with a new object URL (free it with releasePages). */
export function toPage({ scanId: _scanId, ...page }: StoredPage): Page {
  return { ...page, url: URL.createObjectURL(page.blob) }
}

export function draftPage(page: PageInput): Page {
  return { ...page, url: URL.createObjectURL(page.blob) }
}

/**
 * Loads from the store and reloads after every write, so screens stay
 * current. Undefined until the first load finishes.
 */
export function useStore<T>(store: ScanStore, load: (store: ScanStore) => Promise<T>, key: unknown = null): T | undefined {
  const [value, setValue] = useState<T>()
  useEffect(() => {
    let cancelled = false
    let run = 0
    const reload = () => {
      const current = ++run
      load(store).then(
        (v) => {
          if (!cancelled && current === run) setValue(() => v)
        },
        (err: unknown) => console.error('Flatbed: loading saved scans failed', err),
      )
    }
    reload()
    const unsubscribe = store.subscribe(reload)
    return () => {
      cancelled = true
      unsubscribe()
    }
    // `load` is usually an inline arrow; `key` says when it changes.
  }, [store, key])
  return value
}
