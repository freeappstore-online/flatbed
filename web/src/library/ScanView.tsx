import { type ComponentProps, type FormEvent, useEffect, useRef, useState } from 'react'
import { PageHeader } from '@freeappstore/sdk/ui'
import { Capture } from '../capture/Capture'
import { type Page, movePage, releasePages, uncropped, unfiltered } from '../capture/camera'
import { CropEditor } from '../crop/CropEditor'
import { ExportPanel } from '../export/ExportPanel'
import { FilterEditor } from '../filters/FilterEditor'
import { FILTERS, type Filter } from '../filters/filters'
import { filterBlob } from '../filters/render'
import { toInput, toPage } from './scans'
import type { Scan, ScanStore } from './store'

/** One edit waiting for a page. */
type Step = { id: string; kind: 'crop' | 'filter' }

const SAVE_FAILED = "Couldn't save that change. Your browser's storage for this site may be full."
// At least 24×24 px to tap (WCAG 2.2 target size).
const link = 'inline-flex min-h-6 min-w-6 items-center justify-center underline disabled:no-underline disabled:opacity-40'

/**
 * One saved scan: its pages (crop, filter, reorder, remove, add more), its
 * name, PDF export and delete. Every change is saved to the device as it's made.
 */
export function ScanView({
  store,
  scanId,
  edit = [],
  onClose,
  exporter,
}: {
  store: ScanStore
  scanId: string
  /** New pages to crop and then filter, in order, when the scan opens. */
  edit?: string[]
  onClose: () => void
  /** For tests. */
  exporter?: ComponentProps<typeof ExportPanel>['exporter']
}) {
  const [scan, setScan] = useState<Scan | null | undefined>()
  const [pages, setPages] = useState<Page[]>([])
  // Edits waiting their turn: each new page is cropped, then filtered.
  const [steps, setSteps] = useState<Step[]>(() => edit.flatMap(newSteps))
  // New pages start with the filter chosen last, so a run of pages is quick.
  const [lastFilter, setLastFilter] = useState<Filter>('original')
  const [capturing, setCapturing] = useState(false)
  const [error, setError] = useState('')
  const held = useRef(pages)
  held.current = pages
  useEffect(() => () => releasePages(held.current), [])

  useEffect(() => {
    let cancelled = false
    Promise.all([store.getScan(scanId), store.getPages(scanId)]).then(
      ([found, stored]) => {
        if (cancelled) return
        setScan(found ?? null)
        setPages(stored.map(toPage))
      },
      () => !cancelled && setScan(null),
    )
    return () => {
      cancelled = true
    }
  }, [store, scanId])

  /** Runs a save; on failure says so and reloads what's really stored. Resolves whether it saved. */
  const save = async (write: () => Promise<unknown>): Promise<boolean> => {
    try {
      setError('')
      await write()
      return true
    } catch {
      setError(SAVE_FAILED)
      const [found, stored] = await Promise.all([store.getScan(scanId), store.getPages(scanId)])
      releasePages(held.current)
      setScan(found ?? null)
      setPages(stored.map(toPage))
      return false
    }
  }

  if (scan === undefined) return <p className="text-[var(--muted)]">Opening the scan…</p>
  if (scan === null)
    return (
      <>
        <PageHeader title="Scan not found" description="It may have been deleted." />
        <button type="button" onClick={onClose} className={link}>
          All scans
        </button>
      </>
    )

  // The first waiting step whose page still exists.
  const step = steps.find((s) => pages.some((p) => p.id === s.id))
  const editing = step && pages.find((p) => p.id === step.id)!
  const editingNumber = editing ? pages.indexOf(editing) + 1 : 0
  const nextStep = () => setSteps((q) => q.filter((s) => s !== step))

  // Swaps in a page's new image (and whatever else changed), freeing the old one, and saves it.
  const update = (id: string, blob: Blob, changes: Partial<Page>) => {
    const old = pages.find((p) => p.id === id)
    if (!old) return
    const page: Page = { ...old, original: old.original ?? old.blob, ...changes, blob, url: URL.createObjectURL(blob) }
    releasePages([old])
    setPages((all) => all.map((p) => (p.id === id ? page : p)))
    save(() => store.updatePage(scanId, toInput(page)))
  }

  const remove = (id: string) => {
    releasePages(pages.filter((p) => p.id === id))
    setPages(pages.filter((p) => p.id !== id))
    setSteps((q) => q.filter((s) => s.id !== id))
    save(() => store.removePage(scanId, id))
  }

  const move = (from: number, by: number) => {
    setPages(movePage(pages, from, by))
    save(() => store.movePage(scanId, from, by))
  }

  return (
    <>
      <button type="button" onClick={onClose} className="mb-3 text-sm underline">
        ← All scans
      </button>
      <PageHeader title={scan.name} />
      <NameEditor
        name={scan.name}
        onRename={(name) =>
          save(async () => {
            setScan(await store.renameScan(scanId, name))
          })
        }
      />
      {error && (
        <p role="alert" className="mt-3 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}

      <section className="mt-6" aria-labelledby="pages-heading">
        <div className="flex items-center justify-between gap-3">
          <h2 id="pages-heading" className="font-semibold text-[var(--ink)]">
            {pages.length} {pages.length === 1 ? 'page' : 'pages'}
          </h2>
          <button
            type="button"
            onClick={() => setCapturing(true)}
            className="rounded-[var(--radius-sm)] border border-[var(--line-strong)] px-3 py-2 text-sm font-semibold text-[var(--ink)] hover:bg-[var(--panel-strong)]"
          >
            Add pages
          </button>
        </div>
        {pages.length === 0 && <p className="mt-2 text-sm text-[var(--muted)]">This scan has no pages. Add some to export it.</p>}
        <ol className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {pages.map((page, i) => (
            <li key={page.id} className="rounded-[var(--radius)] border border-[var(--line)] p-2">
              <img src={page.url} alt={`Page ${i + 1}`} className="aspect-[3/4] w-full rounded object-cover" />
              <p className="mt-2 text-sm text-[var(--muted)]">
                Page {i + 1}
                {page.filter && page.filter !== 'original' && (
                  <> · {FILTERS.find((f) => f.id === page.filter)?.name}</>
                )}
              </p>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className={link} aria-label={`Move page ${i + 1} earlier`}>
                  ↑
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === pages.length - 1} className={link} aria-label={`Move page ${i + 1} later`}>
                  ↓
                </button>
                <button type="button" onClick={() => setSteps([{ id: page.id, kind: 'crop' }])} className={link} aria-label={`Crop page ${i + 1}`}>
                  Crop
                </button>
                <button type="button" onClick={() => setSteps([{ id: page.id, kind: 'filter' }])} className={link} aria-label={`Filter page ${i + 1}`}>
                  Filter
                </button>
                <button type="button" onClick={() => remove(page.id)} className={link} aria-label={`Remove page ${i + 1}`}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <ExportPanel pages={pages.map((p) => p.blob)} name={scan.name} exporter={exporter} />

      <DeleteScan name={scan.name} pages={pages.length} onDelete={async () => (await save(() => store.deleteScan(scanId))) && onClose()} />

      {capturing && (
        <Capture
          onCancel={() => setCapturing(false)}
          onDone={(added) => {
            setCapturing(false)
            setPages((all) => [...all, ...added])
            setSteps((q) => [...q, ...added.map((p) => p.id).flatMap(newSteps)])
            save(() => store.addPages(scanId, added.map(toInput)))
          }}
        />
      )}

      {editing && step.kind === 'crop' && (
        <CropEditor
          key={editing.id}
          blob={uncropped(editing)}
          initial={editing.crop}
          title={`Crop page ${editingNumber}`}
          onSkip={nextStep}
          onApply={async (cropped, crop) => {
            // A page that already has a filter gets it again on the new crop.
            const blob = editing.filter ? await filterBlob(cropped, editing.filter).catch(() => cropped) : cropped
            update(editing.id, blob, { cropped, crop })
            nextStep()
          }}
        />
      )}

      {editing && step.kind === 'filter' && (
        <FilterEditor
          key={editing.id}
          blob={unfiltered(editing)}
          initial={editing.filter ?? lastFilter}
          title={`Filter page ${editingNumber}`}
          onSkip={nextStep}
          onApply={(filter, blob) => {
            update(editing.id, blob, { filter })
            setLastFilter(filter)
            nextStep()
          }}
        />
      )}
    </>
  )
}

const newSteps = (id: string): Step[] => [
  { id, kind: 'crop' },
  { id, kind: 'filter' },
]

/** Renames the scan inline. */
function NameEditor({ name, onRename }: { name: string; onRename: (name: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(name)

  if (!editing)
    return (
      <button
        type="button"
        onClick={() => {
          setValue(name)
          setEditing(true)
        }}
        className="text-sm underline"
      >
        Rename
      </button>
    )

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setEditing(false)
    if (value.trim() && value.trim() !== name) onRename(value)
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <label className="grid gap-1 text-sm font-semibold text-[var(--ink)]">
        Name
        <input
          // Focus follows the person's own tap on Rename.
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
          maxLength={120}
          className="w-64 max-w-full rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 font-normal text-[var(--ink)]"
        />
      </label>
      <button type="submit" className="rounded-[var(--radius-sm)] bg-[var(--ink)] px-3 py-2 text-sm font-semibold text-[var(--paper)]">
        Save
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        className="rounded-[var(--radius-sm)] border border-[var(--line-strong)] px-3 py-2 text-sm font-semibold text-[var(--ink)]"
      >
        Cancel
      </button>
    </form>
  )
}

/** Deletes the scan after a second, explicit confirmation. */
function DeleteScan({ name, pages, onDelete }: { name: string; pages: number; onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false)
  return (
    <section className="mt-6" aria-label="Delete scan">
      {confirming ? (
        <div role="alertdialog" aria-labelledby="delete-question" className="rounded-[var(--radius)] border border-[var(--danger)] p-4">
          <p id="delete-question" className="text-sm text-[var(--ink)]">
            Delete “{name}” and its {pages} {pages === 1 ? 'page' : 'pages'} from this device? This can't be undone.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={onDelete}
              className="rounded-[var(--radius-sm)] bg-[var(--danger)] px-3 py-2 text-sm font-semibold text-[var(--paper)]"
            >
              Delete
            </button>
            <button
              type="button"
              // Focus the safe choice first.
              autoFocus
              onClick={() => setConfirming(false)}
              className="rounded-[var(--radius-sm)] border border-[var(--line-strong)] px-3 py-2 text-sm font-semibold text-[var(--ink)]"
            >
              Keep it
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="text-sm text-[var(--danger)] underline">
          Delete scan
        </button>
      )}
    </section>
  )
}
