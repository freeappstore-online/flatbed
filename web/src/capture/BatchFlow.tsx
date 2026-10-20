import { useEffect, useRef, useState } from 'react'
import { CropEditor } from '../crop/CropEditor'
import { autoCropPage } from '../crop/auto'
import { FilterEditor } from '../filters/FilterEditor'
import { FILTERS } from '../filters/filters'
import { filterBlob } from '../filters/render'
import { FullScreen } from '../ui/FullScreen'
import { PageReview } from '../ui/PageReview'
import { Capture } from './Capture'
import { type Page, releasePages, uncropped, unfiltered } from './camera'

type Edit = { id: string; kind: 'crop' | 'filter' }

/** Capture freely, then review the whole batch before one local save. */
export function BatchFlow({
  onSave,
  onCancel,
  saveLabel = 'Save scan',
}: {
  onSave: (pages: Page[]) => Promise<void>
  onCancel: () => void
  saveLabel?: string
}) {
  const [stage, setStage] = useState<'capture' | 'review'>('capture')
  const [pages, setPages] = useState<Page[]>([])
  const [processing, setProcessing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [edit, setEdit] = useState<Edit | null>(null)
  const [reviewing, setReviewing] = useState<string | null>(null)
  const held = useRef<Page[]>([])
  const active = useRef(true)

  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
      releasePages(held.current)
      held.current = []
    }
  }, [])

  const replace = (old: Page, blob: Blob, changes: Partial<Page>) => {
    const next: Page = { ...old, original: old.original ?? old.blob, ...changes, blob, url: URL.createObjectURL(blob) }
    held.current = held.current.map((p) => p.id === old.id ? next : p)
    setPages(held.current)
    releasePages([old])
    setEdit(null)
  }

  const captured = async (added: Page[]) => {
    held.current = [...held.current, ...added]
    setPages(held.current)
    setStage('review')
    setProcessing(true)
    setError('')
    for (const page of added) {
      const cropped = await autoCropPage(page).catch(() => page)
      if (!active.current) {
        if (cropped !== page) releasePages([cropped])
        return
      }
      if (cropped !== page) {
        held.current = held.current.map((p) => p.id === page.id ? cropped : p)
        setPages(held.current)
        releasePages([page])
      }
    }
    setProcessing(false)
  }

  const remove = (id: string) => {
    const old = held.current.find((p) => p.id === id)
    if (old) releasePages([old])
    held.current = held.current.filter((p) => p.id !== id)
    setPages(held.current)
  }

  const save = async () => {
    if (saving || processing || pages.length === 0) return
    setSaving(true)
    setError('')
    try {
      await onSave(pages)
    } catch {
      if (active.current) setError("Couldn't save these pages. Your browser's storage for this site may be full.")
    } finally {
      if (active.current) setSaving(false)
    }
  }

  const selected = edit && pages.find((page) => page.id === edit.id)
  const number = selected ? pages.indexOf(selected) + 1 : 0
  if (selected && edit.kind === 'crop') return (
    <CropEditor
      key={selected.id}
      blob={uncropped(selected)}
      initial={selected.crop}
      title={`Crop page ${number}`}
      onSkip={() => setEdit(null)}
      onApply={async (cropped, crop) => {
        const blob = await filterBlob(cropped, selected.filter ?? 'original', selected.adjustments)
        replace(selected, blob, { cropped, crop })
      }}
    />
  )
  if (selected && edit.kind === 'filter') return (
    <FilterEditor
      key={selected.id}
      blob={unfiltered(selected)}
      initial={selected.filter}
      initialAdjustments={selected.adjustments}
      title={`Filter page ${number}`}
      onSkip={() => setEdit(null)}
      onApply={(filter, adjustments, blob) => replace(selected, blob, { filter, adjustments })}
    />
  )
  if (stage === 'capture') return (
    <Capture onDone={captured} onCancel={() => pages.length ? setStage('review') : onCancel()} />
  )
  if (reviewing && pages.some((page) => page.id === reviewing)) return (
    <PageReview
      pages={pages}
      pageId={reviewing}
      onPageChange={setReviewing}
      onClose={() => setReviewing(null)}
      onCrop={(id) => { setReviewing(null); setEdit({ id, kind: 'crop' }) }}
      onFilter={(id) => { setReviewing(null); setEdit({ id, kind: 'filter' }) }}
      onRemove={(id) => { setReviewing(null); remove(id) }}
    />
  )

  return (
    <FullScreen label="Review pages">
      <div className="flex items-center justify-between gap-3 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <h2 className="text-lg font-semibold">Review {pages.length} {pages.length === 1 ? 'page' : 'pages'}</h2>
        <button
          type="button"
          onClick={() => {
            if (confirmDiscard || pages.length === 0) onCancel()
            else setConfirmDiscard(true)
          }}
          disabled={saving || processing}
          className="rounded-full bg-white/15 px-4 py-2 text-sm font-semibold disabled:opacity-40"
        >
          {confirmDiscard ? 'Discard pages?' : 'Cancel'}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4">
        <p className="text-sm text-white/75">Check each page. Adjust only those that need it, then save the batch.</p>
        {processing && <p role="status" className="mt-2 text-sm">Straightening captured pages…</p>}
        {error && <p role="alert" className="mt-2 text-sm text-red-300">{error}</p>}
        {pages.length === 0 && <p className="mt-4 text-sm text-white/75">No pages left. Add a page to continue.</p>}
        <ol className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {pages.map((page, index) => (
            <li key={page.id} className="rounded-lg border border-white/25 p-2">
              <button type="button" disabled={processing || saving} onClick={() => setReviewing(page.id)} aria-label={`Review page ${index + 1}`} className="block w-full rounded disabled:opacity-40">
                <img src={page.url} alt={`Page ${index + 1}`} className="aspect-[3/4] w-full rounded bg-white/10 object-contain" />
              </button>
              <p className="mt-2 text-sm">Page {index + 1} · {page.crop ? 'Auto-cropped' : 'Needs crop check'}{page.filter && page.filter !== 'original' ? ` · ${FILTERS.find((f) => f.id === page.filter)?.name}` : ''}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-sm">
                <button type="button" disabled={processing || saving} onClick={() => setEdit({ id: page.id, kind: 'crop' })} className="underline disabled:opacity-40" aria-label={`Crop page ${index + 1}`}>Crop</button>
                <button type="button" disabled={processing || saving} onClick={() => setEdit({ id: page.id, kind: 'filter' })} className="underline disabled:opacity-40" aria-label={`Filter page ${index + 1}`}>Filter</button>
                <button type="button" disabled={processing || saving} onClick={() => remove(page.id)} className="underline disabled:opacity-40" aria-label={`Remove page ${index + 1}`}>Remove</button>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <div className="flex items-center justify-between gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button type="button" disabled={processing || saving} onClick={() => setStage('capture')} className="rounded-full bg-white/15 px-4 py-3 font-semibold disabled:opacity-40">Add pages</button>
        <button type="button" disabled={processing || saving || pages.length === 0} onClick={save} className="rounded-full bg-white px-4 py-3 font-semibold text-black disabled:opacity-40">{saving ? 'Saving…' : saveLabel}</button>
      </div>
    </FullScreen>
  )
}
