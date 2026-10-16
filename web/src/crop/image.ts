import type { Pixels } from './warp'

/** A decoded photo the crop editor works on. */
export type Picture = {
  width: number
  height: number
  /** Object URL for showing it; freed by close(). */
  url: string
  /** Its pixels, scaled down so the long side is at most `maxSide`. */
  pixels: (maxSide?: number) => Pixels
  close: () => void
}

function canvas(width: number, height: number) {
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('No 2D canvas')
  return { c, ctx }
}

/** Decodes an image (respecting its EXIF orientation, as <img> does). */
export async function openPicture(blob: Blob): Promise<Picture> {
  const bitmap = await createImageBitmap(blob)
  const url = URL.createObjectURL(blob)
  return {
    width: bitmap.width,
    height: bitmap.height,
    url,
    pixels(maxSide = Infinity) {
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
      const w = Math.max(1, Math.round(bitmap.width * scale))
      const h = Math.max(1, Math.round(bitmap.height * scale))
      const { ctx } = canvas(w, h)
      ctx.drawImage(bitmap, 0, 0, w, h)
      return ctx.getImageData(0, 0, w, h)
    },
    close() {
      bitmap.close()
      URL.revokeObjectURL(url)
    },
  }
}

/** Encodes pixels as a JPEG. */
export function encodeJpeg(pixels: Pixels): Promise<Blob> {
  const { c, ctx } = canvas(pixels.width, pixels.height)
  ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height), 0, 0)
  return new Promise((resolve, reject) =>
    c.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't encode the page"))), 'image/jpeg', 0.92),
  )
}

/** Draws pixels into a canvas element (for previews). Does nothing where canvas isn't available. */
export function drawPixels(target: HTMLCanvasElement, pixels: Pixels) {
  target.width = pixels.width
  target.height = pixels.height
  target
    .getContext('2d')
    ?.putImageData(new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height), 0, 0)
}
