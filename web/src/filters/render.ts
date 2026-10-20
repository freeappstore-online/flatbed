import { type Picture, encodeJpeg, openPicture } from '../crop/image'
import type { Pixels } from '../crop/warp'
import { type Filter, applyFilter } from './filters'
import { DEFAULT_ADJUSTMENTS, type Adjustments, applyAdjustments, hasAdjustments } from './adjustments'

/** Bound edited JPEGs to avoid decoding and processing very large photos at full size. */
export const FILTER_OUTPUT_SIDE = 2800

/** Applies a filter and manual adjustments to a page image. The input blob is retained for later edits. */
export async function filterBlob(
  blob: Blob,
  filter: Filter,
  adjustments: Adjustments = DEFAULT_ADJUSTMENTS,
  open: (blob: Blob) => Promise<Picture> = openPicture,
  encode: (pixels: Pixels) => Promise<Blob> = encodeJpeg,
): Promise<Blob> {
  if (filter === 'original' && !hasAdjustments(adjustments)) return blob
  const picture = await open(blob)
  try {
    const filtered = applyFilter(picture.pixels(FILTER_OUTPUT_SIDE), filter)
    return await encode(hasAdjustments(adjustments) ? applyAdjustments(filtered, adjustments) : filtered)
  } finally {
    picture.close()
  }
}
