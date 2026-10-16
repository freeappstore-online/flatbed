type ShareNavigator = {
  canShare?: (data: ShareData) => boolean
  share?: (data: ShareData) => Promise<void>
}

/** Whether this browser can share files (to Files, mail, chat and so on). */
export function canShareFiles(nav: ShareNavigator = navigator): boolean {
  try {
    return !!nav.share && !!nav.canShare?.({ files: [new File([''], 'test.pdf', { type: 'application/pdf' })] })
  } catch {
    return false
  }
}

/**
 * Hands the PDF over: the share sheet where the browser can share files,
 * otherwise a download. Never uploads anything.
 */
export async function deliver(
  pdf: Blob,
  name: string,
  {
    nav = navigator,
    download = downloadBlob,
  }: { nav?: ShareNavigator; download?: (blob: Blob, name: string) => void } = {},
): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([pdf], name, { type: 'application/pdf' })
  if (canShareFiles(nav) && nav.canShare!({ files: [file] })) {
    try {
      await nav.share!({ files: [file], title: name })
      return 'shared'
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return 'cancelled'
      // Sharing failed for another reason (e.g. no gesture); fall back to downloading.
    }
  }
  download(pdf, name)
  return 'downloaded'
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  // Revoke later: some browsers start the download after click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
