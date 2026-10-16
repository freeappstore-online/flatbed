import type { Page } from '@playwright/test'

/** The fake camera's frame size and where the page sits in it (clockwise from top-left). */
export const FRAME = { width: 1280, height: 960 }
export const PAGE_CORNERS = [
  { x: 380, y: 130 },
  { x: 930, y: 170 },
  { x: 990, y: 860 },
  { x: 300, y: 820 },
]

/**
 * Replaces the camera before the app loads: getUserMedia returns a live
 * canvas stream of a white page, shot at an angle, with lines of "text" on a
 * dark desk. With `deny`, it refuses as a blocked permission does.
 * Also hides the Web Share API, so export downloads the PDF.
 */
export async function useFakeCamera(page: Page, { deny = false } = {}) {
  await page.addInitScript(
    ({ frame, corners, deny }) => {
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true })
      Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true })

      const getUserMedia = async (constraints: MediaStreamConstraints) => {
        if (deny) throw new DOMException('Permission denied', 'NotAllowedError')
        if (!constraints.video) throw new DOMException('No microphone', 'NotFoundError')
        const canvas = document.createElement('canvas')
        canvas.width = frame.width
        canvas.height = frame.height
        const ctx = canvas.getContext('2d')!
        const draw = (t: number) => {
          ctx.fillStyle = '#3b2f27'
          ctx.fillRect(0, 0, frame.width, frame.height)
          ctx.beginPath()
          corners.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
          ctx.closePath()
          ctx.fillStyle = '#f4f1ea'
          ctx.fill()
          // Lines of text, following the page's slant.
          ctx.save()
          ctx.clip()
          ctx.strokeStyle = '#555'
          ctx.lineWidth = 6
          for (let row = 0; row < 14; row++) {
            const f = 0.12 + row * 0.055
            const left = { x: corners[0].x + (corners[3].x - corners[0].x) * f, y: corners[0].y + (corners[3].y - corners[0].y) * f }
            const right = { x: corners[1].x + (corners[2].x - corners[1].x) * f, y: corners[1].y + (corners[2].y - corners[1].y) * f }
            ctx.beginPath()
            ctx.moveTo(left.x + (right.x - left.x) * 0.1, left.y + (right.y - left.y) * 0.1)
            ctx.lineTo(left.x + (right.x - left.x) * (0.75 + 0.1 * Math.sin(row)), left.y + (right.y - left.y) * 0.85)
            ctx.stroke()
          }
          ctx.restore()
          // A little sensor noise so frames keep coming.
          ctx.fillStyle = `rgba(0,0,0,${0.02 + 0.01 * Math.sin(t / 200)})`
          ctx.fillRect(0, 0, 4, 4)
          requestAnimationFrame(draw)
        }
        requestAnimationFrame(draw)
        return canvas.captureStream(30)
      }
      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia, enumerateDevices: async () => [] },
        configurable: true,
      })
    },
    { frame: FRAME, corners: PAGE_CORNERS, deny },
  )
}

/** A photo of a page as a PNG file, made in the browser, for the import input. */
export async function pagePhoto(page: Page): Promise<{ name: string; mimeType: string; buffer: Buffer }> {
  const dataUrl = await page.evaluate(
    ({ frame, corners }) => {
      const canvas = document.createElement('canvas')
      canvas.width = frame.width
      canvas.height = frame.height
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#3b2f27'
      ctx.fillRect(0, 0, frame.width, frame.height)
      ctx.beginPath()
      corners.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
      ctx.closePath()
      ctx.fillStyle = '#f4f1ea'
      ctx.fill()
      return canvas.toDataURL('image/png')
    },
    { frame: FRAME, corners: PAGE_CORNERS },
  )
  return { name: 'receipt.png', mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') }
}
