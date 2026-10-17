import { type ChangeEvent, useEffect, useRef, useState } from 'react'
import {
  type CameraProblem,
  type Page,
  grabFrame,
  importFiles,
  newPage,
  openCamera,
  releasePages,
  stopCamera,
} from './camera'
import { FullScreen } from '../ui/FullScreen'
import { DETECT_SIDE, detectQuad } from '../crop/edges'

type Camera = { kind: 'starting' } | { kind: 'live' } | { kind: 'problem'; problem: CameraProblem }

const PROBLEM_TEXT: Record<CameraProblem, string> = {
  unsupported: "This browser can't use the camera. Import photos of your pages instead.",
  blocked:
    "Camera access is off for Flatbed. Allow it in your browser's site settings and try again, or import photos instead.",
  missing: 'No camera was found on this device. Import photos of your pages instead.',
  busy: 'The camera is being used by another app. Close it and try again, or import photos instead.',
  failed: "Couldn't start the camera. Try again, or import photos instead.",
}

/**
 * Full-screen capture: a live viewfinder from the back camera, tap anywhere
 * (or the shutter) to shoot, one page or many, and photo/file import for when
 * there's no camera. Controls sit at the bottom so it works one-handed.
 * Hands the pages to onDone, which then owns their object URLs.
 */
export function Capture({
  onDone,
  onCancel,
  singlePage = false,
  media,
  snap = (video) => grabFrame(video),
}: {
  onDone: (pages: Page[]) => void
  onCancel: () => void
  /** Restrict capture and import to one replacement page. */
  singlePage?: boolean
  /** For tests; defaults to navigator.mediaDevices. */
  media?: { getUserMedia?: (c: MediaStreamConstraints) => Promise<MediaStream> }
  /** For tests; defaults to grabbing a frame from the video. */
  snap?: (video: HTMLVideoElement) => Promise<Blob | null>
}) {
  const [camera, setCamera] = useState<Camera>({ kind: 'starting' })
  const [attempt, setAttempt] = useState(0)
  const [multi, setMulti] = useState(false)
  const [pages, setPages] = useState<Page[]>([])
  const [notice, setNotice] = useState('')
  const [flash, setFlash] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  const overlay = useRef<HTMLCanvasElement>(null)
  const stopDetection = useRef<() => void>(() => {})
  const [detectionRun, setDetectionRun] = useState(0)
  const picker = useRef<HTMLInputElement>(null)
  const shutter = useRef<HTMLButtonElement>(null)
  const shooting = useRef(false)
  // Pages not yet handed over, so unmounting can free them.
  const held = useRef<Page[]>([])
  held.current = pages
  const mediaDevices = media ?? (typeof navigator === 'undefined' ? undefined : navigator.mediaDevices)

  useEffect(() => {
    let stopped = false
    let stream: MediaStream | undefined
    setCamera({ kind: 'starting' })
    ;(async () => {
      const result = await openCamera(mediaDevices)
      if (stopped) {
        if ('stream' in result) stopCamera(result.stream)
        return
      }
      if ('problem' in result) return setCamera({ kind: 'problem', problem: result.problem })
      stream = result.stream
      const v = video.current
      if (v) {
        v.srcObject = stream
        await Promise.resolve(v.play?.()).catch(() => {})
      }
      if (!stopped) setCamera({ kind: 'live' })
    })()
    return () => {
      stopped = true
      stopCamera(stream)
    }
    // mediaDevices is fixed for the life of the screen; attempt re-runs this for "Try again".
  }, [attempt])

  useEffect(() => {
    const v = video.current
    const canvas = overlay.current
    if (camera.kind !== 'live' || !v || !canvas) return
    const sample = document.createElement('canvas')
    let context: CanvasRenderingContext2D | null = null
    let input: CanvasRenderingContext2D | null = null
    const tick = () => {
      const width = v.clientWidth
      const height = v.clientHeight
      if (canvas.width !== width) canvas.width = width
      if (canvas.height !== height) canvas.height = height
      if (!width || !height) return
      context ??= canvas.getContext('2d')
      if (!context) return
      context.clearRect(0, 0, width, height)
      if (v.readyState < 2 || !v.videoWidth || !v.videoHeight || shooting.current || document.hidden) return
      input ??= sample.getContext('2d', { willReadFrequently: true })
      if (!input) return
      const ratio = DETECT_SIDE / Math.max(v.videoWidth, v.videoHeight)
      const sw = Math.max(1, Math.round(v.videoWidth * ratio))
      const sh = Math.max(1, Math.round(v.videoHeight * ratio))
      if (sample.width !== sw) sample.width = sw
      if (sample.height !== sh) sample.height = sh
      try {
        input.drawImage(v, 0, 0, sw, sh)
        const quad = detectQuad(input.getImageData(0, 0, sw, sh))
        if (!quad) return
        // object-contain centers the image inside the video's element box.
        const fit = Math.min(width / v.videoWidth, height / v.videoHeight)
        const imageWidth = v.videoWidth * fit
        const imageHeight = v.videoHeight * fit
        const points = quad.map((p) => ({
          x: (width - imageWidth) / 2 + p.x * imageWidth / sw,
          y: (height - imageHeight) / 2 + p.y * imageHeight / sh,
        }))
        context.beginPath()
        points.forEach((p, i) => i === 0 ? context!.moveTo(p.x, p.y) : context!.lineTo(p.x, p.y))
        context.closePath()
        context.fillStyle = 'rgba(0,200,100,0.25)'
        context.fill()
        context.strokeStyle = 'rgba(0,200,100,0.85)'
        context.lineWidth = 3
        context.stroke()
        context.fillStyle = 'rgba(0,200,100,0.85)'
        points.forEach((p) => context!.fillRect(p.x - 4, p.y - 4, 8, 8))
      } catch {
        // A camera frame can become unavailable while the stream changes.
        context.clearRect(0, 0, width, height)
      }
    }
    const timer = window.setInterval(tick, 100)
    const stop = () => {
      window.clearInterval(timer)
      context?.clearRect(0, 0, canvas.width, canvas.height)
    }
    stopDetection.current = stop
    return stop
  }, [camera.kind, detectionRun])

  // Escape leaves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  // Free any pages still here if the screen goes away without Done.
  useEffect(() => () => releasePages(held.current), [])

  useEffect(() => {
    if (camera.kind === 'live') shutter.current?.focus()
  }, [camera.kind])

  const finish = (all: Page[]) => {
    stopDetection.current()
    held.current = []
    setPages([])
    onDone(all)
  }

  const cancel = () => {
    if (pages.length > 0 && !confirmDiscard) {
      setConfirmDiscard(true)
      return
    }
    releasePages(pages)
    stopDetection.current()
    held.current = []
    setPages([])
    onCancel()
  }

  const shoot = async () => {
    const v = video.current
    if (camera.kind !== 'live' || !v || shooting.current) return
    shooting.current = true
    stopDetection.current()
    let resume = true
    try {
      const blob = await snap(v)
      if (!blob) return setNotice('The camera is still starting. Try again in a moment.')
      navigator.vibrate?.(30)
      setFlash(true)
      setTimeout(() => setFlash(false), 150)
      setNotice('')
      setConfirmDiscard(false)
      const page = newPage(blob, 'camera')
      if (multi) setPages((all) => [...all, page])
      else {
        resume = false
        finish([page])
      }
    } finally {
      shooting.current = false
      if (resume) setDetectionRun((run) => run + 1)
    }
  }

  const imported = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    const { pages: added, skipped } = importFiles(singlePage ? files.slice(0, 1) : files)
    e.target.value = ''
    setConfirmDiscard(false)
    setNotice(
      skipped.length === 0
        ? ''
        : `Skipped ${skipped.length === 1 ? skipped[0] : `${skipped.length} files`}: only images can be imported.`,
    )
    if (added.length === 0) return
    if (multi) setPages((all) => [...all, ...added])
    else finish([...pages, ...added])
  }

  const remove = (id: string) => {
    const page = pages.find((p) => p.id === id)
    if (page) releasePages([page])
    setPages((all) => all.filter((p) => p.id !== id))
  }

  const showVideo = camera.kind !== 'problem'
  const count = pages.length

  return (
    <FullScreen label="Capture pages">
      <div className="flex items-center justify-between gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button type="button" onClick={cancel} className="rounded-full bg-white/15 px-4 py-2 text-sm font-semibold">
          {confirmDiscard ? `Discard ${count} ${count === 1 ? 'page' : 'pages'}?` : 'Cancel'}
        </button>
        {multi && count > 0 && (
          <p className="text-sm font-semibold" aria-live="polite">
            {count} {count === 1 ? 'page' : 'pages'}
          </p>
        )}
      </div>

      <div className="relative min-h-0 flex-1">
        {showVideo ? (
          // Tapping the picture shoots, like the shutter; the button is the keyboard route.
          <div className="absolute inset-0" onClick={shoot}>
            <video
              ref={video}
              className="h-full w-full object-contain"
              playsInline
              muted
              autoPlay
              aria-label="Camera viewfinder"
            />
            <canvas
              ref={overlay}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 h-full w-full"
            />
            {camera.kind === 'starting' && (
              <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-white/80">Starting the camera…</p>
            )}
            {flash && <div aria-hidden className="pointer-events-none absolute inset-0 bg-white/70 motion-reduce:hidden" />}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
            <p role="alert" className="max-w-sm text-white/90">
              {PROBLEM_TEXT[camera.problem]}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {camera.problem !== 'unsupported' && camera.problem !== 'missing' && (
                <button
                  type="button"
                  onClick={() => setAttempt((n) => n + 1)}
                  className="rounded-full bg-white/15 px-4 py-2 font-semibold"
                >
                  Try again
                </button>
              )}
              <button
                type="button"
                onClick={() => picker.current?.click()}
                className="rounded-full bg-white px-4 py-2 font-semibold text-black"
              >
                Import photos
              </button>
            </div>
          </div>
        )}
      </div>

      {notice && (
        <p role="status" className="px-4 pt-2 text-center text-sm text-white/90">
          {notice}
        </p>
      )}

      {multi && count > 0 && (
        <ol className="flex gap-2 overflow-x-auto px-3 pt-3" aria-label="Captured pages">
          {pages.map((page, i) => (
            <li key={page.id} className="relative shrink-0">
              <img src={page.url} alt={`Page ${i + 1}`} className="h-16 w-12 rounded object-cover" />
              <button
                type="button"
                onClick={() => remove(page.id)}
                aria-label={`Remove page ${i + 1}`}
                className="absolute -right-1 -top-1 grid h-6 w-6 place-items-center rounded-full bg-black/80 text-sm leading-none"
              >
                ×
              </button>
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-col gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {!singlePage && <div className="mx-auto flex rounded-full bg-white/15 p-1 text-sm font-semibold" role="group" aria-label="Pages">
          {[false, true].map((m) => (
            <button
              key={String(m)}
              type="button"
              aria-pressed={multi === m}
              onClick={() => setMulti(m)}
              className={`rounded-full px-4 py-1.5 ${multi === m ? 'bg-white text-black' : ''}`}
            >
              {m ? 'Multi-page' : 'Single page'}
            </button>
          ))}
        </div>}
        <div className="grid grid-cols-3 items-center">
          <button
            type="button"
            onClick={() => picker.current?.click()}
            className="justify-self-start rounded-full bg-white/15 px-4 py-3 text-sm font-semibold"
          >
            Import
          </button>
          <button
            ref={shutter}
            type="button"
            onClick={shoot}
            disabled={camera.kind !== 'live'}
            aria-label="Take photo"
            className="h-18 w-18 justify-self-center rounded-full border-4 border-white bg-white/90 ring-4 ring-black transition active:scale-95 disabled:opacity-40"
          />
          {multi && (
            <button
              type="button"
              onClick={() => finish(pages)}
              disabled={count === 0}
              className="justify-self-end rounded-full bg-white px-4 py-3 text-sm font-semibold text-black disabled:opacity-40"
            >
              Done
            </button>
          )}
        </div>
      </div>

      <input
        ref={picker}
        type="file"
        accept="image/*"
        multiple={!singlePage}
        hidden
        onChange={imported}
        data-testid="import-input"
      />
    </FullScreen>
  )
}
