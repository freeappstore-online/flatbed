import fs from 'node:fs'
import AxeBuilder from '@axe-core/playwright'
import { type Page, expect, test } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { FRAME, PAGE_CORNERS, pagePhoto, useFakeCamera } from './fake-camera'

// Every journey runs in light and dark themes at phone size (Pixel 7): a
// two-page scan through capture → crop → filter → PDF with an accessibility
// check at each step (platform#245), the library, import when the camera is
// blocked, and offline use. Each test starts with an empty library in a fresh
// browser context. Set E2E_BASE_URL to run against the live site.

test.beforeEach(async ({ page }) => {
  // Keep test runs out of the app's usage statistics.
  await page.route('**/v1/analytics**', (route) =>
    route.fulfill({ status: 204, contentType: 'application/javascript', body: '' }),
  )
})

/** Fails on any WCAG 2.2 A/AA violation axe can find on the current screen. */
async function expectAccessible(page: Page, where: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  const summary = violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => `${n.target.join(' ')} ${n.html.slice(0, 120)} ${n.failureSummary ?? ''}`).join('; ')})`)
  expect(summary, `accessibility problems on ${where}`).toEqual([])
}

const dialog = (page: Page, name: string | RegExp) => page.getByRole('dialog', { name })

async function draftCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('flatbed')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const count = await new Promise<number>((resolve, reject) => {
      const request = db.transaction('drafts').objectStore('drafts').get('active')
      request.onsuccess = () => resolve(request.result?.pages.length ?? 0)
      request.onerror = () => reject(request.error)
    })
    db.close()
    return count
  })
}

test('recovers an interrupted capture and clears its draft on save or discard', async ({ page }) => {
  await useFakeCamera(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'New scan' }).click()
  const camera = dialog(page, 'Capture pages')
  await camera.getByRole('button', { name: 'Auto capture on' }).click()
  await camera.getByRole('button', { name: 'Take photo' }).click()
  await expect(camera.getByRole('img', { name: 'Page 1' })).toBeVisible()
  await expect.poll(() => draftCount(page)).toBe(1)
  await page.reload()
  const recovery = page.getByRole('region', { name: 'Unfinished scan' })
  await expect(recovery).toContainText('1 page was saved on this device')
  await expect(page.getByRole('button', { name: 'New scan' })).toBeDisabled()
  await recovery.getByRole('button', { name: 'Resume' }).click()
  const review = dialog(page, 'Review pages')
  await expect(review.getByRole('img', { name: 'Page 1' })).toBeVisible()
  await review.getByRole('button', { name: 'Save scan' }).click()
  await expect(page.getByRole('heading', { name: '1 page' })).toBeVisible()
  await expect.poll(() => draftCount(page)).toBe(0)
  await page.getByRole('button', { name: 'Add pages' }).click()
  await dialog(page, 'Capture pages').getByTestId('import-input').setInputFiles(await pagePhoto(page))
  await expect.poll(() => draftCount(page)).toBe(1)
  await page.reload()
  await expect(page.getByRole('region', { name: 'Unfinished scan' })).toContainText('Resume adding these pages')
  await page.getByRole('region', { name: 'Unfinished scan' }).getByRole('button', { name: 'Resume' }).click()
  await dialog(page, 'Review pages').getByRole('button', { name: 'Add to scan' }).click()
  await expect(page.getByRole('heading', { name: '2 pages' })).toBeVisible()
  await expect.poll(() => draftCount(page)).toBe(0)
  await page.goto('/')
  await expect(page.getByRole('region', { name: 'Unfinished scan' })).toHaveCount(0)
  await expect(page.getByRole('listitem')).toHaveCount(1)

  await page.getByRole('button', { name: 'New scan' }).click()
  await dialog(page, 'Capture pages').getByTestId('import-input').setInputFiles(await pagePhoto(page))
  await expect.poll(() => draftCount(page)).toBe(1)
  await page.reload()
  await page.getByRole('region', { name: 'Unfinished scan' }).getByRole('button', { name: 'Discard' }).click()
  await expect(page.getByRole('region', { name: 'Unfinished scan' })).toHaveCount(0)
  await expect.poll(() => draftCount(page)).toBe(0)
  await expect(page.getByRole('listitem')).toHaveCount(1)
})

/** Opens the camera from the home screen and takes one photo (single-page mode). */
async function shootOnePage(page: Page) {
  await page.getByRole('button', { name: 'New scan' }).click()
  const camera = dialog(page, 'Capture pages')
  await expect(camera.getByLabel('Camera viewfinder')).toBeVisible()
  await expect(camera.getByRole('button', { name: 'Take photo' })).toBeEnabled()
  await camera.getByRole('button', { name: 'Auto capture on' }).click()
  await camera.getByRole('button', { name: 'Single page' }).click()
  await camera.getByRole('button', { name: 'Take photo' }).click()
}

/** Where a crop corner handle sits, in fake-camera pixels. */
async function cornerAt(page: Page, name: string) {
  const style = await dialog(page, /^Crop page/).getByRole('button', { name: `${name} corner` }).getAttribute('style')
  const left = Number(/left: ([\d.]+)%/.exec(style ?? '')?.[1])
  const top = Number(/top: ([\d.]+)%/.exec(style ?? '')?.[1])
  return { x: (left / 100) * FRAME.width, y: (top / 100) * FRAME.height }
}

test('automatically captures a page held steady in the viewfinder', async ({ page }) => {
  await useFakeCamera(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'New scan' }).click()
  await expect(dialog(page, 'Capture pages').getByRole('button', { name: 'Auto capture on' })).toBeVisible()
  await expect(dialog(page, 'Capture pages').getByRole('img', { name: 'Page 1' })).toBeVisible({ timeout: 15_000 })
  await dialog(page, 'Capture pages').getByRole('button', { name: 'Done' }).click()
  await expect(dialog(page, 'Review pages').getByRole('img', { name: 'Page 1' })).toBeVisible()
})

test('toggles a supported camera torch and turns it off on exit', async ({ page }) => {
  await useFakeCamera(page, { torch: true })
  await page.goto('/')
  await page.getByRole('button', { name: 'New scan' }).click()
  const camera = dialog(page, 'Capture pages')
  await camera.getByRole('button', { name: 'Auto capture on' }).click()
  await expect(camera.getByRole('button', { name: 'Torch off' })).toBeVisible()
  await camera.getByRole('button', { name: 'Torch off' }).click()
  await expect(camera.getByRole('button', { name: 'Torch on' })).toHaveAttribute('aria-pressed', 'true')
  await camera.getByRole('button', { name: 'Torch on' }).click()
  await expect(camera.getByRole('button', { name: 'Torch off' })).toHaveAttribute('aria-pressed', 'false')
  await camera.getByRole('button', { name: 'Torch off' }).click()
  await camera.getByRole('button', { name: 'Cancel' }).click()
  await expect.poll(() => page.evaluate(() => (window as Window & { __flatbedTorch?: (boolean | 'stop')[] }).__flatbedTorch)).toContain('stop')
  const calls = await page.evaluate(() => (window as Window & { __flatbedTorch?: (boolean | 'stop')[] }).__flatbedTorch)
  expect(calls).toContain(true)
  expect(calls).toContain(false)
})

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} theme`, () => {
    test.use({ colorScheme })

    test('capture → crop → filter → 2-page PDF', async ({ page }) => {
      await useFakeCamera(page)
      await page.goto('/')
      if (colorScheme === 'dark') await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
      else await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark')
      await expect(page.getByText('No scans yet.')).toBeVisible()
      await expectAccessible(page, 'the empty library')

      // Capture: the viewfinder shows the fake camera; two pages in multi-page mode.
      await page.getByRole('button', { name: 'New scan' }).click()
      const camera = dialog(page, 'Capture pages')
      await expect(camera.getByRole('button', { name: 'Take photo' })).toBeEnabled()
      await expect(camera.getByRole('button', { name: /Torch/ })).toHaveCount(0)
      // This journey exercises the manual shutter; keep auto capture for its own test.
      await camera.getByRole('button', { name: 'Auto capture on' }).click()
      await expect(camera).toHaveCSS('background-color', 'rgb(0, 0, 0)') // dark in either theme
      await expectAccessible(page, 'the camera')
      await expect(camera.getByRole('button', { name: 'Multi-page' })).toHaveAttribute('aria-pressed', 'true')
      for (const n of [1, 2]) {
        await expect(camera.getByRole('button', { name: 'Take photo' })).toBeEnabled()
        await camera.getByRole('button', { name: 'Take photo' }).click()
        await expect(camera.getByRole('img', { name: `Page ${n}` })).toBeVisible()
      }
      await camera.getByRole('button', { name: 'Done' }).click()
      const review = dialog(page, 'Review pages')
      await expect(review.getByRole('button', { name: 'Save scan' })).toBeEnabled()
      await expect(review.getByText('Page 2 · Auto-cropped')).toBeVisible()
      await expectAccessible(page, 'the batch review')

      // Only page 1 needs a manual crop adjustment.
      await review.getByRole('button', { name: 'Crop page 1' }).click()
      const crop = dialog(page, 'Crop page 1')
      await expect(crop.getByText('Found the page. Drag the corners to adjust.')).toBeVisible()
      for (const [i, name] of ['Top-left', 'Top-right', 'Bottom-right', 'Bottom-left'].entries()) {
        const at = await cornerAt(page, name)
        expect(Math.abs(at.x - PAGE_CORNERS[i].x), `${name} x`).toBeLessThan(25)
        expect(Math.abs(at.y - PAGE_CORNERS[i].y), `${name} y`).toBeLessThan(25)
      }
      await expectAccessible(page, 'the crop editor')

      // Drag a corner with the pointer, and nudge one with the keyboard.
      const handle = crop.getByRole('button', { name: 'Top-left corner' })
      const before = await cornerAt(page, 'Top-left')
      const box = (await handle.boundingBox())!
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2 + 8, { steps: 4 })
      await page.mouse.up()
      const dragged = await cornerAt(page, 'Top-left')
      expect(dragged.x).toBeGreaterThan(before.x)
      expect(dragged.y).toBeGreaterThan(before.y)
      await crop.getByRole('button', { name: 'Bottom-right corner' }).press('ArrowLeft')
      await crop.getByRole('button', { name: 'Done' }).click()

      // Filter: pick black & white from the previews.
      await review.getByRole('button', { name: 'Filter page 1' }).click()
      const filter = dialog(page, 'Filter page 1')
      await expect(filter.getByRole('img', { name: 'Preview: Original' })).toBeVisible()
      await filter.getByRole('button', { name: 'Black & white' }).click()
      await expect(filter.getByRole('button', { name: 'Black & white' })).toHaveAttribute('aria-pressed', 'true')
      await expect(filter.getByRole('img', { name: 'Preview: Black & white' })).toBeVisible()
      for (let i = 0; i < 4; i++) await filter.getByRole('slider', { name: 'Brightness' }).press('ArrowRight')
      for (let i = 0; i < 2; i++) await filter.getByRole('slider', { name: 'Contrast' }).press('ArrowLeft')
      await expect(filter.getByRole('slider', { name: 'Brightness' })).toHaveValue('20')
      await expect(filter.getByRole('slider', { name: 'Contrast' })).toHaveValue('-10')
      await expectAccessible(page, 'the filter editor')
      await filter.getByRole('button', { name: 'Done' }).click()

      // Page 2 was straightened automatically; adjust only its filter.
      await review.getByRole('button', { name: 'Filter page 2' }).click()
      const filter2 = dialog(page, 'Filter page 2')
      await filter2.getByRole('button', { name: 'Black & white' }).click()
      await filter2.getByRole('button', { name: 'Done' }).click()
      await review.getByRole('button', { name: 'Save scan' }).click()

      // The saved scan: two straightened pages.
      await expect(page.getByRole('heading', { name: /^Scan \d{4}-\d\d-\d\d \d\d\.\d\d$/ })).toBeVisible()
      await expect(page.getByRole('heading', { name: '2 pages' })).toBeVisible()
      for (const n of [1, 2]) await expect(page.getByText(`Page ${n} · Black & white`)).toBeVisible()
      // Each page keeps its own adjustment settings, including after a new crop.
      await page.getByRole('button', { name: 'Filter page 1' }).click()
      await expect(dialog(page, 'Filter page 1').getByRole('slider', { name: 'Brightness' })).toHaveValue('20')
      await expect(dialog(page, 'Filter page 1').getByRole('slider', { name: 'Contrast' })).toHaveValue('-10')
      await dialog(page, 'Filter page 1').getByRole('button', { name: 'Keep as is' }).click()
      await page.reload()
      await page.getByRole('button', { name: 'Filter page 1' }).click()
      await expect(dialog(page, 'Filter page 1').getByRole('slider', { name: 'Brightness' })).toHaveValue('20')
      await expect(dialog(page, 'Filter page 1').getByRole('slider', { name: 'Contrast' })).toHaveValue('-10')
      await dialog(page, 'Filter page 1').getByRole('button', { name: 'Keep as is' }).click()
      await page.getByRole('button', { name: 'Filter page 2' }).click()
      await expect(dialog(page, 'Filter page 2').getByRole('slider', { name: 'Brightness' })).toHaveValue('0')
      await dialog(page, 'Filter page 2').getByRole('button', { name: 'Keep as is' }).click()
      await page.getByRole('button', { name: 'Crop page 1' }).click()
      await dialog(page, 'Crop page 1').getByRole('button', { name: 'Done' }).click()
      await page.getByRole('button', { name: 'Filter page 1' }).click()
      await expect(dialog(page, 'Filter page 1').getByRole('slider', { name: 'Brightness' })).toHaveValue('20')
      await expect(dialog(page, 'Filter page 1').getByRole('slider', { name: 'Contrast' })).toHaveValue('-10')
      await dialog(page, 'Filter page 1').getByRole('button', { name: 'Keep as is' }).click()
      // Page 2 kept the detected corners: it's the drawn page straightened (longer of each pair of
      // opposite edges), give or take the edge detector's few pixels.
      const [tl, tr, br, bl] = PAGE_CORNERS
      const edge = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)
      const straightened = [Math.max(edge(tl, tr), edge(bl, br)), Math.max(edge(tl, bl), edge(tr, br))]
      await expect.poll(() => page.getByRole('img', { name: 'Page 2' }).evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
      const size = await page.getByRole('img', { name: 'Page 2' }).evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight])
      expect(Math.abs(size[0] - straightened[0]), `page 2 width ${size[0]}`).toBeLessThan(30)
      expect(Math.abs(size[1] - straightened[1]), `page 2 height ${size[1]}`).toBeLessThan(30)
      await expectAccessible(page, 'the scan')

      // PDF: downloaded (sharing is hidden in this browser), two A4 pages.
      const downloading = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Download PDF' }).click()
      const download = await downloading
      expect(download.suggestedFilename()).toMatch(/^Scan \d{4}-\d\d-\d\d \d\d\.\d\d\.pdf$/)
      const pdf = await PDFDocument.load(fs.readFileSync((await download.path())!))
      expect(pdf.getPageCount()).toBe(2)
      const sheets = pdf.getPages().map((p) => [Math.round(p.getSize().width), Math.round(p.getSize().height)])
      // Every sheet is A4; the paper turns to match each page (page 2 is nearly square, so either way).
      for (const sheet of sheets) expect([...sheet].sort((a, b) => a - b)).toEqual([595, 842])
      expect(sheets[1][0] > sheets[1][1], 'page 2 sheet matches its orientation').toBe(size[0] > size[1])
      await expect(page.getByText(/^Downloaded Scan .*\.pdf \(\d+(\.\d)? [KM]B\)\.$/)).toBeVisible()

      // Saved on the device: still there after a reload.
      await page.goto('/')
      await expect(page.getByRole('button', { name: /^Scan .*2 pages/ })).toBeVisible()
      await expectAccessible(page, 'the library')
      await page.getByRole('button', { name: 'Privacy' }).click()
      await expect(page.getByRole('region', { name: /Privacy/ })).toContainText('Images and PDFs never leave it')
      await expectAccessible(page, 'About')
    })

    test('library: multi-page scan, reorder, rename, re-export, delete', async ({ page }) => {
      await useFakeCamera(page)
      await page.goto('/')
      await page.getByRole('button', { name: 'New scan' }).click()
      const camera = dialog(page, 'Capture pages')
      await camera.getByRole('button', { name: 'Auto capture on' }).click()
      for (const n of [1, 2]) {
        await expect(camera.getByRole('button', { name: 'Take photo' })).toBeEnabled()
        await camera.getByRole('button', { name: 'Take photo' }).click()
        await expect(camera.getByText(`${n} page${n > 1 ? 's' : ''}`)).toBeVisible()
      }
      await camera.getByRole('button', { name: 'Done' }).click()
      const review = dialog(page, 'Review pages')
      await expect(review.getByRole('img', { name: 'Page 2' })).toBeVisible()
      await review.getByRole('button', { name: 'Review page 2' }).click()
      const batchPage = dialog(page, 'Review page 2')
      await expect(batchPage.getByRole('img', { name: 'Page 2 full-size preview' })).toBeVisible()
      await expect(batchPage.getByRole('button', { name: 'Next page' })).toBeDisabled()
      await batchPage.getByRole('button', { name: 'Close review' }).click()
      await review.getByRole('button', { name: 'Add pages' }).click()
      await camera.getByRole('button', { name: 'Auto capture on' }).click()
      await camera.getByRole('button', { name: 'Take photo' }).click()
      await expect(camera.getByRole('img', { name: 'Page 1' })).toBeVisible()
      await camera.getByRole('button', { name: 'Done' }).click()
      await expect(review.getByRole('img', { name: 'Page 3' })).toBeVisible()
      await expect(review.getByText('Straightening captured pages…')).toHaveCount(0)
      const batchSrcs = () => review.getByRole('img', { name: /^Page \d$/ }).evaluateAll((imgs) => imgs.map((img) => (img as HTMLImageElement).src))
      const batchOrder = await batchSrcs()
      await review.getByRole('button', { name: 'Move page 1', exact: true }).press('Enter')
      await review.getByRole('button', { name: 'Place page 1 at position 3' }).press('Enter')
      expect(await batchSrcs()).toEqual([batchOrder[1], batchOrder[2], batchOrder[0]])
      await review.getByRole('button', { name: 'Move page 3', exact: true }).click()
      await review.getByRole('button', { name: 'Place page 3 at position 1' }).click()
      expect(await batchSrcs()).toEqual(batchOrder)
      const beforeSave = await page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('flatbed')
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })
        const count = await new Promise<number>((resolve, reject) => {
          const request = db.transaction('scans').objectStore('scans').count()
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })
        db.close()
        return count
      })
      expect(beforeSave).toBe(0)
      await review.getByRole('button', { name: 'Save scan' }).click()
      await expect(page.getByRole('heading', { name: '3 pages' })).toBeVisible()

      // Inspect saved pages at full size before exporting; navigation does not reorder them.
      await page.getByRole('button', { name: 'Review page 2' }).click()
      const pageReview = dialog(page, 'Review page 2')
      await expect(pageReview.getByRole('img', { name: 'Page 2 full-size preview' })).toBeVisible()
      await expect(pageReview.getByRole('button', { name: 'Crop page 2' })).toBeVisible()
      await expect(pageReview.getByRole('button', { name: 'Filter page 2' })).toBeVisible()
      await expect(pageReview.getByRole('button', { name: 'Retake page 2' })).toBeVisible()
      await expect(pageReview.getByRole('button', { name: 'Remove page 2' })).toBeVisible()
      await pageReview.getByRole('button', { name: 'Zoom in' }).click()
      await expect(pageReview.getByRole('status')).toHaveText('150%')
      await pageReview.getByRole('button', { name: 'Next page' }).click()
      await expect(dialog(page, 'Review page 3').getByRole('status')).toHaveText('100%')
      await page.keyboard.press('ArrowLeft')
      await expect(dialog(page, 'Review page 2')).toBeVisible()
      await dialog(page, 'Review page 2').getByLabel('Page 2 image; pinch or double tap to zoom').dblclick()
      await expect(dialog(page, 'Review page 2').getByRole('status')).toHaveText('250%')
      await expectAccessible(page, 'full-page review')
      await page.keyboard.press('Escape')
      await expect(dialog(page, 'Review page 2')).toHaveCount(0)

      // Retake just the middle page. Cancellation preserves every image.
      const savedPages = () => page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('flatbed')
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })
        const rows = await new Promise<{ id: string; blob: Blob; filter?: string }[]>((resolve, reject) => {
          const request = db.transaction('pages').objectStore('pages').getAll()
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })
        db.close()
        return Promise.all(rows.map(async (row) => ({
          id: row.id, filter: row.filter,
          bytes: Array.from(new Uint8Array(await row.blob.arrayBuffer())),
        })))
      })
      const beforeRetake = await savedPages()
      await page.getByRole('button', { name: 'Retake page 2', exact: true }).click()
      await camera.getByRole('button', { name: 'Cancel', exact: true }).click()
      expect(await savedPages()).toEqual(beforeRetake)
      await page.getByRole('button', { name: 'Retake page 2', exact: true }).click()
      await expect(camera.getByRole('button', { name: 'Multi-page', exact: true })).toHaveCount(0)
      await expect(camera.getByRole('button', { name: 'Take photo' })).toBeEnabled()
      await camera.getByRole('button', { name: 'Take photo' }).click()
      await dialog(page, 'Crop page 2').getByRole('button', { name: 'Done' }).click()
      await dialog(page, 'Filter page 2').getByRole('button', { name: 'Greyscale', exact: true }).click()
      await dialog(page, 'Filter page 2').getByRole('button', { name: 'Done' }).click()
      await expect.poll(async () => (await savedPages()).filter((p) => p.filter === 'greyscale').length).toBe(1)
      const afterRetake = await savedPages()
      expect(afterRetake.map((p) => p.id)).toEqual(beforeRetake.map((p) => p.id))
      expect(afterRetake.filter((p) => p.filter !== 'greyscale')).toEqual(beforeRetake.filter((p) => p.id !== afterRetake.find((p) => p.filter === 'greyscale')!.id))
      await page.reload()
      expect(await savedPages()).toEqual(afterRetake)
      await expect(page.getByText('Page 2 · Greyscale')).toBeVisible()

      // Drag page 1 directly to the end; the PDF and reload use this order.
      const srcs = () => page.getByRole('img', { name: /^Page \d$/ }).evaluateAll((imgs) => imgs.map((i) => (i as HTMLImageElement).src))
      const [first, second, third] = await srcs()
      const storedOrder = () => page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('flatbed')
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })
        const scans = await new Promise<{ pages: string[] }[]>((resolve, reject) => {
          const request = db.transaction('scans').objectStore('scans').getAll()
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })
        db.close()
        return scans[0].pages
      })
      const [firstId, secondId, thirdId] = await storedOrder()
      await page.getByRole('button', { name: 'Move page 1', exact: true }).dragTo(page.locator('li[data-reorder-id]').nth(2))
      expect(await srcs()).toEqual([second, third, first])
      await expect.poll(storedOrder).toEqual([secondId, thirdId, firstId])
      await page.reload()
      expect(await storedOrder()).toEqual([secondId, thirdId, firstId])

      // Rename.
      await page.getByRole('button', { name: 'Rename' }).click()
      await page.getByLabel('Name').fill('Tenancy agreement')
      await page.getByRole('button', { name: 'Save' }).click()
      await expect(page.getByRole('heading', { name: 'Tenancy agreement' })).toBeVisible()

      // Both survive a reload.
      await page.reload()
      await expect(page.getByRole('heading', { name: 'Tenancy agreement' })).toBeVisible()
      await expect(page.getByRole('heading', { name: '3 pages' })).toBeVisible()

      // Re-export, on Letter paper, named after the scan.
      await page.getByRole('button', { name: 'Letter' }).click()
      const downloading = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Download PDF' }).click()
      const download = await downloading
      expect(download.suggestedFilename()).toBe('Tenancy agreement.pdf')
      const pdf = await PDFDocument.load(fs.readFileSync((await download.path())!))
      expect(pdf.getPageCount()).toBe(3)
      expect(pdf.getPages().map((p) => p.getSize()).every((s) => [612, 792].includes(Math.round(s.width)))).toBe(true)

      // Delete, after confirming.
      await page.getByRole('button', { name: 'Delete scan' }).click()
      await expect(page.getByRole('alertdialog')).toContainText('Delete “Tenancy agreement” and its 3 pages')
      await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
      await expect(page.getByText('No scans yet.')).toBeVisible()
    })

    test('camera blocked: says so, and imports a photo instead', async ({ page }) => {
      await useFakeCamera(page, { deny: true })
      await page.goto('/')
      await page.getByRole('button', { name: 'New scan' }).click()
      const camera = dialog(page, 'Capture pages')
      await expect(camera.getByRole('alert')).toContainText('Camera access is off for Flatbed')
      await expect(camera.getByRole('button', { name: 'Try again' })).toBeVisible()
      await expectAccessible(page, 'the blocked camera')

      await camera.getByRole('button', { name: 'Single page' }).click()
      await camera.getByTestId('import-input').setInputFiles(await pagePhoto(page))
      const review = dialog(page, 'Review pages')
      await review.getByRole('button', { name: 'Crop page 1' }).click()
      await expect(dialog(page, 'Crop page 1').getByText('Found the page. Drag the corners to adjust.')).toBeVisible()
      await dialog(page, 'Crop page 1').getByRole('button', { name: 'Done' }).click()
      await review.getByRole('button', { name: 'Filter page 1' }).click()
      await dialog(page, 'Filter page 1').getByRole('button', { name: 'Magic colour' }).click()
      await dialog(page, 'Filter page 1').getByRole('button', { name: 'Done' }).click()
      await review.getByRole('button', { name: 'Save scan' }).click()
      await expect(page.getByText('Page 1 · Magic colour')).toBeVisible()
    })

    test('works offline once loaded, including PDF export', async ({ page, context }) => {
      await useFakeCamera(page)
      await page.goto('/')
      await expect(page.getByRole('button', { name: 'New scan' })).toBeVisible()
      // Wait for the service worker to take control and finish precaching.
      await page.evaluate(async () => {
        await navigator.serviceWorker.ready
        if (!navigator.serviceWorker.controller) {
          await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }))
        }
      })

      await context.setOffline(true)
      await page.reload()
      await expect(page.getByRole('button', { name: 'New scan' })).toBeVisible()

      await shootOnePage(page)
      const review = dialog(page, 'Review pages')
      await review.getByRole('button', { name: 'Filter page 1' }).click()
      await dialog(page, 'Filter page 1').getByRole('button', { name: 'Greyscale' }).click()
      await dialog(page, 'Filter page 1').getByRole('button', { name: 'Done' }).click()
      await review.getByRole('button', { name: 'Save scan' }).click()
      await expect(page.getByRole('heading', { name: '1 page' })).toBeVisible()

      // pdf-lib loads on demand; it must come from the precache.
      const downloading = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Download PDF' }).click()
      const pdf = await PDFDocument.load(fs.readFileSync((await (await downloading).path())!))
      expect(pdf.getPageCount()).toBe(1)

      // The third-party licences open offline too.
      await page.goto('/third-party-licenses.txt')
      await expect(page.locator('body')).toContainText('pdf-lib 1.17.1 (MIT)')
    })
  })
}
