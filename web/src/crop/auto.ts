import type { Page } from '../capture/camera'
import { DETECT_SIDE, detectQuad } from './edges'
import { encodeJpeg, openPicture } from './image'
import { scaleQuad } from './perspective'
import { warp } from './warp'

/** Straighten a detected page without opening the manual crop editor. */
export async function autoCropPage(page: Page): Promise<Page> {
  const picture = await openPicture(page.blob)
  try {
    const small = picture.pixels(DETECT_SIDE)
    const found = detectQuad(small)
    if (!found) return page
    const quad = scaleQuad(found, picture.width / small.width, picture.height / small.height)
    const cropped = await encodeJpeg(warp(picture.pixels(), quad))
    return {
      ...page,
      original: page.blob,
      cropped,
      crop: { quad, turns: 0 },
      blob: cropped,
      url: URL.createObjectURL(cropped),
    }
  } finally {
    picture.close()
  }
}
