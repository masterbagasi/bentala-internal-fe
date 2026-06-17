// Download a file WITHOUT navigating away / opening a new tab. Fetches the
// bytes as a blob and clicks a synthetic <a download>, so the user stays on
// the current page (important on mobile, where target=_blank swaps tabs and
// a direct link triggers the OS "View / Download" sheet).
// Falls back to opening the URL only if the fetch is blocked (e.g. a CORS-
// restricted external link like Google Drive, which can't be blob-fetched).
export async function downloadFileNoNav(url: string, filename: string): Promise<void> {
  try {
    const res = await fetch(url, { credentials: 'omit' })
    if (!res.ok) throw new Error(String(res.status))
    const blob = await res.blob()
    const objUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objUrl
    a.download = filename || 'file'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(objUrl), 4000)
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}
