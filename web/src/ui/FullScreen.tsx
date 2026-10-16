import { type ReactNode, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

/**
 * A full-screen, always-dark modal screen (camera, crop, filter). Rendered at
 * the end of <body>, it makes the rest of the page inert (so Tab and screen
 * readers stay inside), stops the page behind it scrolling, and on closing
 * puts focus back where it was.
 */
export function FullScreen({ label, children }: { label: string; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const returnTo = document.activeElement as HTMLElement | null
    const self = root.current
    const others = Array.from(document.body.children).filter(
      (el): el is HTMLElement => el !== self && el instanceof HTMLElement && !el.inert,
    )
    others.forEach((el) => (el.inert = true))
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // If nothing inside takes focus itself, start at the dialog.
    if (self && !self.contains(document.activeElement)) self.focus()
    return () => {
      others.forEach((el) => (el.inert = false))
      document.body.style.overflow = overflow
      if (returnTo?.isConnected) returnTo.focus()
    }
  }, [])

  return createPortal(
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col bg-black text-white outline-none [color-scheme:dark]"
    >
      {children}
    </div>,
    document.body,
  )
}
