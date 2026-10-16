import { useEffect, useRef, useState } from 'react'
import { initApp } from '@freeappstore/sdk'
import { BuildInfo, type NavItem, PageHeader, Shell } from '@freeappstore/sdk/ui'
import { Capture } from './capture/Capture'
import { type Page, releasePages } from './capture/camera'
import { CropEditor } from './crop/CropEditor'

const fas = initApp({ appId: 'flatbed' })

// The app's screens. Shell renders them as its navbar (<nav aria-label="Main">,
// current screen highlighted, a menu on phones). `title` becomes the browser
// tab title on that route.
const NAV: NavItem[] = [
  { label: 'Scans', href: '/', title: 'Flatbed' },
  { label: 'About', href: '/about', title: 'About — Flatbed' },
]

// The features planned for v1 (freeappstore-online/platform#238).
const FEATURES = [
  { name: 'Capture', what: 'Shoot pages with your camera, one or many, or import photos.' },
  { name: 'Auto-crop', what: 'Finds the page edges for you; drag the corners, straighten and rotate.' },
  { name: 'Filters', what: 'Original, greyscale, black & white or magic colour.' },
  { name: 'PDF export', what: 'A multi-page PDF in A4, Letter or fit, to share or download.' },
  { name: 'Your scans', what: 'Rename, reorder pages, delete and export again any time.' },
  { name: 'Private', what: 'Images and PDFs are made on your device and never leave it.' },
]

export default function App() {
  const [path, setPath] = useState(() => window.location.pathname)

  // Keep the screen in step with the browser's back and forward buttons.
  useEffect(() => {
    const sync = () => setPath(window.location.pathname)
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  // Nav clicks switch screens without a page load. Shell scrolls to the top
  // and moves focus to the new screen's PageHeader.
  const navigate = (href: string) => {
    window.history.pushState(null, '', href)
    setPath(href)
  }

  return (
    <Shell app={fas} appName="Flatbed" nav={NAV} onNavigate={navigate}>
      <div className="mx-auto w-full max-w-3xl p-4 sm:p-8">{path === '/about' ? <About /> : <Scans />}</div>
      <BuildInfo />
    </Shell>
  )
}

function Scans() {
  const [capturing, setCapturing] = useState(false)
  // This session's pages. Filters, export and saving come next (#238).
  const [pages, setPages] = useState<Page[]>([])
  // Pages waiting to be cropped, in order; new captures join the queue.
  const [toCrop, setToCrop] = useState<string[]>([])
  const held = useRef(pages)
  held.current = pages
  useEffect(() => () => releasePages(held.current), [])

  const remove = (id: string) => {
    releasePages(pages.filter((p) => p.id === id))
    setPages(pages.filter((p) => p.id !== id))
    setToCrop((q) => q.filter((x) => x !== id))
  }

  const cropping = toCrop.map((id) => pages.find((p) => p.id === id)).find((p) => p !== undefined)
  const croppingIndex = cropping ? pages.indexOf(cropping) : -1
  const nextCrop = () => setToCrop((q) => q.filter((id) => id !== cropping?.id))

  return (
    <>
      <PageHeader
        title="Flatbed"
        description="Scan documents on your device with the camera, or import photos. Nothing leaves your phone."
      />
      <button
        type="button"
        onClick={() => setCapturing(true)}
        className="w-full rounded-[var(--radius)] bg-[var(--ink)] px-4 py-4 text-lg font-semibold text-[var(--paper)] hover:opacity-90 sm:w-auto"
      >
        {pages.length > 0 ? 'Add pages' : 'Scan a document'}
      </button>

      {pages.length > 0 && (
        <section className="mt-6" aria-labelledby="pages-heading">
          <h2 id="pages-heading" className="font-semibold text-[var(--ink)]">
            {pages.length} {pages.length === 1 ? 'page' : 'pages'}
          </h2>
          <ol className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {pages.map((page, i) => (
              <li key={page.id} className="rounded-[var(--radius)] border border-[var(--line)] p-2">
                <img src={page.url} alt={`Page ${i + 1}`} className="aspect-[3/4] w-full rounded object-cover" />
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-[var(--muted)]">Page {i + 1}</span>
                  <span className="flex gap-3">
                    <button type="button" onClick={() => setToCrop([page.id])} className="underline">
                      Crop<span className="sr-only"> page {i + 1}</span>
                    </button>
                    <button type="button" onClick={() => remove(page.id)} className="underline">
                      Remove<span className="sr-only"> page {i + 1}</span>
                    </button>
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="mt-8">
        <ComingSoon />
      </div>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {FEATURES.map((feature) => (
          <li key={feature.name} className="rounded-[var(--radius)] border border-[var(--line)] p-4">
            <p className="font-semibold text-[var(--ink)]">{feature.name}</p>
            <p className="text-sm text-[var(--muted)]">{feature.what}</p>
          </li>
        ))}
      </ul>

      {capturing && (
        <Capture
          onCancel={() => setCapturing(false)}
          onDone={(added) => {
            setPages((all) => [...all, ...added])
            setToCrop((q) => [...q, ...added.map((p) => p.id)])
            setCapturing(false)
          }}
        />
      )}

      {cropping && (
        <CropEditor
          key={cropping.id}
          blob={cropping.original ?? cropping.blob}
          initial={cropping.crop}
          title={`Crop page ${croppingIndex + 1}`}
          onSkip={nextCrop}
          onApply={(blob, crop) => {
            const url = URL.createObjectURL(blob)
            releasePages([cropping])
            setPages((all) =>
              all.map((p) => (p.id === cropping.id ? { ...p, original: p.original ?? p.blob, blob, url, crop } : p)),
            )
            nextCrop()
          }}
        />
      )}
    </>
  )
}

function About() {
  return (
    <>
      <PageHeader title="About" />
      <ComingSoon />
      <p className="mt-4 text-[var(--muted)]">
        Flatbed will turn your phone's camera into a document scanner: capture pages, crop and
        straighten them, clean them up and save them as a PDF. Everything will happen on your device;
        your images and PDFs are never uploaded. No account, no ads, no subscription.
      </p>
      <p className="mt-4 text-[var(--muted)]">
        Flatbed is a free, MIT-licensed app on{' '}
        <a href="https://freeappstore.online" className="underline">
          FreeAppStore
        </a>
        .
      </p>
    </>
  )
}

// Says plainly which features work yet.
function ComingSoon() {
  return (
    <p className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] p-4 text-[var(--muted)]">
      Flatbed is in development. Capture and cropping work today; filters, PDF export and saved scans are coming soon.
    </p>
  )
}
