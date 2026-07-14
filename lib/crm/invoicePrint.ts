import type { CrmInvoice, CrmInvoiceItem, Contact } from '@/lib/types'
import { invoiceTotals, TAX_RATE } from './schema'

const rp = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID')
const esc = (s: string) => (s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string))

/** Open a printable invoice in a new window (browser "Save as PDF"). */
export function printCrmInvoice(inv: CrmInvoice, items: CrmInvoiceItem[], contact?: Contact | null) {
  const lines = items.slice().sort((a, b) => a.sort_order - b.sort_order)
  const { subtotal, tax, total } = invoiceTotals(lines, inv.discount, inv.tax_enabled)
  const rows = lines.map(i => `<tr>
      <td>${esc(i.description)}</td>
      <td class="r">${i.qty}</td>
      <td class="r">${rp(i.unit_price)}</td>
      <td class="r">${rp(i.qty * i.unit_price)}</td></tr>`).join('')
  const to = contact ? `${esc(contact.company_name || contact.name)}${contact.company_name ? `<br/><span class="mut">${esc(contact.name)}</span>` : ''}${contact.address ? `<br/><span class="mut">${esc(contact.address)}</span>` : ''}${contact.phone ? `<br/><span class="mut">${esc(contact.phone)}</span>` : ''}` : '—'
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(inv.number || 'Invoice')}</title>
    <style>
      *{box-sizing:border-box} body{font-family:system-ui,Arial,sans-serif;color:#111;margin:0;padding:40px;font-size:13px}
      h1{font-size:24px;margin:0 0 2px} .mut{color:#777;font-size:12px}
      .head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px}
      .box{margin-bottom:20px} .lbl{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#999;margin-bottom:4px}
      table{width:100%;border-collapse:collapse;margin-top:8px} th,td{padding:9px 10px;text-align:left;border-bottom:1px solid #e5e5e5}
      th{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#888;background:#fafafa} .r{text-align:right}
      .tot{margin-top:14px;margin-left:auto;width:260px} .tot .row{display:flex;justify-content:space-between;padding:5px 0;font-size:13px}
      .tot .grand{border-top:2px solid #111;margin-top:6px;padding-top:8px;font-size:16px;font-weight:700}
      @media print{body{padding:0}}
    </style></head><body>
    <div class="head">
      <div><h1>INVOICE</h1><div class="mut">${esc(inv.number || '')}</div></div>
      <div style="text-align:right">
        <div class="mut">Tanggal: ${inv.invoice_date}</div>
        <div class="mut">Jatuh tempo: ${inv.due_date || '—'}</div>
        <div class="mut">Status: ${inv.status}</div>
      </div>
    </div>
    <div class="box"><div class="lbl">Ditagihkan kepada</div>${to}</div>
    <table><thead><tr><th>Deskripsi</th><th class="r">Qty</th><th class="r">Harga</th><th class="r">Subtotal</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="tot">
      <div class="row"><span>Subtotal</span><span>${rp(subtotal)}</span></div>
      ${inv.discount ? `<div class="row"><span>Diskon</span><span>-${rp(inv.discount)}</span></div>` : ''}
      ${inv.tax_enabled ? `<div class="row"><span>PPN ${Math.round(TAX_RATE * 100)}%</span><span>${rp(tax)}</span></div>` : ''}
      <div class="row grand"><span>Total</span><span>${rp(total)}</span></div>
    </div>
    ${inv.bank_account ? `<div class="box" style="margin-top:24px"><div class="lbl">Pembayaran</div>${esc(inv.bank_account)}</div>` : ''}
    ${inv.notes ? `<div class="box"><div class="lbl">Catatan</div>${esc(inv.notes)}</div>` : ''}
    <script>window.onload=function(){window.print()}</script>
    </body></html>`
  const w = window.open('', '_blank')
  if (w) { w.document.write(html); w.document.close() }
}
