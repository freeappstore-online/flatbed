import fs from 'node:fs'
import AxeBuilder from '@axe-core/playwright'
import { type Page, expect, test } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { FRAME, PAGE_CORNERS, pagePhoto, useFakeCamera } from './fake-camera'

// The journey from platform#245 (capture → crop → filter → PDF) in light and
// dark themes with an accessibility check at each step, plus the library,
// import when the camera is blocked, and offline use. Each test starts with
// an empty library in a fresh browser context.

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

/** Opens the camera from the home screen and takes one photo (single-page mode). */
async function shootOnePage(page: Page) {
  await page.getByRole('button', { name: 'New scan' }).click()
  const camera = dialog(page, 'Capture pages')
  await expect(camera.getByLabel('Camera viewfinder')).toBeVisible()
  await expect(camera.getByRole('button', { name: 'Take photo' })).toBeEnabled()
  await camera.getByRole('button', { name: 'Take photo' }).click()
}

/** Where a crop corner handle sits, in fake-camera pixels. */
async function cornerAt(page: Page, name: string) {
  const style = await dialog(page, /^Crop page/).getByRole('button', { name: `${name} corner` }).getAttribute('style')
  const left = Number(/left: ([\d.]+)%/.exec(style ?? '')?.[1])
  const top = Number(/top: ([\d.]+)%/.exec(style ?? '')?.[1])
  return { x: (left / 100) * FRAME.width, y: (top / 100) * FRAME.height }
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} theme`, () => {
    test.use({ colorScheme })

    test('capture → crop → filter → PDF', async ({ page }) => {
      await useFakeCamera(page)
      await page.goto('/')
      if (colorScheme === 'dark') await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
      else await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark')
      await expect(page.getByText('No scans yet.')).toBeVisible()
      await expectAccessible(page, 'the empty library')

      // Capture: the viewfinder shows the fake camera; the shutter takes the photo.
      await page.getByRole('button', { name: 'New scan' }).click()
      const camera = dialog(page, 'Capture pages')
      await expect(camera.getByRole('button', { name: 'Take photo' })).toBeEnabled()
      await expect(camera).toHaveCSS('background-color', 'rgb(0, 0, 0)') // dark in either theme
      await expectAccessible(page, 'the camera')
      await camera.getByRole('button', { name: 'Take photo' }).click()

      // Crop: the page's edges are found, close to where the fake camera drew them.
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
      const filter = dialog(page, 'Filter page 1')
      await expect(filter.getByRole('img', { name: 'Preview: Original' })).toBeVisible()
      await filter.getByRole('button', { name: 'Black & white' }).click()
      await expect(filter.getByRole('button', { name: 'Black & white' })).toHaveAttribute('aria-pressed', 'true')
      await expect(filter.getByRole('img', { name: 'Preview: Black & white' })).toBeVisible()
      await expectAccessible(page, 'the filter editor')
      await filter.getByRole('button', { name: 'Done' }).click()

      // The saved scan: one straightened, portrait page.
      await expect(page.getByRole('heading', { name: /^Scan \d{4}-\d\d-\d\d \d\d\.\d\d$/ })).toBeVisible()
      await expect(page.getByRole('heading', { name: '1 page' })).toBeVisible()
      await expect(page.getByText('Page 1 · Black & white')).toBeVisible()
      const size = await page.getByRole('img', { name: 'Page 1' }).evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight])
      expect(size[1]).toBeGreaterThan(size[0])
      await expectAccessible(page, 'the scan')

      // PDF: downloaded (sharing is hidden in this browser), one A4 page.
      const downloading = page.waitForEvent('download')
      await page.getByRole('button', { name: 'Download PDF' }).click()
      const download = await downloading
      expect(download.suggestedFilename()).toMatch(/^Scan \d{4}-\d\d-\d\d \d\d\.\d\d\.pdf$/)
      const pdf = await PDFDocument.load(fs.readFileSync((await download.path())!))
      expect(pdf.getPageCount()).toBe(1)
      const { width, height } = pdf.getPage(0).getSize()
      expect([Math.round(width), Math.round(height)]).toEqual([595, 842])
      await expect(page.getByText(/^Downloaded Scan .*\.pdf \(\d+(\.\d)? [KM]B\)\.$/)).toBeVisible()

      // Saved on the device: still there after a reload.
      await page.goto('/')
      await expect(page.getByRole('button', { name: /^Scan .*1 page/ })).toBeVisible()
      await expectAccessible(page, 'the library')
      await page.getByRole('button', { name: 'Privacy' }).click()
      await expect(page.getByRole('region', { name: /Privacy/ })).toContainText('Images and PDFs never leave it')
      await expectAccessible(page, 'About')
    })
  })
}

test('library: multi-page scan, reorder, rename, re-export, delete', async ({ page }) => {
  await useFakeCamera(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'New scan' }).click()
  const camera = dialog(page, 'Capture pages')
  await camera.getByRole('button', { name: 'Multi-page' }).click()
  for (const n of [1, 2, 3]) {
    await expect(camera.getByRole('button', { name: 'Take photo' })).toBeEnabled()
    await camera.getByRole('button', { name: 'Take photo' }).click()
    await expect(camera.getByText(`${n} page${n > 1 ? 's' : ''}`)).toBeVisible()
  }
  await camera.getByRole('button', { name: 'Done' }).click()

  // Each page is offered for crop then filter; keep them all as they are.
  for (const n of [1, 2, 3]) {
    await dialog(page, `Crop page ${n}`).getByRole('button', { name: 'Keep as is' }).click()
    await dialog(page, `Filter page ${n}`).getByRole('button', { name: 'Keep as is' }).click()
  }
  await expect(page.getByRole('heading', { name: '3 pages' })).toBeVisible()

  // Reorder: page 1 moves to the end.
  const srcs = () => page.getByRole('img', { name: /^Page \d$/ }).evaluateAll((imgs) => imgs.map((i) => (i as HTMLImageElement).src))
  const [first, second, third] = await srcs()
  await page.getByRole('button', { name: 'Move page 1 later' }).click()
  await page.getByRole('button', { name: 'Move page 2 later' }).click()
  expect(await srcs()).toEqual([second, third, first])

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

  await camera.getByTestId('import-input').setInputFiles(await pagePhoto(page))
  await expect(dialog(page, 'Crop page 1').getByText('Found the page. Drag the corners to adjust.')).toBeVisible()
  await dialog(page, 'Crop page 1').getByRole('button', { name: 'Done' }).click()
  await dialog(page, 'Filter page 1').getByRole('button', { name: 'Magic colour' }).click()
  await dialog(page, 'Filter page 1').getByRole('button', { name: 'Done' }).click()
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
  await dialog(page, 'Crop page 1').getByRole('button', { name: 'Done' }).click()
  await dialog(page, 'Filter page 1').getByRole('button', { name: 'Greyscale' }).click()
  await dialog(page, 'Filter page 1').getByRole('button', { name: 'Done' }).click()
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
