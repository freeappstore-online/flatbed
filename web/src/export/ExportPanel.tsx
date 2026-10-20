import { useState } from 'react'
import { canShareFiles, deliver } from './share'
import { PAPER_SIZES, type PaperSize, QUALITIES, type Quality, formatBytes, pdfName, scanName } from './sizing'

type Exporter = (
  pages: Blob[],
  paper: PaperSize,
  quality: Quality,
  options: { onProgress: (done: number) => void },
) => Promise<Blob>

// pdf-lib loads only when someone exports, so it stays out of the first download.
const lazyExport: Exporter = async (...args) => (await import('./pdf')).exportPdf(...args)

type Status =
  | { kind: 'idle' }
  | { kind: 'working'; done: number }
  | { kind: 'finished'; how: 'shared' | 'downloaded'; name: string; size: number }
  | { kind: 'failed' }

/** Paper size, quality and the button that makes the PDF and shares or downloads it. */
export function ExportPanel({
  pages,
  name,
  exporter = lazyExport,
  hand = deliver,
  share = canShareFiles(),
}: {
  /** The pages' final images, in order. */
  pages: Blob[]
  /** The scan's name, used for the file name. */
  name?: string
  /** For tests. */
  exporter?: Exporter
  hand?: (pdf: Blob, name: string) => Promise<'shared' | 'downloaded' | 'cancelled'>
  share?: boolean
}) {
  const [paper, setPaper] = useState<PaperSize>('a4')
  const [quality, setQuality] = useState<Quality>('balanced')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const working = status.kind === 'working'

  const run = async () => {
    setStatus({ kind: 'working', done: 0 })
    try {
      const pdf = await exporter(pages, paper, quality, { onProgress: (done) => setStatus({ kind: 'working', done }) })
      const file = pdfName(name ?? scanName(new Date()))
      const how = await hand(pdf, file)
      setStatus(how === 'cancelled' ? { kind: 'idle' } : { kind: 'finished', how, name: file, size: pdf.size })
    } catch {
      setStatus({ kind: 'failed' })
    }
  }

  const optionClass = (selected: boolean) =>
    `rounded-[var(--radius-sm)] border px-3 py-2 text-sm font-semibold disabled:opacity-50 ${
      selected
        ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
        : 'border-[var(--line-strong)] text-[var(--ink)] hover:bg-[var(--panel-strong)]'
    }`

  return (
    <section aria-labelledby="export-heading" className="mt-6 rounded-[var(--radius)] border border-[var(--line)] p-4">
      <h2 id="export-heading" className="font-semibold text-[var(--ink)]">
        Export PDF
      </h2>
      <div className="mt-3 grid gap-3">
        <div role="group" aria-label="Paper size" className="flex flex-wrap gap-2">
          {PAPER_SIZES.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={paper === p.id}
              disabled={working}
              onClick={() => setPaper(p.id)}
              className={optionClass(paper === p.id)}
            >
              {p.name}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Quality" className="flex flex-wrap gap-2">
          {QUALITIES.map((q) => (
            <button
              key={q.id}
              type="button"
              aria-pressed={quality === q.id}
              disabled={working}
              onClick={() => setQuality(q.id)}
              className={optionClass(quality === q.id)}
            >
              {q.name}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={run}
          disabled={working || pages.length === 0}
          className="rounded-[var(--radius)] bg-[var(--ink)] px-4 py-3 font-semibold text-[var(--paper)] hover:opacity-90 disabled:opacity-50 sm:justify-self-start"
        >
          {share ? 'Share PDF' : 'Download PDF'}
        </button>
      </div>
      <p className="mt-2 text-sm text-[var(--muted)]" aria-live="polite">
        {status.kind === 'working' &&
          (status.done < pages.length ? `Making page ${status.done + 1} of ${pages.length}…` : 'Putting the PDF together…')}
        {status.kind === 'finished' &&
          `${status.how === 'shared' ? 'Shared' : 'Downloaded'} ${status.name} (${formatBytes(status.size)}).`}
        {status.kind === 'idle' && 'Made on this device; nothing is uploaded.'}
      </p>
      {status.kind === 'failed' && (
        <p role="alert" className="mt-1 text-sm text-[var(--danger)]">
          Couldn't make the PDF. Try again, or a smaller quality.
        </p>
      )}
    </section>
  )
}
