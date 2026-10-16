import { useEffect, useRef, useState } from 'react'
import { type Picture, drawPixels, encodeJpeg, openPicture } from '../crop/image'
import type { Pixels } from '../crop/warp'
import { FilterPicker } from './FilterPicker'
import { FILTERS, type Filter, applyFilter } from './filters'
import { filterBlob } from './render'

const PREVIEW_SIDE = 1000
const THUMB_SIDE = 120

type State =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'ready'; picture: Picture; preview: Pixels; thumb: Pixels }

/** Chooses a page's filter, with a large preview and a strip of small ones. */
export function FilterEditor({
  blob,
  initial = 'original',
  title,
  onApply,
  onSkip,
  open = openPicture,
  encode = encodeJpeg,
}: {
  /** The page before any filter (cropped, if it was). */
  blob: Blob
  initial?: Filter
  title: string
  /** The chosen filter and the page with it applied. */
  onApply: (filter: Filter, filtered: Blob) => void
  /** Leaves the page's filter as it was. */
  onSkip: () => void
  /** For tests; decode and encode default to the browser's canvas. */
  open?: (blob: Blob) => Promise<Picture>
  encode?: (pixels: Pixels) => Promise<Blob>
}) {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [filter, setFilter] = useState<Filter>(initial)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const canvas = useRef<HTMLCanvasElement>(null)
  const done = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let cancelled = false
    let picture: Picture | undefined
    ;(async () => {
      try {
        picture = await open(blob)
      } catch {
        if (!cancelled) setState({ kind: 'failed' })
        return
      }
      if (cancelled) return picture.close()
      setState({ kind: 'ready', picture, preview: picture.pixels(PREVIEW_SIDE), thumb: picture.pixels(THUMB_SIDE) })
    })()
    return () => {
      cancelled = true
      picture?.close()
    }
  }, [blob, open])

  useEffect(() => {
    if (state.kind === 'ready' && canvas.current) drawPixels(canvas.current, applyFilter(state.preview, filter))
  }, [state, filter])

  useEffect(() => {
    if (state.kind === 'ready') done.current?.focus()
  }, [state.kind])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !working) onSkip()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onSkip, working])

  const apply = async () => {
    setWorking(true)
    setError('')
    // Let "Applying…" paint before the heavy work.
    await new Promise((r) => setTimeout(r, 0))
    try {
      onApply(filter, await filterBlob(blob, filter, open, encode))
    } catch {
      setError("Couldn't apply the filter. Try again, or keep the page as it is.")
      setWorking(false)
    }
  }

  const name = FILTERS.find((f) => f.id === filter)?.name
  const button = 'rounded-full bg-white/15 px-4 py-2 text-sm font-semibold disabled:opacity-40'

  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <div className="flex items-center justify-between gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <h2 className="font-semibold">{title}</h2>
        <button type="button" onClick={onSkip} disabled={working} className={button}>
          Keep as is
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center p-4">
        {state.kind === 'loading' && <p className="text-white/80">Opening the page…</p>}
        {state.kind === 'failed' && (
          <p role="alert" className="max-w-sm text-center text-white/90">
            Couldn't open this image, so no filter can be applied. Keep it as it is.
          </p>
        )}
        {state.kind === 'ready' && (
          <canvas
            ref={canvas}
            role="img"
            aria-label={`Preview: ${name}`}
            className="max-h-full max-w-full rounded bg-white object-contain"
          />
        )}
      </div>

      <p className="px-4 text-center text-sm text-white/90" aria-live="polite">
        {working ? 'Applying…' : error}
      </p>

      <div className="flex flex-col gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <FilterPicker
          thumb={state.kind === 'ready' ? state.thumb : null}
          value={filter}
          onChange={setFilter}
          disabled={state.kind !== 'ready' || working}
        />
        <div className="flex justify-end">
          <button
            ref={done}
            type="button"
            onClick={apply}
            disabled={state.kind !== 'ready' || working}
            className="rounded-full bg-white px-6 py-3 font-semibold text-black disabled:opacity-40"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
