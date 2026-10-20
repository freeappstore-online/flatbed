import { useEffect, useRef } from 'react'
import { drawPixels } from '../crop/image'
import type { Pixels } from '../crop/warp'
import { FILTERS, type Filter, applyFilter } from './filters'
import { type Adjustments, applyAdjustments, hasAdjustments } from './adjustments'

/** A strip of small previews, one per filter; tap one to choose it. */
export function FilterPicker({
  thumb,
  value,
  adjustments,
  onChange,
  disabled,
}: {
  /** A small copy of the page to preview each filter on. */
  thumb: Pixels | null
  value: Filter
  adjustments: Adjustments
  onChange: (filter: Filter) => void
  disabled?: boolean
}) {
  return (
    <div role="group" aria-label="Filter" className="flex gap-3 overflow-x-auto px-1 pb-1">
      {FILTERS.map((f) => (
        <button
          key={f.id}
          type="button"
          aria-pressed={value === f.id}
          disabled={disabled}
          onClick={() => onChange(f.id)}
          className="flex shrink-0 flex-col items-center gap-1 text-xs font-semibold disabled:opacity-40"
        >
          <Thumb thumb={thumb} filter={f.id} adjustments={adjustments} selected={value === f.id} />
          {f.name}
        </button>
      ))}
    </div>
  )
}

function Thumb({ thumb, filter, adjustments, selected }: { thumb: Pixels | null; filter: Filter; adjustments: Adjustments; selected: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (thumb && canvas.current) {
      const filtered = applyFilter(thumb, filter)
      drawPixels(canvas.current, hasAdjustments(adjustments) ? applyAdjustments(filtered, adjustments) : filtered)
    }
  }, [thumb, filter, adjustments])
  return (
    <canvas
      ref={canvas}
      aria-hidden
      className={`h-20 w-16 rounded bg-white/10 object-contain ${selected ? 'ring-3 ring-[var(--accent)]' : ''}`}
    />
  )
}
