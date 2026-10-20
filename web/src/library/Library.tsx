import { useEffect, useState } from 'react'
import { PageHeader } from '@freeappstore/sdk/ui'
import { BatchFlow } from '../capture/BatchFlow'
import { scanName } from '../export/sizing'
import { toInput, useStore } from './scans'
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
  const [capturing, setCapturing] = useState(false)

  return (
    <>
      <PageHeader
        title="Flatbed"
        description="Scan documents to PDF on your device: crop, straighten, clean up and share. Nothing leaves your phone."
      />
      <button
        type="button"
        onClick={() => setCapturing(true)}
        className="w-full rounded-[var(--radius)] bg-[var(--ink)] px-4 py-4 text-lg font-semibold text-[var(--paper)] hover:opacity-90 sm:w-auto short:py-2.5 short:text-base"
      >
        New scan
      </button>

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
          onCancel={() => setCapturing(false)}
          onSave={async (pages) => {
            const scan = await store.createScan(scanName(new Date()), pages.map(toInput))
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
