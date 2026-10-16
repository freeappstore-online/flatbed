// Camera and import plumbing for capture. Kept free of React so it can be
// tested in Node; the browser APIs it needs are passed in.

/** One captured page: the image as shot or imported, before any cropping. */
export type Page = {
  id: string
  blob: Blob
  /** Object URL for showing the page; revoke it with releasePages. */
  url: string
  source: 'camera' | 'import'
}

/** Why the camera isn't showing a picture. */
export type CameraProblem = 'unsupported' | 'blocked' | 'missing' | 'busy' | 'failed'

/** The camera we ask for: the back one, as sharp as the device offers. */
export const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 3840 },
    height: { ideal: 2160 },
  },
  audio: false,
}

/** Maps a getUserMedia rejection to what we tell the person. */
export function cameraProblem(err: unknown): CameraProblem {
  const name = (err as { name?: string } | null)?.name
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
    case 'PermissionDeniedError':
      return 'blocked'
    case 'NotFoundError':
    case 'OverconstrainedError':
    case 'DevicesNotFoundError':
      return 'missing'
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'busy'
    default:
      return 'failed'
  }
}

type MediaLike = { getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream> }

/** Opens the back camera, or says why it can't. */
export async function openCamera(
  media: MediaLike | undefined,
): Promise<{ stream: MediaStream } | { problem: CameraProblem }> {
  if (!media?.getUserMedia) return { problem: 'unsupported' }
  try {
    return { stream: await media.getUserMedia(CAMERA_CONSTRAINTS) }
  } catch (err) {
    return { problem: cameraProblem(err) }
  }
}

export function stopCamera(stream: MediaStream | undefined) {
  stream?.getTracks().forEach((track) => track.stop())
}

/**
 * Takes a still from the live video at the camera's full resolution.
 * Resolves null when the video has no frame yet.
 */
export function grabFrame(
  video: HTMLVideoElement,
  makeCanvas: () => HTMLCanvasElement = () => document.createElement('canvas'),
): Promise<Blob | null> {
  const { videoWidth: width, videoHeight: height } = video
  if (!width || !height) return Promise.resolve(null)
  const canvas = makeCanvas()
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.resolve(null)
  ctx.drawImage(video, 0, 0, width, height)
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
}

/** Image types we can import. HEIC is listed for iPhones; the browser decodes it where it can. */
const IMAGE_TYPE = /^image\/(jpeg|png|webp|gif|bmp|avif|heic|heif)$/
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i

export function isImportable(file: { type: string; name: string }) {
  return IMAGE_TYPE.test(file.type) || (!file.type && IMAGE_EXT.test(file.name))
}

/** Splits picked files into pages and the ones we skipped. */
export function importFiles(
  files: Iterable<File>,
  makeUrl: (blob: Blob) => string = (blob) => URL.createObjectURL(blob),
): { pages: Page[]; skipped: string[] } {
  const pages: Page[] = []
  const skipped: string[] = []
  for (const file of files) {
    if (isImportable(file)) pages.push(newPage(file, 'import', makeUrl))
    else skipped.push(file.name)
  }
  return { pages, skipped }
}

export function newPage(
  blob: Blob,
  source: Page['source'],
  makeUrl: (blob: Blob) => string = (b) => URL.createObjectURL(b),
): Page {
  return { id: crypto.randomUUID(), blob, url: makeUrl(blob), source }
}

export function releasePages(pages: Page[], revoke: (url: string) => void = (url) => URL.revokeObjectURL(url)) {
  pages.forEach((page) => revoke(page.url))
}

/** Moves the page at `from` by `by` places (-1 earlier, +1 later), clamped to the ends. */
export function movePage(pages: Page[], from: number, by: number): Page[] {
  const to = Math.max(0, Math.min(pages.length - 1, from + by))
  if (from < 0 || from >= pages.length || to === from) return pages
  const next = pages.slice()
  const [page] = next.splice(from, 1)
  next.splice(to, 0, page)
  return next
}
