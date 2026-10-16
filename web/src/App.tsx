import { useEffect, useState } from 'react'
import { initApp } from '@freeappstore/sdk'
import { BuildInfo, type NavItem, PageHeader, Shell } from '@freeappstore/sdk/ui'
import { PrivacyNote } from './Privacy'
import { Library } from './library/Library'
import { ScanView } from './library/ScanView'
import { scans } from './library/scans'

const fas = initApp({ appId: 'flatbed' })

// The app's screens. Shell renders them as its navbar (<nav aria-label="Main">,
// current screen highlighted, a menu on phones). `title` becomes the browser
// tab title on that route.
const NAV: NavItem[] = [
  { label: 'Scans', href: '/', title: 'Flatbed' },
  { label: 'About', href: '/about', title: 'About — Flatbed' },
]

// What Flatbed does (freeappstore-online/platform#238).
const FEATURES = [
  { name: 'Capture', what: 'Shoot pages with your camera, one or many, or import photos.' },
  { name: 'Auto-crop', what: 'Finds the page edges for you; drag the corners, straighten and rotate.' },
  { name: 'Filters', what: 'Original, greyscale, black & white or magic colour.' },
  { name: 'PDF export', what: 'A multi-page PDF in A4, Letter or fit, to share or download.' },
  { name: 'Your scans', what: 'Rename, reorder pages, delete and export again any time.' },
  { name: 'Private', what: 'Images and PDFs are made on your device and never leave it.' },
]

/** Where the app is: the path, plus the open scan's id kept in history state (never in the URL). */
type Route = { path: string; scan?: string; edit?: string[] }

const current = (): Route => ({ path: window.location.pathname, scan: window.history.state?.scan })

export default function App() {
  const [route, setRoute] = useState(current)

  // Keep the screen in step with the browser's back and forward buttons.
  useEffect(() => {
    const sync = () => setRoute(current())
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  // Nav clicks switch screens without a page load. Shell scrolls to the top
  // and moves focus to the new screen's PageHeader. A scan's id stays out of
  // the address (which the store's page-view counts record).
  const navigate = (href: string, scan?: string, edit?: string[]) => {
    window.history.pushState(scan ? { scan } : null, '', href)
    setRoute({ path: href, scan, edit })
  }

  let screen
  if (route.path === '/about') screen = <About />
  else if (route.path === '/scan' && route.scan)
    screen = (
      <ScanView key={route.scan} store={scans} scanId={route.scan} edit={route.edit} onClose={() => navigate('/')} />
    )
  else
    screen = (
      <Library store={scans} onOpen={(id, edit) => navigate('/scan', id, edit)} onPrivacy={() => navigate('/about')} />
    )

  return (
    <Shell app={fas} appName="Flatbed" nav={NAV} onNavigate={(href) => navigate(href)}>
      <div className="mx-auto w-full max-w-3xl p-4 sm:p-8 short:py-3">{screen}</div>
      <BuildInfo />
    </Shell>
  )
}

function About() {
  return (
    <>
      <PageHeader title="About" />
      <p className="text-[var(--muted)]">
        Flatbed turns your phone's camera into a document scanner: capture pages, crop and straighten them, clean
        them up and save them as a PDF. Everything happens on your device; your images and PDFs are never uploaded.
        No account, no ads, no subscription.
      </p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {FEATURES.map((feature) => (
          <li key={feature.name} className="rounded-[var(--radius)] border border-[var(--line)] p-4">
            <p className="font-semibold text-[var(--ink)]">{feature.name}</p>
            <p className="text-sm text-[var(--muted)]">{feature.what}</p>
          </li>
        ))}
      </ul>
      <PrivacyNote />
      <p className="mt-6 text-[var(--muted)]">
        Flatbed is a free, MIT-licensed app on{' '}
        <a href="https://freeappstore.online" className="underline">
          FreeAppStore
        </a>
        . PDFs are made with pdf-lib (MIT) and scans are stored with idb (ISC).{' '}
        <a href="/third-party-licenses.txt" className="underline">
          Third-party licences
        </a>
      </p>
    </>
  )
}
