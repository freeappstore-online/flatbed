import { useEffect, useState } from 'react'
import { PageHeader } from '@freeappstore/sdk/ui'
import { BatchFlow } from '../capture/BatchFlow'
import { scanName } from '../export/sizing'
import { draftPage, toInput, useStore } from './scans'
import type { Page } from '../capture/camera'
import type { ScanStore, ScanSummary } from './store'

const DATE = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

/** Saved scans, newest first, and the button to start a new one. */
export function Library({
  store,
  onOpen,
  onPrivacy,
}: {
  store: ScanStore
  /** Opens a saved scan. */
  onOpen: (id: string, edit?: string[]) => void
  onPrivacy: () => void
}) {
  const list = useStore(store, (s) => s.listScans())
  const draftState = useStore(store, (s) => s.getDraft().then(
    (draft) => ({ draft, failed: false }),
    () => ({ draft: undefined, failed: true }),
  ))
  const [capturing, setCapturing] = useState(false)
  const [resumePages, setResumePages] = useState<Page[]>([])
  const [draftError, setDraftError] = useState('')
  const draft = draftState?.draft

  return (
    <>
      <PageHeader
        title="Flatbed"
        description="Scan documents to PDF on your device: crop, straighten, clean up and share. Nothing leaves your phone."
      />
      <button
        type="button"
        onClick={() => { setResumePages([]); setCapturing(true) }}
        disabled={!draftState || !!draft}
        className="w-full rounded-[var(--radius)] bg-[var(--ink)] px-4 py-4 text-lg font-semibold text-[var(--paper)] hover:opacity-90 disabled:opacity-40 sm:w-auto short:py-2.5 short:text-base"
      >
        New scan
      </button>

      {draftState?.failed && <p role="alert" className="mt-3 text-sm text-[var(--danger)]">Couldn't check for an unfinished scan. You can still capture pages, but they may not be recoverable if this tab closes.</p>}

      {draft && !capturing && <section aria-label="Unfinished scan" className="mt-4 rounded-[var(--radius)] border border-[var(--line-strong)] p-4">
        <h2 className="font-semibold">Unfinished scan</h2>
        <p className="mt-1 text-sm">{draft.pages.length} {draft.pages.length === 1 ? 'page was' : 'pages were'} saved on this device before you left. Resume to continue, or discard these pages.</p>
        <div className="mt-3 flex gap-3">
          <button type="button" className="rounded-[var(--radius-sm)] bg-[var(--ink)] px-4 py-2 font-semibold text-[var(--paper)]" onClick={() => {
            if (draft.kind === 'append' && draft.scanId) onOpen(draft.scanId)
            else { setResumePages(draft.pages.map(draftPage)); setCapturing(true) }
          }}>Resume</button>
          <button type="button" className="rounded-[var(--radius-sm)] border border-[var(--line-strong)] px-4 py-2" onClick={async () => {
            try { setDraftError(''); await store.discardDraft() }
            catch { setDraftError("Couldn't discard the draft. Try again.") }
          }}>Discard</button>
        </div>
        {draftError && <p role="alert" className="mt-2 text-sm text-[var(--danger)]">{draftError}</p>}
      </section>}

      <section className="mt-6 short:mt-3" aria-labelledby="scans-heading">
        <h2 id="scans-heading" className="font-semibold text-[var(--ink)]">
          Your scans
        </h2>
        {list === undefined ? (
          <p className="mt-2 text-sm text-[var(--muted)]">Loading…</p>
        ) : list.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--muted)]">No scans yet. Tap New scan to shoot or import your first page.</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {list.map((scan) => (
              <li key={scan.id}>
                <ScanRow scan={scan} onOpen={() => onOpen(scan.id)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-6 text-sm text-[var(--muted)] short:mt-3">
        Scans are kept only in this browser on this device.{' '}
        <button type="button" onClick={onPrivacy} className="underline">
          Privacy
        </button>
      </p>

      {capturing && (
        <BatchFlow
          store={store}
          draftTarget={{ kind: 'new' }}
          initialPages={resumePages}
          onCancel={() => { setCapturing(false); setResumePages([]) }}
          onSave={async (pages) => {
            const scan = await store.createScan(scanName(new Date()), pages.map(toInput), true)
            onOpen(scan.id)
          }}
        />
      )}
    </>
  )
}

function ScanRow({ scan, onOpen }: { scan: ScanSummary; onOpen: () => void }) {
  const [cover, setCover] = useState<string>()
  useEffect(() => {
    if (!scan.cover) return setCover(undefined)
    const url = URL.createObjectURL(scan.cover)
    setCover(url)
    return () => URL.revokeObjectURL(url)
  }, [scan.cover])
  const count = scan.pages.length

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-[var(--radius)] border border-[var(--line)] p-2 text-left hover:bg-[var(--panel-strong)]"
    >
      {cover ? (
        <img src={cover} alt="" className="h-16 w-12 shrink-0 rounded object-cover" />
      ) : (
        <span aria-hidden className="h-16 w-12 shrink-0 rounded bg-[var(--paper-deep)]" />
      )}
      <span className="min-w-0">
        <span className="block truncate font-semibold text-[var(--ink)]">{scan.name}</span>
        <span className="block text-sm text-[var(--muted)]">
          {count} {count === 1 ? 'page' : 'pages'} · {DATE.format(scan.updatedAt)}
        </span>
      </span>
    </button>
  )
}
