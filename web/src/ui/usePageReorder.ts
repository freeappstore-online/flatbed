import { type PointerEvent as ReactPointerEvent, useRef, useState } from 'react'

type Drag = { id: string; pointerId: number; x: number; y: number; moved: boolean; target: string | null }

/** Shared pointer drag and two-tap/keyboard reorder controls for page grids. */
export function usePageReorder(ids: string[], onMove: (from: number, to: number) => void, disabled = false) {
  const [selected, setSelected] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [target, setTarget] = useState<string | null>(null)
  const active = useRef<Drag | null>(null)
  const suppressClickUntil = useRef(0)
  const movingId = selected && ids.includes(selected) ? selected : null
  const movingNumber = movingId ? ids.indexOf(movingId) + 1 : 0

  const destinationAt = (x: number, y: number) => {
    const hit = document.elementFromPoint?.(x, y)?.closest<HTMLElement>('[data-reorder-id]')
    return hit?.dataset.reorderId && ids.includes(hit.dataset.reorderId) ? hit.dataset.reorderId : null
  }

  const finish = (id: string, destination: string) => {
    const from = ids.indexOf(id)
    const to = ids.indexOf(destination)
    if (from >= 0 && to >= 0 && from !== to) onMove(from, to)
    setSelected(null)
    setDragging(null)
    setTarget(null)
  }

  const handle = (id: string) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (disabled || (event.pointerType === 'mouse' && event.button !== 0)) return
      event.currentTarget.setPointerCapture?.(event.pointerId)
      active.current = { id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false, target: null }
    },
    onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => {
      const drag = active.current
      if (!drag || drag.pointerId !== event.pointerId) return
      if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 8) return
      drag.moved = true
      setDragging(id)
      drag.target = destinationAt(event.clientX, event.clientY)
      setTarget(drag.target)
    },
    onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => {
      const drag = active.current
      if (!drag || drag.pointerId !== event.pointerId) return
      active.current = null
      if (drag.moved) {
        const destination = destinationAt(event.clientX, event.clientY) ?? drag.target
        if (destination) finish(drag.id, destination)
        else { setDragging(null); setTarget(null) }
        suppressClickUntil.current = Date.now() + 500
      }
    },
    onPointerCancel: () => {
      active.current = null
      setDragging(null)
      setTarget(null)
    },
    onClick: () => {
      if (disabled || Date.now() < suppressClickUntil.current) return
      setSelected((current) => current === id ? null : id)
    },
  })

  /** Returns true when the thumbnail was used as a destination instead of opening review. */
  const choose = (id: string) => {
    if (!movingId) return false
    finish(movingId, id)
    return true
  }

  return { handle, choose, movingId, movingNumber, dragging, target }
}
