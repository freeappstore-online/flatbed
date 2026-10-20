import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react'
import type { Page } from '../capture/camera'
import { FullScreen } from './FullScreen'

const MAX_ZOOM = 4
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
type Point = { x: number; y: number }
type View = { scale: number; x: number; y: number }

/** Inspect a page at full screen size without changing the image saved for export. */
export function PageReview({ pages, pageId, onPageChange, onClose, onCrop, onFilter, onRemove, onRetake }: {
  pages: Page[]
  pageId: string
  onPageChange: (id: string) => void
  onClose: () => void
  onCrop: (id: string) => void
  onFilter: (id: string) => void
  onRemove: (id: string) => void
  onRetake?: (id: string) => void
}) {
  const index = pages.findIndex((page) => page.id === pageId)
  const page = pages[index]
  const number = index + 1
  const viewport = useRef<HTMLDivElement>(null)
  const image = useRef<HTMLImageElement>(null)
  const pointers = useRef(new Map<number, Point>())
  const starts = useRef(new Map<number, Point>())
  const gesture = useRef<{ distance: number; midpoint: Point; view: View } | null>(null)
  const lastTap = useRef<{ time: number; point: Point } | null>(null)
  const lastTouchZoom = useRef(0)
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 })

  useEffect(() => {
    setView({ scale: 1, x: 0, y: 0 })
    pointers.current.clear()
    starts.current.clear()
    gesture.current = null
    lastTap.current = null
    lastTouchZoom.current = 0
  }, [pageId])

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowLeft' && index > 0) { event.preventDefault(); onPageChange(pages[index - 1].id) }
      if (event.key === 'ArrowRight' && index < pages.length - 1) { event.preventDefault(); onPageChange(pages[index + 1].id) }
    }
    document.addEventListener('keydown', keydown)
    return () => document.removeEventListener('keydown', keydown)
  }, [index, onClose, onPageChange, pages])

  if (!page) return null

  const local = (event: { clientX: number; clientY: number }): Point => {
    const rect = viewport.current!.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  const bounded = (next: View): View => {
    const area = viewport.current
    const photo = image.current
    if (!area || !photo) return next
    const xLimit = Math.max(0, (photo.offsetWidth * next.scale - area.clientWidth) / 2)
    const yLimit = Math.max(0, (photo.offsetHeight * next.scale - area.clientHeight) / 2)
    return { scale: next.scale, x: clamp(next.x, -xLimit, xLimit), y: clamp(next.y, -yLimit, yLimit) }
  }

  const zoomAt = (scale: number, point?: Point) => {
    const area = viewport.current
    const nextScale = clamp(scale, 1, MAX_ZOOM)
    if (!area || !point || nextScale === 1) { setView({ scale: nextScale, x: 0, y: 0 }); return }
    const ratio = nextScale / view.scale
    const center = { x: area.clientWidth / 2, y: area.clientHeight / 2 }
    setView(bounded({
      scale: nextScale,
      x: view.x * ratio + (point.x - center.x) * (1 - ratio),
      y: view.y * ratio + (point.y - center.y) * (1 - ratio),
    }))
  }

  const pinch = () => {
    const [a, b] = [...pointers.current.values()]
    return { distance: Math.hypot(a.x - b.x, a.y - b.y), midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }
  }

  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = local(event)
    pointers.current.set(event.pointerId, point)
    starts.current.set(event.pointerId, point)
    if (pointers.current.size === 2) {
      gesture.current = { ...pinch(), view }
      lastTap.current = null
    }
  }

  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const before = pointers.current.get(event.pointerId)
    if (!before) return
    const now = local(event)
    pointers.current.set(event.pointerId, now)
    const startPoint = starts.current.get(event.pointerId)
    if (startPoint && Math.hypot(now.x - startPoint.x, now.y - startPoint.y) > 12) lastTap.current = null
    if (pointers.current.size >= 2 && gesture.current) {
      const current = pinch()
      const start = gesture.current
      const scale = clamp(start.view.scale * current.distance / Math.max(1, start.distance), 1, MAX_ZOOM)
      const ratio = scale / start.view.scale
      const center = { x: viewport.current!.clientWidth / 2, y: viewport.current!.clientHeight / 2 }
      setView(bounded({ scale,
        x: start.view.x * ratio + (start.midpoint.x - center.x) * (1 - ratio) + current.midpoint.x - start.midpoint.x,
        y: start.view.y * ratio + (start.midpoint.y - center.y) * (1 - ratio) + current.midpoint.y - start.midpoint.y,
      }))
    } else if (view.scale > 1) {
      setView(bounded({ ...view, x: view.x + now.x - before.x, y: view.y + now.y - before.y }))
    }
  }

  const pointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = pointers.current.get(event.pointerId)
    const startPoint = starts.current.get(event.pointerId)
    const wasPinching = gesture.current !== null
    pointers.current.delete(event.pointerId)
    starts.current.delete(event.pointerId)
    if (pointers.current.size < 2) gesture.current = null
    if (wasPinching) { starts.current.clear(); lastTap.current = null }
    if (event.pointerType !== 'touch' || !point || !startPoint || wasPinching || Math.hypot(point.x - startPoint.x, point.y - startPoint.y) > 12) return
    const now = Date.now()
    const previous = lastTap.current
    if (previous && now - previous.time < 350 && Math.hypot(point.x - previous.point.x, point.y - previous.point.y) < 32) {
      zoomAt(view.scale > 1 ? 1 : 2.5, point)
      lastTouchZoom.current = now
      lastTap.current = null
    } else lastTap.current = { time: now, point }
  }

  const pointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId)
    starts.current.delete(event.pointerId)
    gesture.current = null
    lastTap.current = null
  }

  const button = 'rounded-full bg-white/15 px-4 py-2 text-sm font-semibold disabled:opacity-40'
  return (
    <FullScreen label={`Review page ${number}`}>
      <div className="flex items-center justify-between gap-3 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <h2 className="text-lg font-semibold">Page {number} of {pages.length}</h2>
        <button type="button" onClick={onClose} className={button}>Close review</button>
      </div>
      <div
        ref={viewport}
        aria-label={`Page ${number} image; pinch or double tap to zoom`}
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-neutral-950"
        style={{ touchAction: 'none' }}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerCancel}
        onDoubleClick={(event) => {
          if (Date.now() - lastTouchZoom.current > 500) zoomAt(view.scale > 1 ? 1 : 2.5, local(event))
        }}
      >
        <img
          ref={image}
          src={page.url}
          alt={`Page ${number} full-size preview`}
          draggable={false}
          className="max-h-full max-w-full select-none object-contain"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
        />
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 px-4 py-2">
        <button type="button" className={button} aria-label="Zoom out" disabled={view.scale === 1} onClick={() => zoomAt(view.scale - 0.5)}>−</button>
        <span role="status" className="min-w-14 text-center text-sm">{Math.round(view.scale * 100)}%</span>
        <button type="button" className={button} aria-label="Zoom in" disabled={view.scale === MAX_ZOOM} onClick={() => zoomAt(view.scale + 0.5)}>+</button>
        <button type="button" className={button} disabled={view.scale === 1} onClick={() => zoomAt(1)}>Reset zoom</button>
      </div>
      <div className="flex items-center justify-between gap-3 px-4 pb-2">
        <button type="button" className={button} aria-label="Previous page" disabled={index === 0} onClick={() => onPageChange(pages[index - 1].id)}>← Previous page</button>
        <button type="button" className={button} aria-label="Next page" disabled={index === pages.length - 1} onClick={() => onPageChange(pages[index + 1].id)}>Next page →</button>
      </div>
      <div className="flex flex-wrap justify-center gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button type="button" className={button} aria-label={`Crop page ${number}`} onClick={() => onCrop(page.id)}>Crop</button>
        <button type="button" className={button} aria-label={`Filter page ${number}`} onClick={() => onFilter(page.id)}>Filter</button>
        {onRetake && <button type="button" className={button} aria-label={`Retake page ${number}`} onClick={() => onRetake(page.id)}>Retake</button>}
        <button type="button" className={button} aria-label={`Remove page ${number}`} onClick={() => onRemove(page.id)}>Remove</button>
      </div>
    </FullScreen>
  )
}
