import { type Picture, encodeJpeg, openPicture } from '../crop/image'
import type { Pixels } from '../crop/warp'
import { type Filter, applyFilter } from './filters'

/** Applies a filter to a whole page image. Original hands the same blob back. */
export async function filterBlob(
  blob: Blob,
  filter: Filter,
  open: (blob: Blob) => Promise<Picture> = openPicture,
  encode: (pixels: Pixels) => Promise<Blob> = encodeJpeg,
): Promise<Blob> {
  if (filter === 'original') return blob
  const picture = await open(blob)
  try {
    return await encode(applyFilter(picture.pixels(), filter))
  } finally {
    picture.close()
  }
}
