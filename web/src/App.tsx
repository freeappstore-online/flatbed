import { useEffect, useState } from 'react'
import { initApp } from '@freeappstore/sdk'
import { BuildInfo, type NavItem, PageHeader, Shell } from '@freeappstore/sdk/ui'

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
  { name: 'Auto-crop', what: 'Finds the page edges for you; drag the corners to adjust.' },
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
  return (
    <>
      <PageHeader
        title="Flatbed"
        description="Coming soon — scan documents to PDF on your device: auto-crop, filters and multi-page export. Nothing leaves your phone."
      />
      <ComingSoon />
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {FEATURES.map((feature) => (
          <li key={feature.name} className="rounded-[var(--radius)] border border-[var(--line)] p-4">
            <p className="font-semibold text-[var(--ink)]">{feature.name}</p>
            <p className="text-sm text-[var(--muted)]">{feature.what}</p>
          </li>
        ))}
      </ul>
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

// Placeholder until the features are built. None of them work yet, so it says so plainly.
function ComingSoon() {
  return (
    <p className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] p-4 text-[var(--muted)]">
      Coming soon. Flatbed is in development; the features below aren't available yet.
    </p>
  )
}
