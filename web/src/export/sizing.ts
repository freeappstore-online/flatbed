// Page sizing for PDF export: paper sizes, where each scan sits on its page,
// and how many pixels each quality preset keeps. Pure functions; PDF units
// are points (1/72 inch).

export type PaperSize = 'a4' | 'letter' | 'fit'
export type Quality = 'small' | 'balanced' | 'best'

export const PAPER_SIZES: { id: PaperSize; name: string }[] = [
  { id: 'a4', name: 'A4' },
  { id: 'letter', name: 'Letter' },
  { id: 'fit', name: 'Fit to page' },
]

/** Resolution on paper and JPEG quality for each preset. */
export const QUALITIES: { id: Quality; name: string; dpi: number; jpeg: number }[] = [
  { id: 'small', name: 'Small', dpi: 100, jpeg: 0.6 },
  { id: 'balanced', name: 'Balanced', dpi: 150, jpeg: 0.75 },
  { id: 'best', name: 'Best', dpi: 300, jpeg: 0.9 },
]

const MM = 72 / 25.4
/** Portrait paper in points. */
export const PAPER: Record<Exclude<PaperSize, 'fit'>, { width: number; height: number }> = {
  a4: { width: 210 * MM, height: 297 * MM },
  letter: { width: 612, height: 792 },
}

/** A page and the box its scan is drawn in, in points from the bottom-left. */
export type Placement = { pageWidth: number; pageHeight: number; x: number; y: number; width: number; height: number }

/**
 * Lays a w×h-pixel scan on a page. A4 and Letter turn to match the scan
 * (landscape scans get landscape paper) and the scan is scaled to fill the
 * page without stretching, centred. "Fit" makes the page the scan's own shape,
 * with its long side as long as A4's.
 */
export function placement(w: number, h: number, paper: PaperSize): Placement {
  const landscape = w > h
  if (paper === 'fit') {
    const long = PAPER.a4.height
    const width = landscape ? long : (long * w) / h
    const height = landscape ? (long * h) / w : long
    return { pageWidth: width, pageHeight: height, x: 0, y: 0, width, height }
  }
  const p = PAPER[paper]
  const pageWidth = landscape ? p.height : p.width
  const pageHeight = landscape ? p.width : p.height
  const scale = Math.min(pageWidth / w, pageHeight / h)
  const width = w * scale
  const height = h * scale
  return { pageWidth, pageHeight, x: (pageWidth - width) / 2, y: (pageHeight - height) / 2, width, height }
}

/**
 * The pixel size to embed a scan at: enough for the preset's resolution at
 * the size it's drawn, never more than the scan has.
 */
export function targetPixels(w: number, h: number, place: Placement, dpi: number): { width: number; height: number } {
  const wanted = (place.width / 72) * dpi
  const scale = Math.min(1, wanted / w)
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) }
}

/** A file name like "Scan 2026-10-16 09.05.pdf", in local time. */
export function pdfName(date: Date): string {
  const two = (n: number) => String(n).padStart(2, '0')
  return `Scan ${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}.${two(date.getMinutes())}.pdf`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
