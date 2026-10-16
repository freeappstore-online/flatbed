import { PDFDocument } from 'pdf-lib'
import { type Picture, encodeJpeg, openPicture } from '../crop/image'
import type { Pixels } from '../crop/warp'
import { type PaperSize, type Quality, QUALITIES, placement, targetPixels } from './sizing'

/**
 * Builds a multi-page PDF from JPEG images, one per page, on the device.
 * pdf-lib (MIT) embeds the JPEGs as they are, without re-encoding.
 */
export async function buildPdf(jpegs: Uint8Array[], paper: PaperSize): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle('Scan')
  doc.setCreator('Flatbed')
  doc.setProducer('Flatbed (pdf-lib)')
  for (const bytes of jpegs) {
    const image = await doc.embedJpg(bytes)
    const place = placement(image.width, image.height, paper)
    const page = doc.addPage([place.pageWidth, place.pageHeight])
    page.drawImage(image, { x: place.x, y: place.y, width: place.width, height: place.height })
  }
  return doc.save()
}

/**
 * Exports pages as a PDF: each is scaled to the preset's resolution for where
 * it sits on the paper, re-encoded at the preset's JPEG quality, and laid out.
 * `onProgress` hears each finished page (1-based).
 */
export async function exportPdf(
  pages: Blob[],
  paper: PaperSize,
  quality: Quality,
  {
    open = openPicture,
    encode = encodeJpeg,
    onProgress,
  }: {
    open?: (blob: Blob) => Promise<Picture>
    encode?: (pixels: Pixels, quality: number) => Promise<Blob>
    onProgress?: (done: number) => void
  } = {},
): Promise<Blob> {
  const preset = QUALITIES.find((q) => q.id === quality)!
  const jpegs: Uint8Array[] = []
  for (const [i, blob] of pages.entries()) {
    const picture = await open(blob)
    try {
      const target = targetPixels(picture.width, picture.height, placement(picture.width, picture.height, paper), preset.dpi)
      const jpeg = await encode(picture.pixels(Math.max(target.width, target.height)), preset.jpeg)
      jpegs.push(new Uint8Array(await jpeg.arrayBuffer()))
    } finally {
      picture.close()
    }
    onProgress?.(i + 1)
    // Give the screen a chance to update between pages.
    await new Promise((r) => setTimeout(r, 0))
  }
  const bytes = await buildPdf(jpegs, paper)
  return new Blob([bytes as BlobPart], { type: 'application/pdf' })
}
