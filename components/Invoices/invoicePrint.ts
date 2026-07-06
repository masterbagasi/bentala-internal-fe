import type { Invoice, InvoiceSettings, InvoiceItem } from '@/lib/types'
import { findBank } from '@/lib/banks'

const rp = (n: number) => 'Rp ' + Math.round(n || 0).toLocaleString('id-ID')
const esc = (s: string) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
const nl2br = (s: string) => esc(s).replace(/\n/g, '<br>')
const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'

/** Readable text colour (dark or white) for a coloured badge background. */
function badgeText(hex: string): string {
  const m = (hex || '').replace('#', '')
  if (m.length < 6) return '#ffffff'
  const r = parseInt(m.slice(0, 2), 16), g = parseInt(m.slice(2, 4), 16), b = parseInt(m.slice(4, 6), 16)
  return 0.299 * r + 0.587 * g + 0.114 * b > 165 ? '#14161c' : '#ffffff'
}

// Simple monochrome glyphs (brand-tinted) for footer contact + social links.
const ICON: Record<string, string> = {
  whatsapp: `<svg width="12" height="12" viewBox="0 0 24 24" fill="#25D366"><path d="M12 2a10 10 0 0 0-8.9 14.5L2 22l5.7-1.5A10 10 0 1 0 12 2Zm0 2a8 8 0 1 1-4.1 14.9l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 0 1 12 4Zm-3 4c-.2 0-.5 0-.7.4-.2.4-.8 1-.8 2s.8 2.2 1 2.3c.1.2 1.6 2.6 4 3.5 2 .8 2.4.7 2.8.6.4 0 1.3-.5 1.5-1 .2-.6.2-1 .1-1.1l-.7-.4-1.2-.6c-.2 0-.3-.1-.5.1l-.6.8c-.1.1-.3.2-.5 0l-.7-.3a5 5 0 0 1-1.7-1.7c-.1-.2 0-.4.1-.5l.4-.5c.1-.2 0-.3 0-.5l-.6-1.4c-.1-.4-.3-.3-.5-.3H9Z"/></svg>`,
  email: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4b5563" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>`,
  instagram: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#E1306C" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1.2" fill="#E1306C" stroke="none"/></svg>`,
  tiktok: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#111" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 15.5a3 3 0 1 0 3 3V4c.6 2 2 3.2 4.5 3.4"/></svg>`,
  facebook: `<svg width="12" height="12" viewBox="0 0 24 24" fill="#1877F2"><path d="M13 22v-8h2.7l.4-3H13V9c0-.9.3-1.5 1.6-1.5H16V4.9S15 4.8 14 4.8c-2.2 0-3.7 1.3-3.7 3.8V11H7.6v3h2.7v8H13Z"/></svg>`,
  youtube: `<svg width="12" height="12" viewBox="0 0 24 24" fill="#FF0000"><path d="M23 12s0-3.2-.4-4.7a2.5 2.5 0 0 0-1.7-1.7C19.4 5.2 12 5.2 12 5.2s-7.4 0-8.9.4A2.5 2.5 0 0 0 1.4 7.3C1 8.8 1 12 1 12s0 3.2.4 4.7a2.5 2.5 0 0 0 1.7 1.7c1.5.4 8.9.4 8.9.4s7.4 0 8.9-.4a2.5 2.5 0 0 0 1.7-1.7C23 15.2 23 12 23 12ZM10 15V9l5 3-5 3Z"/></svg>`,
  x: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#111" stroke-width="2.4" stroke-linecap="round"><path d="M4 4l16 16M20 4 4 20"/></svg>`,
  linkedin: `<svg width="12" height="12" viewBox="0 0 24 24" fill="#0A66C2"><path d="M4.98 3.5A2.5 2.5 0 1 0 5 8.5a2.5 2.5 0 0 0 0-5ZM3 9h4v12H3V9Zm7 0h3.8v1.7h.05c.53-1 1.8-2 3.7-2 4 0 4.7 2.6 4.7 6V21h-4v-5.3c0-1.3 0-2.9-1.8-2.9s-2 1.4-2 2.8V21h-4V9Z"/></svg>`,
  threads: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#111" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3.5"/><path d="M15.5 12v.8a3 3 0 0 0 3 3 4.2 4.2 0 1 0-3.4-6.6"/></svg>`,
  website: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#4b5563" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>`,
}

/** Line items, falling back to a single row from the legacy flat value so old
 *  invoices (created before line items) still print a sensible body. */
function itemsOf(inv: Invoice): InvoiceItem[] {
  if (inv.items && inv.items.length) return inv.items
  return [{ desc: inv.project || 'Layanan', qty: 1, price: inv.value || 0 }]
}

/**
 * Render the invoice HTML to a PDF file and download it directly — no print
 * dialog. The document is rendered in an off-screen iframe (so its global CSS
 * never leaks into the app), rasterised with html2canvas and paged into jsPDF.
 * Libraries are code-split via dynamic import so they never bloat the bundle.
 */
async function renderInvoicePdf(html: string, filename: string) {
  const [{ jsPDF }, h2c] = await Promise.all([import('jspdf'), import('html2canvas')])
  const html2canvas = h2c.default
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = 'position:fixed;left:-99999px;top:0;width:900px;height:1400px;border:0;'
  document.body.appendChild(iframe)
  try {
    const idoc = iframe.contentDocument || iframe.contentWindow!.document
    idoc.open(); idoc.write(html); idoc.close()
    await new Promise<void>((res) => {
      if (idoc.readyState === 'complete') res()
      else iframe.contentWindow!.addEventListener('load', () => res(), { once: true })
    })
    await new Promise((r) => setTimeout(r, 300)) // let the (data-URI) logo paint
    const el = idoc.querySelector('.sheet') as HTMLElement
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true, windowWidth: 900 })
    const img = canvas.toDataURL('image/jpeg', 0.95)
    const pdf = new jsPDF('p', 'pt', 'a4')
    const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight()
    const imgH = (canvas.height * pw) / canvas.width
    let pos = 0, left = imgH
    pdf.addImage(img, 'JPEG', 0, pos, pw, imgH); left -= ph
    while (left > 1) { pos -= ph; pdf.addPage(); pdf.addImage(img, 'JPEG', 0, pos, pw, imgH); left -= ph }
    pdf.save(filename + '.pdf')
  } finally {
    document.body.removeChild(iframe)
  }
}

/**
 * Open a print-optimised invoice in a new window. Preview only — the user prints
 * (→ "Save as PDF") via the toolbar button, never automatically.
 */
export function openInvoicePrint(
  inv: Invoice,
  settings: InvoiceSettings | null,
  logoUrl: string | null,
  bankLogoUrl: string | null = null,
  billTo: { name?: string; phone?: string; address?: string; pic?: string } | null = null,
  win: Window | null = null,
) {
  const items = itemsOf(inv)
  const total = items.reduce((n, it) => n + (it.qty || 0) * (it.price || 0), 0)
  const s = settings
  const companyName = esc(s?.company_name || 'PT Bentala Project Indonesia')

  const rows = items
    .map(
      (it, i) => `<tr>
        <td class="c faint mono">${String(i + 1).padStart(2, '0')}</td>
        <td class="desc">${esc(it.desc || '—')}</td>
        <td class="c">${it.qty || 0}</td>
        <td class="r">${rp(it.price)}</td>
        <td class="r bold">${rp((it.qty || 0) * (it.price || 0))}</td>
      </tr>`,
    )
    .join('')

  // Transfer / bank block (logo file if present, else brand-coloured badge).
  const bank = findBank(s?.bank_name)
  const bankColor = bank?.color || '#334155'
  const bankMark = bankLogoUrl
    ? `<img class="banklogo" src="${esc(bankLogoUrl)}" alt="${esc(s?.bank_name || '')}">`
    : (s?.bank_name ? `<span class="bankbadge" style="background:${bankColor};color:${badgeText(bankColor)}">${esc(s.bank_name)}</span>` : '')
  const payment =
    s && (s.bank_name || s.bank_account || s.bank_holder)
      ? `<div class="lo-col">
          <div class="eyebrow">Transfer To</div>
          ${bankMark}
          ${s.bank_account ? `<div class="acct">${esc(s.bank_account)}</div>` : ''}
          ${s.bank_holder ? `<div class="muted sm">${esc(s.bank_holder)}</div>` : ''}
        </div>`
      : ''

  const notesBlocks = [
    s && s.terms ? `<div class="eyebrow">Terms</div><div class="lo-body">${nl2br(s.terms)}</div>` : '',
    inv.notes ? `<div class="eyebrow" style="margin-top:14px">Notes</div><div class="lo-body">${nl2br(inv.notes)}</div>` : '',
  ].join('')
  const notesCol = notesBlocks ? `<div class="lo-col">${notesBlocks}</div>` : ''
  const lowerRow = (payment || notesCol)
    ? `<div class="lower">${payment || '<div></div>'}${notesCol || '<div></div>'}</div>`
    : ''

  // Footer band — address / contact / social, centred as one group.
  const links = (s?.social_links ?? []).filter((l) => l.value && l.value.trim())
  const footCols = [
    s?.address ? `<div class="pf-col"><div class="pf-h">Address</div><div class="pf-b">${nl2br(s.address)}</div></div>` : '',
    (s && (s.phone || s.email))
      ? `<div class="pf-col"><div class="pf-h">Contact</div>
          ${s.phone ? `<div class="pf-line">${ICON.whatsapp}<span>${esc(s.phone)}</span></div>` : ''}
          ${s.email ? `<div class="pf-line">${ICON.email}<span>${esc(s.email)}</span></div>` : ''}
        </div>`
      : '',
    links.length
      ? `<div class="pf-col"><div class="pf-h">Social</div>
          ${links.map((l) => `<div class="pf-line">${ICON[l.platform] || ICON.website}<span>${esc(l.value)}</span></div>`).join('')}
        </div>`
      : '',
  ].filter(Boolean).join('')

  const billLines = [
    inv.project ? `<div class="bt-proj">${esc(inv.project)}</div>` : '',
    billTo?.address ? `<div class="bt-line">${esc(billTo.address)}</div>` : '',
    billTo?.phone ? `<div class="bt-line">${esc(billTo.phone)}</div>` : '',
  ].join('')

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(inv.num)}</title>
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #14161c; background: #e9ebef; font-size: 13px; line-height: 1.55; }
  .mono { font-family: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, monospace; }
  .muted { color: #55606e; }
  .faint { color: #9aa1ad; }
  .sm { font-size: 12px; }
  .eyebrow { font-size: 10px; text-transform: uppercase; letter-spacing: 1.4px; font-weight: 700; color: #2563eb; margin-bottom: 9px; }

  /* Screen toolbar — never printed */
  .toolbar { position: sticky; top: 0; z-index: 10; display: flex; gap: 8px; justify-content: center; padding: 12px; background: #14161c; }
  .toolbar button { font-family: inherit; font-size: 13px; font-weight: 600; padding: 9px 18px; border-radius: 8px; border: none; cursor: pointer; }
  .toolbar .print { background: #2563eb; color: #fff; }
  .toolbar .outline { background: transparent; color: #e9ebef; border: 1px solid #4a4d56; }
  .toolbar .ghost { background: #3a3d46; color: #e9ebef; }

  .sheet { max-width: 820px; margin: 24px auto; background: #fff; box-shadow: 0 10px 44px rgba(0,0,0,0.14); }
  .page { padding: 48px 52px 40px; }

  /* Header — logo and INVOICE block share one height, tops and bottoms level */
  .head { display: flex; justify-content: space-between; align-items: stretch; gap: 24px; min-height: 58px; }
  .brand { display: flex; align-items: center; }
  .brand img { max-height: 58px; max-width: 240px; object-fit: contain; display: block; }
  .brand .name { font-size: 20px; font-weight: 800; }
  .brand .name-fallback { display: none; font-size: 20px; font-weight: 800; }
  .title { display: flex; flex-direction: column; justify-content: space-between; align-items: flex-end; text-align: right; flex-shrink: 0; }
  .title h1 { margin: 0; font-size: 26px; font-weight: 800; letter-spacing: 5px; line-height: 1; }
  .title .numpill { display: inline-block; font-size: 12.5px; font-weight: 700; letter-spacing: 0.5px; color: #2563eb; background: #eaf0ff; border: 1px solid #d6e2ff; border-radius: 8px; padding: 5px 12px; }

  .rule { height: 3px; background: #14161c; margin: 24px 0 0; position: relative; }
  .rule::before { content: ''; position: absolute; left: 0; top: 0; height: 3px; width: 60px; background: #2563eb; }

  /* Parties — Billed To (left) beside From (right-aligned) */
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 26px; align-items: start; }
  .from { text-align: right; }
  .bt-name { font-size: 19px; font-weight: 800; letter-spacing: -0.015em; margin-top: 2px; }
  .bt-proj { font-size: 13px; font-weight: 500; color: #14161c; margin-top: 4px; }
  .bt-line { font-size: 12.5px; color: #55606e; margin-top: 2px; }
  .from-name { font-size: 16px; font-weight: 700; letter-spacing: -0.01em; margin-top: 2px; }
  .from-line { font-size: 12.5px; color: #55606e; margin-top: 3px; line-height: 1.5; }

  /* Items */
  .items-wrap { margin-top: 24px; border: 1px solid #e6e8ec; border-radius: 12px; overflow: hidden; }
  table.items { width: 100%; border-collapse: collapse; }
  table.items thead th { background: #14161c; color: #fff; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 600; padding: 11px 14px; }
  table.items td { padding: 13px 14px; border-bottom: 1px solid #eef0f3; vertical-align: top; }
  table.items tbody tr:last-child td { border-bottom: none; }
  table.items tbody tr:nth-child(even) td { background: #fafbfc; }
  table.items td.desc { font-weight: 500; }
  table.items td.c, table.items th.c { text-align: center; }
  table.items td.r, table.items th.r { text-align: right; white-space: nowrap; }
  table.items td.bold { font-weight: 700; }

  /* Totals */
  .totalwrap { display: flex; justify-content: flex-end; margin-top: 18px; }
  .totalbox { width: 320px; }
  .totalbox .line { display: flex; justify-content: space-between; padding: 7px 6px; font-size: 13px; }
  .totalbox .grand { margin-top: 8px; padding: 15px 20px; border-radius: 12px; background: #14161c; color: #fff; display: flex; justify-content: space-between; align-items: baseline; }
  .totalbox .grand .lab { font-size: 12px; letter-spacing: 1.2px; text-transform: uppercase; color: #b9bec8; }
  .totalbox .grand .amt { font-size: 23px; font-weight: 800; color: #8ab0ff; }

  /* Payment + notes */
  .lower { display: grid; grid-template-columns: 1fr 1fr; gap: 34px; margin-top: 34px; padding-top: 24px; border-top: 1px solid #e6e8ec; }
  .lo-body { font-size: 12.5px; color: #4b5563; line-height: 1.55; }
  .banklogo { max-height: 32px; max-width: 160px; object-fit: contain; display: block; margin-bottom: 8px; }
  .bankbadge { display: inline-block; padding: 6px 13px; border-radius: 8px; font-weight: 700; font-size: 14px; margin-bottom: 8px; }
  .acct { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 700; font-size: 16px; letter-spacing: 0.5px; }

  /* Footer band */
  .thanks { text-align: center; color: #55606e; font-size: 12.5px; margin-top: 44px; }
  .pagefoot { margin-top: 16px; padding-top: 20px; border-top: 1px solid #d7dbe2; }
  .pf-grid { display: flex; flex-wrap: nowrap; justify-content: center; align-items: flex-start; gap: 44px; text-align: left; }
  .pf-col { flex: 0 1 auto; min-width: 0; max-width: 230px; }
  .pf-h { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #9aa1ad; margin-bottom: 7px; }
  .pf-b { font-size: 12px; color: #4b5563; line-height: 1.55; }
  .pf-line { display: flex; justify-content: flex-start; align-items: center; gap: 7px; font-size: 12px; color: #4b5563; line-height: 1.5; margin-bottom: 4px; }
  .pf-line svg { flex-shrink: 0; }
  .pf-line span { word-break: break-word; }

  @media print {
    body { background: #fff; }
    .toolbar { display: none !important; }
    .sheet { margin: 0; max-width: none; box-shadow: none; }
    .page { padding: 0; }
    @page { margin: 14mm; }
  }
</style></head>
<body>
  <div class="toolbar">
    <button class="ghost" onclick="window.close()">Close</button>
    <button class="outline" onclick="window.print()">Print</button>
    <button class="print" id="saveBtn" onclick="window.__save && window.__save()">Save PDF</button>
  </div>

  <div class="sheet"><div class="page">
    <div class="head">
      <div class="brand">
        ${logoUrl ? `<img id="inv-logo" src="${esc(logoUrl)}" alt="${companyName}"><div class="name-fallback">${companyName}</div>` : `<div class="name">${companyName}</div>`}
      </div>
      <div class="title">
        <h1>INVOICE</h1>
        <span class="numpill mono">${esc(inv.num)}</span>
      </div>
    </div>
    <div class="rule"></div>

    <div class="parties">
      <div class="billed">
        <div class="eyebrow">Billed To</div>
        <div class="bt-name">${esc(billTo?.name || inv.client || '—')}</div>
        ${billLines}
      </div>
      <div class="from">
        <div class="eyebrow">From</div>
        <div class="from-name">${companyName}</div>
      </div>
    </div>

    <div class="items-wrap">
      <table class="items">
        <thead><tr><th class="c" style="width:42px">#</th><th>Description</th><th class="c" style="width:56px">Qty</th><th class="r" style="width:140px">Unit Price</th><th class="r" style="width:150px">Amount</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <div class="totalwrap"><div class="totalbox">
      <div class="line"><span class="muted">Subtotal</span><span>${rp(total)}</span></div>
      <div class="grand"><span class="lab">Total Due</span><span class="amt">${rp(total)}</span></div>
    </div></div>

    ${lowerRow}

    <div class="thanks">Thank you for your business</div>
    ${footCols ? `<div class="pagefoot"><div class="pf-grid">${footCols}</div></div>` : ''}
  </div></div>

  <script>
    // Preview only. "Save PDF" is handled by the opener (bundled jsPDF, no print
    // dialog). Fall back to the company name if the logo fails to load.
    (function () {
      var img = document.getElementById('inv-logo');
      if (img) img.addEventListener('error', function () {
        img.style.display = 'none';
        var fb = document.querySelector('.name-fallback'); if (fb) fb.style.display = 'block';
      });
    })();
  </script>
</body></html>`

  // Use the window the caller opened during the click (keeps the user gesture so
  // the browser doesn't block it); otherwise open one here as a fallback.
  const w = win ?? window.open('', '_blank', 'width=900,height=1040')
  if (!w) { alert('Pop-up blocked. Please allow pop-ups to open the invoice.'); return }
  w.document.open()
  w.document.write(html)
  w.document.close()

  // The popup's "Save PDF" button calls back into this (opener) realm so it can
  // use the app's bundled jsPDF and download the file — no print dialog.
  ;(w as unknown as { __save?: () => void }).__save = async () => {
    const btn = w.document.getElementById('saveBtn') as HTMLButtonElement | null
    if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan…' }
    try { await renderInvoicePdf(html, inv.num || 'invoice') }
    catch (e) { alert('Gagal membuat PDF: ' + e) }
    finally { if (btn) { btn.disabled = false; btn.textContent = 'Save PDF' } }
  }
}
