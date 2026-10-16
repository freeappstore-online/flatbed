/** What Flatbed keeps, where, and what the store's analytics see. Shown on About. */
export function PrivacyNote() {
  return (
    <section
      aria-labelledby="privacy-heading"
      className="mt-6 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] p-4"
    >
      <h2 id="privacy-heading" className="font-semibold text-[var(--ink)]">
        Privacy: your scans stay on this device
      </h2>
      <ul className="mt-2 grid list-disc gap-2 pl-5 text-sm text-[var(--muted)]">
        <li>
          Photos, cropped pages and PDFs are made on this device. Images and PDFs never leave it: nothing is
          uploaded, and there's no server-side processing. A PDF goes only where you share or save it.
        </li>
        <li>
          Saved scans (their pages and names) are stored only in this browser, in its IndexedDB storage. Deleting a
          scan removes it; clearing this site's data in your browser removes them all. No account is needed.
        </li>
        <li>
          Page-view counts: the app loads FreeAppStore's store analytics script, which records which screen you
          opened (for example /about), the page that linked here, and the time. It's sent to FreeAppStore without
          cookies and without your account. Your scans, their pages and their names are never included.
        </li>
        <li>
          Flatbed is served via FreeAppStore, which also loads Cloudflare Web Analytics (beacon.min.js from
          static.cloudflareinsights.com). It doesn't use cookies and reports only aggregate page-view statistics,
          such as page load times and visit counts. As with any website, the servers handling these requests see
          your IP address and browser type.
        </li>
      </ul>
    </section>
  )
}
