import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from 'react'
import { DETECT_SIDE, detectQuad } from './edges'
import { type Picture, drawPixels, encodeJpeg, openPicture } from './image'
import { type Crop, type Point, type Quad, clampPoint, isConvex, rect, scaleQuad } from './perspective'
import { type Pixels, warp } from './warp'

const CORNER_NAMES = ['Top-left', 'Top-right', 'Bottom-right', 'Bottom-left']
const PREVIEW_SIDE = 240

type State =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'ready'; picture: Picture; small: Pixels; detected: Quad | null }

/**
 * Crops one page: finds its edges, lets the person drag the four corners, turns
 * it in quarter turns, then straightens it into a flat page. Shows a live
 * preview of the result. Everything runs on the device.
 */
export function CropEditor({
  blob,
  initial,
  title,
  onApply,
  onSkip,
  open = openPicture,
  encode = encodeJpeg,
}: {
  /** The page as photographed, uncropped. */
  blob: Blob
  /** A previous crop to start from instead of detecting. */
  initial?: Crop
  title: string
  onApply: (cropped: Blob, crop: Crop) => void
  /** Leaves the page as it is. */
  onSkip: () => void
  /** For tests; decode and encode default to the browser's canvas. */
  open?: (blob: Blob) => Promise<Picture>
  encode?: (pixels: Pixels) => Promise<Blob>
}) {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [quad, setQuad] = useState<Quad | null>(null)
  const [turns, setTurns] = useState(initial?.turns ?? 0)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [fit, setFit] = useState({ width: 0, height: 0 })
  const area = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const preview = useRef<HTMLCanvasElement>(null)
  const dragging = useRef<number | null>(null)
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
      const small = picture.pixels(DETECT_SIDE)
      const sx = picture.width / small.width
      const sy = picture.height / small.height
      const found = detectQuad(small)
      const detected = found && scaleQuad(found, sx, sy)
      setState({ kind: 'ready', picture, small, detected })
      setQuad(initial?.quad ?? detected ?? rect(picture.width, picture.height))
    })()
    return () => {
      cancelled = true
      picture?.close()
    }
    // A new blob is a new page; `initial` only seeds the first crop.
  }, [blob, open])

  const picture = state.kind === 'ready' ? state.picture : null

  // Size the photo to fit the space between the bars.
  useEffect(() => {
    if (!picture) return
    const measure = () => {
      const box = area.current
      if (!box) return
      const s = Math.min(box.clientWidth / picture.width, box.clientHeight / picture.height)
      setFit({ width: picture.width * s, height: picture.height * s })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [picture])

  // Live preview of the straightened page, from the small copy.
  useEffect(() => {
    if (state.kind !== 'ready' || !quad || !preview.current || !isConvex(quad)) return
    const { picture: p, small } = state
    drawPixels(preview.current, warp(small, scaleQuad(quad, small.width / p.width, small.height / p.height), turns, PREVIEW_SIDE))
  }, [state, quad, turns])

  useEffect(() => {
    if (picture) done.current?.focus()
  }, [picture])

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && !working) onSkip()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onSkip, working])

  const moveCorner = (i: number, p: Point) => {
    if (!picture) return
    setQuad((q) => q && (q.map((c, j) => (j === i ? clampPoint(p, picture.width, picture.height) : c)) as Quad))
  }

  const pointerToImage = (e: PointerEvent): Point | null => {
    const box = stage.current?.getBoundingClientRect()
    if (!box || !picture || !box.width || !box.height) return null
    return {
      x: ((e.clientX - box.left) / box.width) * picture.width,
      y: ((e.clientY - box.top) / box.height) * picture.height,
    }
  }

  const onHandleDown = (i: number) => (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    dragging.current = i
  }
  const onHandleMove = (i: number) => (e: PointerEvent<HTMLButtonElement>) => {
    if (dragging.current !== i) return
    const p = pointerToImage(e)
    if (p) moveCorner(i, p)
  }
  const onHandleUp = () => {
    dragging.current = null
  }

  const onHandleKey = (i: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!picture || !quad) return
    const step = (e.shiftKey ? 0.05 : 0.01) * Math.max(picture.width, picture.height)
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
    if (!d) return
    e.preventDefault()
    moveCorner(i, { x: quad[i].x + d[0], y: quad[i].y + d[1] })
  }

  const apply = async () => {
    if (!picture || !quad || !isConvex(quad)) return
    setWorking(true)
    setError('')
    // Let "Straightening…" paint before the heavy work.
    await new Promise((r) => setTimeout(r, 0))
    try {
      const cropped = await encode(warp(picture.pixels(), quad, turns))
      onApply(cropped, { quad, turns })
    } catch {
      setError("Couldn't straighten this page. Try again, or keep it as it is.")
      setWorking(false)
    }
  }

  const valid = quad ? isConvex(quad) : false
  const w = picture?.width ?? 1
  const h = picture?.height ?? 1
  const pct = (p: Point) => ({ left: `${(p.x / w) * 100}%`, top: `${(p.y / h) * 100}%` })
  const isWhole = quad?.every((p, i) => {
    const r = rect(w, h)[i]
    return p.x === r.x && p.y === r.y
  })
  const button = 'rounded-full bg-white/15 px-4 py-2 text-sm font-semibold disabled:opacity-40'

  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <div className="flex items-center justify-between gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <h2 className="font-semibold">{title}</h2>
        <button type="button" onClick={onSkip} disabled={working} className={button}>
          Keep as is
        </button>
      </div>

      <div ref={area} className="relative flex min-h-0 flex-1 items-center justify-center p-6">
        {state.kind === 'loading' && <p className="text-white/80">Finding the page…</p>}
        {state.kind === 'failed' && (
          <p role="alert" className="max-w-sm text-center text-white/90">
            Couldn't open this image, so it can't be cropped. Keep it as it is, or remove it and import it as a JPEG or PNG.
          </p>
        )}
        {picture && quad && (
          <div
            ref={stage}
            className="relative touch-none select-none"
            style={fit.width ? { width: fit.width, height: fit.height } : undefined}
          >
            <img src={picture.url} alt="Photo of the page" className="block h-full w-full" draggable={false} />
            <svg
              aria-hidden
              className="pointer-events-none absolute inset-0 h-full w-full"
              viewBox={`0 0 ${w} ${h}`}
              preserveAspectRatio="none"
            >
              {/* Dim everything outside the page. */}
              <path
                fillRule="evenodd"
                fill="rgba(0,0,0,0.55)"
                d={`M0 0H${w}V${h}H0Z M${quad.map((p) => `${p.x} ${p.y}`).join(' L')}Z`}
              />
              <polygon
                points={quad.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke={valid ? 'var(--accent)' : 'var(--danger)'}
                strokeWidth={3}
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            {quad.map((p, i) => (
              <button
                key={i}
                type="button"
                aria-label={`${CORNER_NAMES[i]} corner`}
                aria-describedby="corner-hint"
                className="absolute grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none place-items-center rounded-full active:cursor-grabbing"
                style={pct(p)}
                onPointerDown={onHandleDown(i)}
                onPointerMove={onHandleMove(i)}
                onPointerUp={onHandleUp}
                onPointerCancel={onHandleUp}
                onKeyDown={onHandleKey(i)}
              >
                <span className="h-5 w-5 rounded-full border-2 border-white bg-[var(--accent)] shadow" />
              </button>
            ))}
          </div>
        )}
      </div>

      <p id="corner-hint" className="sr-only">
        Drag the corner onto the corner of the page, or move it with the arrow keys (Shift for bigger steps).
      </p>
      <p className="px-4 text-center text-sm text-white/90" aria-live="polite">
        {working
          ? 'Straightening…'
          : error ||
            (state.kind === 'ready' &&
              (!valid
                ? 'The corners cross over. Drag them back into a page shape.'
                : state.detected
                  ? 'Found the page. Drag the corners to adjust.'
                  : "Couldn't find the page edges. Drag the corners onto the page."))}
      </p>

      <div className="flex flex-col gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button type="button" className={button} disabled={!picture || working} onClick={() => setTurns((t) => (t + 3) % 4)}>
            Rotate left
          </button>
          <button type="button" className={button} disabled={!picture || working} onClick={() => setTurns((t) => (t + 1) % 4)}>
            Rotate right
          </button>
          {state.kind === 'ready' && (
            <button
              type="button"
              className={button}
              disabled={working}
              onClick={() =>
                setQuad(isWhole && state.detected ? state.detected : rect(state.picture.width, state.picture.height))
              }
            >
              {isWhole && state.detected ? 'Auto-detect' : 'Whole photo'}
            </button>
          )}
        </div>
        <div className="flex items-center justify-between gap-3">
          <figure className="flex items-center gap-2">
            <canvas
              ref={preview}
              aria-label="Preview of the straightened page"
              role="img"
              className="max-h-20 max-w-20 rounded bg-white/10"
            />
            <figcaption className="text-xs text-white/70">
              Preview{turns ? `, turned ${turns * 90}°` : ''}
            </figcaption>
          </figure>
          <button
            ref={done}
            type="button"
            onClick={apply}
            disabled={!picture || !valid || working}
            className="rounded-full bg-white px-6 py-3 font-semibold text-black disabled:opacity-40"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
