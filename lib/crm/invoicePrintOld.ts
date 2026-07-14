import type { CrmInvoice, CrmInvoiceItem, Contact, InvoiceSettings } from '@/lib/types'
import { invoiceTotals, TAX_RATE } from './schema'
import { findBank } from '@/lib/banks'

const rp = (n: number) => 'Rp ' + Math.round(n || 0).toLocaleString('id-ID')
const esc = (s: string) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
const nl2br = (s: string) => esc(s).replace(/\n/g, '<br>')

/** Readable text colour (dark or white) for a coloured badge background. */
function badgeText(hex: string): string {
  const m = (hex || '').replace('#', '')
  if (m.length < 6) return '#ffffff'
  const r = parseInt(m.slice(0, 2), 16), g = parseInt(m.slice(2, 4), 16), b = parseInt(m.slice(4, 6), 16)
  return 0.299 * r + 0.587 * g + 0.114 * b > 165 ? '#14161c' : '#ffffff'
}

// Simple monochrome glyphs for footer contact + social links.
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

/**
 * Open a CRM invoice in the legacy print layout (same template as the old
 * Invoices tab), with correct CRM numbers including discount & PPN. Preview
 * window with a "Download PDF" that renders via jsPDF (no browser header/footer).
 */
export function openCrmInvoicePrint(
  inv: CrmInvoice,
  rawItems: CrmInvoiceItem[],
  contact: Contact | null | undefined,
  projectName: string | null,
  settings: InvoiceSettings | null,
  logoUrl: string | null,
  bankLogos: Record<string, string> = {},
  win: Window | null = null,
) {
  const items = rawItems.slice().sort((a, b) => a.sort_order - b.sort_order)
  const { subtotal, tax, total } = invoiceTotals(items, inv.discount, inv.tax_enabled)
  const s = settings
  const companyName = esc(s?.company_name || 'PT Bentala Project Indonesia')

  const rows = items
    .map(
      (it, i) => `<tr>
        <td class="c faint mono">${String(i + 1).padStart(2, '0')}</td>
        <td class="desc">${esc(it.description || '—')}</td>
        <td class="c">${it.qty || 0}</td>
        <td class="r">${rp(it.unit_price)}</td>
        <td class="r bold">${rp((it.qty || 0) * (it.unit_price || 0))}</td>
      </tr>`,
    )
    .join('')

  // Bank accounts: prefer the multi-account list; else the legacy single bank;
  // else the invoice's own bank line. All accounts are printed.
  const accounts = (s?.bank_accounts && s.bank_accounts.length)
    ? s.bank_accounts
    : (s?.bank_name || s?.bank_account
        ? [{ bank_name: s?.bank_name || '', bank_account: s?.bank_account || '', bank_holder: s?.bank_holder || '' }]
        : (inv.bank_account ? [{ bank_name: '', bank_account: inv.bank_account, bank_holder: '' }] : []))
  const acctHtml = accounts.map((a) => {
    const bank = findBank(a.bank_name)
    const logo = bank?.slug ? bankLogos[bank.slug] : undefined
    const color = bank?.color || '#334155'
    // Real logo file (data URI) when provided, else a clean brand-colour badge.
    const mark = logo
      ? `<img class="banklogo" src="${esc(logo)}" alt="${esc(a.bank_name)}">`
      : (a.bank_name ? `<span class="bankbadge" style="background:${color};color:${badgeText(color)}">${esc(a.bank_name)}</span>` : '')
    return `<div class="bankitem">${mark}${a.bank_account ? `<div class="acct">${esc(a.bank_account)}</div>` : ''}${a.bank_holder ? `<div class="muted sm">${esc(a.bank_holder)}</div>` : ''}</div>`
  }).join('')
  const payment = acctHtml
    ? `<div class="lo-col"><div class="eyebrow">Transfer To</div>${acctHtml}</div>`
    : ''

  const notesBlocks = [
    s && s.terms ? `<div class="eyebrow">Terms</div><div class="lo-body">${nl2br(s.terms)}</div>` : '',
    inv.notes ? `<div class="eyebrow" style="margin-top:14px">Notes</div><div class="lo-body">${nl2br(inv.notes)}</div>` : '',
  ].join('')
  const notesCol = notesBlocks ? `<div class="lo-col">${notesBlocks}</div>` : ''
  const lowerRow = (payment || notesCol)
    ? `<div class="lower">${payment || '<div></div>'}${notesCol || '<div></div>'}</div>`
    : ''

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

  const billName = contact ? (contact.company_name || contact.name) : (inv.contact_id ? '' : '—')
  // Download filename: "<Brand/Company> - <Invoice No>", sanitised for the OS.
  const brand = contact ? (contact.company_name || contact.name || '') : ''
  const fileName = [brand, inv.number].filter(Boolean).join(' - ').replace(/[\\/:*?"<>|]/g, '').trim() || (inv.number || 'invoice')
  const billLines = [
    contact?.address ? `<div class="bt-line">${esc(contact.address)}</div>` : '',
    contact?.phone ? `<div class="bt-line">${esc(contact.phone)}</div>` : '',
  ].join('')

  const dateRow = [
    inv.invoice_date ? `<div class="bt-line">Date: ${esc(new Date(inv.invoice_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }))}</div>` : '',
    inv.due_date ? `<div class="bt-line">Due Date: ${esc(new Date(inv.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }))}</div>` : '',
  ].join('')

  // The grand figure is the OUTSTANDING balance (total − already paid), so the
  // PDF reflects what the client still owes rather than the full total.
  const paid = Math.max(0, Math.round(inv.paid_amount || 0))
  const due = Math.max(0, Math.round(total - paid))
  const totalsLines = [
    `<div class="line"><span class="muted">Subtotal</span><span>${rp(subtotal)}</span></div>`,
    inv.discount > 0 ? `<div class="line"><span class="muted">Discount</span><span>-${rp(inv.discount)}</span></div>` : '',
    inv.tax_enabled ? `<div class="line"><span class="muted">VAT ${Math.round(TAX_RATE * 100)}%</span><span>${rp(tax)}</span></div>` : '',
    paid > 0 ? `<div class="line"><span class="muted">Total</span><span>${rp(total)}</span></div>` : '',
    paid > 0 ? `<div class="line"><span class="muted">Paid</span><span>-${rp(paid)}</span></div>` : '',
  ].join('')

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(fileName)}</title>
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #14161c; background: #e9ebef; font-size: 13px; line-height: 1.55; }
  .mono { font-family: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, monospace; }
  .muted { color: #55606e; }
  .faint { color: #9aa1ad; }
  .sm { font-size: 12px; }
  .eyebrow { font-size: 10px; text-transform: uppercase; letter-spacing: 1.4px; font-weight: 700; color: #2563eb; margin-bottom: 9px; }

  .toolbar { position: sticky; top: 0; z-index: 10; display: flex; gap: 12px; align-items: center; justify-content: flex-end; padding: 12px 16px; background: #14161c; }
  .toolbar .hint { margin-right: auto; font-size: 12px; color: #9aa1ad; max-width: 60%; }
  .toolbar button { font-family: inherit; font-size: 13px; font-weight: 600; padding: 9px 18px; border-radius: 8px; border: none; cursor: pointer; }
  .toolbar .print { background: #2563eb; color: #fff; }
  .toolbar .outline { background: transparent; color: #e9ebef; border: 1px solid #4a4d56; }
  .toolbar .ghost { background: #3a3d46; color: #e9ebef; }

  /* Sheet is exactly A4 width so the on-screen preview and the printed page share
     the same layout (identical wrapping) — what you see is what downloads. */
  .sheet { width: 210mm; max-width: 210mm; margin: 20px auto; background: #fff; box-shadow: 0 10px 44px rgba(0,0,0,0.14); }
  .page { padding: 15mm 14mm; }

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

  .parties { display: flex; justify-content: space-between; gap: 40px; margin-top: 26px; align-items: flex-start; }
  .parties > div { flex: 1 1 0; min-width: 0; }
  .from { text-align: right; }
  .bt-name { font-size: 19px; font-weight: 800; letter-spacing: -0.015em; margin-top: 2px; }
  .bt-proj { font-size: 13px; font-weight: 500; color: #14161c; margin-top: 4px; }
  .bt-line { font-size: 12.5px; color: #55606e; margin-top: 2px; }
  .from-name { font-size: 16px; font-weight: 700; letter-spacing: -0.01em; margin-top: 2px; }

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

  .totalwrap { display: flex; justify-content: flex-end; margin-top: 18px; }
  .totalbox { width: 320px; }
  .totalbox .line { display: flex; justify-content: space-between; padding: 7px 6px; font-size: 13px; }
  .totalbox .grand { margin-top: 8px; padding: 15px 20px; border-radius: 12px; background: #14161c; color: #fff; display: flex; justify-content: space-between; align-items: baseline; }
  .totalbox .grand .lab { font-size: 12px; letter-spacing: 1.2px; text-transform: uppercase; color: #b9bec8; }
  .totalbox .grand .amt { font-size: 23px; font-weight: 800; color: #8ab0ff; }

  .lower { display: flex; gap: 34px; margin-top: 34px; padding-top: 24px; border-top: 1px solid #e6e8ec; }
  .lower > div { flex: 1 1 0; min-width: 0; }
  .lo-body { font-size: 12.5px; color: #4b5563; line-height: 1.55; }
  .bankitem { margin-bottom: 16px; }
  .bankitem:last-child { margin-bottom: 0; }
  .banklogo { max-height: 32px; max-width: 160px; object-fit: contain; display: block; margin-bottom: 8px; }
  .bankbadge { display: inline-block; padding: 6px 13px; border-radius: 8px; font-weight: 700; font-size: 14px; margin-bottom: 8px; }
  .acct { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 700; font-size: 16px; letter-spacing: 0.5px; }

  .thanks { text-align: center; color: #55606e; font-size: 12.5px; margin-top: 44px; }
  .pagefoot { margin-top: 16px; padding-top: 20px; border-top: 1px solid #d7dbe2; }
  .pf-grid { display: flex; flex-wrap: nowrap; justify-content: space-between; align-items: flex-start; gap: 22px; text-align: left; }
  .pf-col { flex: 0 1 auto; min-width: 0; max-width: 230px; }
  .pf-h { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #9aa1ad; margin-bottom: 7px; }
  .pf-b { font-size: 12px; color: #4b5563; line-height: 1.55; }
  .pf-line { display: flex; justify-content: flex-start; align-items: center; gap: 7px; font-size: 12px; color: #4b5563; line-height: 1.5; margin-bottom: 4px; }
  .pf-line svg { flex-shrink: 0; }
  .pf-line span { white-space: nowrap; }

  /* Top-level @page (not nested in @media print) so browsers reliably apply it:
     margin 0 leaves no room for the browser's own header/footer (URL, date, page
     number), so they never print. */
  @page { size: A4; margin: 0; }

  @media print {
    /* Only strip the on-screen chrome — the invoice layout is untouched so the
       printed page is identical to the preview. */
    body { background: #fff; }
    .toolbar { display: none !important; }
    .sheet { margin: 0; box-shadow: none; }
    .items-wrap, .totalwrap, .lower, .pagefoot { page-break-inside: avoid; break-inside: avoid; }
  }
</style></head>
<body>
  <div class="toolbar">
    <span class="hint">Klik “Save as PDF / Print”. Di dialog: matikan “Headers and footers” &amp; set Margins → None agar tanpa URL/halaman, lalu Save as PDF.</span>
    <button class="ghost" onclick="window.close()">Close</button>
    <button class="print" onclick="window.print()">Save as PDF / Print</button>
  </div>

  <div class="sheet"><div class="page">
    <div class="head">
      <div class="brand">
        ${logoUrl ? `<img id="inv-logo" src="${esc(logoUrl)}" alt="${companyName}"><div class="name-fallback">${companyName}</div>` : `<div class="name">${companyName}</div>`}
      </div>
      <div class="title">
        <h1>INVOICE</h1>
        <span class="numpill mono">${esc(inv.number || '')}</span>
      </div>
    </div>
    <div class="rule"></div>

    <div class="parties">
      <div class="billed">
        <div class="eyebrow">Billed To</div>
        <div class="bt-name">${esc(billName || '—')}</div>
        ${billLines}
        ${dateRow}
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
      ${totalsLines}
      <div class="grand"><span class="lab">${paid > 0 ? 'Balance Due' : 'Total Due'}</span><span class="amt">${rp(due)}</span></div>
    </div></div>

    ${lowerRow}

    <div class="thanks">Thank you for your business</div>
    ${footCols ? `<div class="pagefoot"><div class="pf-grid">${footCols}</div></div>` : ''}
  </div></div>

  <script>
    (function () {
      var img = document.getElementById('inv-logo');
      if (img) img.addEventListener('error', function () {
        img.style.display = 'none';
        var fb = document.querySelector('.name-fallback'); if (fb) fb.style.display = 'block';
      });
    })();
  </script>
</body></html>`

  const w = win ?? window.open('', '_blank', 'width=900,height=1040')
  if (!w) { alert('Pop-up diblokir. Izinkan pop-up untuk membuka invoice.'); return }
  w.document.open()
  w.document.write(html)
  w.document.close()
  // Uses the browser's own print engine (window.print in this about:blank popup)
  // so the output matches the A4 preview exactly.
}
