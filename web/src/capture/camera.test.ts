import { describe, expect, it, vi } from 'vitest'
import {
  CAMERA_CONSTRAINTS,
  type Page,
  cameraProblem,
  grabFrame,
  importFiles,
  isImportable,
  movePage,
  openCamera,
  releasePages,
  stopCamera,
} from './camera'

const named = (name: string) => Object.assign(new Error(name), { name })

describe('cameraProblem', () => {
  it.each([
    ['NotAllowedError', 'blocked'],
    ['SecurityError', 'blocked'],
    ['NotFoundError', 'missing'],
    ['OverconstrainedError', 'missing'],
    ['NotReadableError', 'busy'],
    ['AbortError', 'busy'],
    ['TypeError', 'failed'],
  ])('%s is %s', (name, problem) => {
    expect(cameraProblem(named(name))).toBe(problem)
  })

  it('copes with non-errors', () => {
    expect(cameraProblem(undefined)).toBe('failed')
    expect(cameraProblem('nope')).toBe('failed')
  })
})

describe('openCamera', () => {
  it('asks for the back camera without audio', async () => {
    const stream = {} as MediaStream
    const getUserMedia = vi.fn().mockResolvedValue(stream)
    expect(await openCamera({ getUserMedia })).toEqual({ stream })
    expect(getUserMedia).toHaveBeenCalledWith(CAMERA_CONSTRAINTS)
    expect(CAMERA_CONSTRAINTS.audio).toBe(false)
    expect((CAMERA_CONSTRAINTS.video as MediaTrackConstraints).facingMode).toEqual({ ideal: 'environment' })
  })

  it('reports no camera API as unsupported', async () => {
    expect(await openCamera(undefined)).toEqual({ problem: 'unsupported' })
    expect(await openCamera({})).toEqual({ problem: 'unsupported' })
  })

  it('reports a denied permission as blocked', async () => {
    const getUserMedia = vi.fn().mockRejectedValue(named('NotAllowedError'))
    expect(await openCamera({ getUserMedia })).toEqual({ problem: 'blocked' })
  })
})

describe('stopCamera', () => {
  it('stops every track and tolerates no stream', () => {
    const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }]
    stopCamera({ getTracks: () => tracks } as unknown as MediaStream)
    tracks.forEach((t) => expect(t.stop).toHaveBeenCalled())
    expect(() => stopCamera(undefined)).not.toThrow()
  })
})

describe('grabFrame', () => {
  const fakeCanvas = () => {
    const drawImage = vi.fn()
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage }),
      toBlob: (done: (b: Blob | null) => void, type: string) => done(new Blob(['x'], { type })),
    }
    return { canvas: canvas as unknown as HTMLCanvasElement, drawImage }
  }

  it('draws the frame at full resolution as a JPEG', async () => {
    const { canvas, drawImage } = fakeCanvas()
    const video = { videoWidth: 3840, videoHeight: 2160 } as HTMLVideoElement
    const blob = await grabFrame(video, () => canvas)
    expect(blob?.type).toBe('image/jpeg')
    expect([canvas.width, canvas.height]).toEqual([3840, 2160])
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 3840, 2160)
  })

  it('gives null before the video has a frame', async () => {
    const { canvas } = fakeCanvas()
    expect(await grabFrame({ videoWidth: 0, videoHeight: 0 } as HTMLVideoElement, () => canvas)).toBeNull()
  })
})

describe('import', () => {
  it('accepts images, including iPhone HEIC and typeless image names', () => {
    expect(isImportable({ type: 'image/jpeg', name: 'a.jpg' })).toBe(true)
    expect(isImportable({ type: 'image/heic', name: 'IMG_1.HEIC' })).toBe(true)
    expect(isImportable({ type: '', name: 'scan.PNG' })).toBe(true)
    expect(isImportable({ type: 'image/svg+xml', name: 'logo.svg' })).toBe(false)
    expect(isImportable({ type: 'application/pdf', name: 'doc.pdf' })).toBe(false)
    expect(isImportable({ type: '', name: 'notes.txt' })).toBe(false)
  })

  it('turns images into pages in order and lists the rest as skipped', () => {
    const files = [
      new File(['1'], 'one.jpg', { type: 'image/jpeg' }),
      new File(['2'], 'doc.pdf', { type: 'application/pdf' }),
      new File(['3'], 'two.png', { type: 'image/png' }),
    ]
    let n = 0
    const { pages, skipped } = importFiles(files, () => `blob:${++n}`)
    expect(pages.map((p) => [p.blob, p.url, p.source])).toEqual([
      [files[0], 'blob:1', 'import'],
      [files[2], 'blob:2', 'import'],
    ])
    expect(new Set(pages.map((p) => p.id)).size).toBe(2)
    expect(skipped).toEqual(['doc.pdf'])
  })
})

describe('pages', () => {
  const page = (id: string): Page => ({ id, blob: new Blob(), url: `blob:${id}`, source: 'camera' })
  const ids = (pages: Page[]) => pages.map((p) => p.id).join('')

  it('moves a page and clamps at the ends', () => {
    const pages = ['a', 'b', 'c'].map(page)
    expect(ids(movePage(pages, 0, 1))).toBe('bac')
    expect(ids(movePage(pages, 2, -2))).toBe('cab')
    expect(movePage(pages, 0, -1)).toBe(pages)
    expect(movePage(pages, 5, 1)).toBe(pages)
  })

  it('revokes each page URL on release', () => {
    const revoke = vi.fn()
    releasePages(['a', 'b'].map(page), revoke)
    expect(revoke.mock.calls).toEqual([['blob:a'], ['blob:b']])
  })
})
