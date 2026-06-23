# CRM Lead → Client Conversion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a website lead be converted into a CRM client in one action, with origin tracking (`source`/`lead_id`) and a back-link that blocks double-conversion.

**Architecture:** Three additive columns (`clients.source`, `clients.lead_id`, `bsi_leads.converted_client_id`). The existing `ClientModal` is exported and extended with prefill/source/leadId/onCreated props so the leads page can drive it. On create it returns the new id; the leads page stamps the lead and updates local state. The Client 360 header shows the source.

**Tech Stack:** Next.js (App Router) + React + TypeScript, Zustand, Supabase. No test runner.

## Global Constraints

- **No automated test framework.** Per-task verification = `npx tsc --noEmit` clean + manual/SQL checks. **Never run `npm run build`** while `next dev` runs (corrupts `.next`); use `tsc`.
- **DB schema changes** are committed as `schema_*.sql` in the repo root AND applied to Supabase (`project_id: gbmqudkkuzpqykmyrkqc`) via the MCP `apply_migration`. Migrations here are **additive only**.
- **All work stays local (no `git push`)** until the user asks. Branch: `feat/crm-lead-to-client` (spec already committed there).
- Deal model is **1 client = 1 deal**; do NOT introduce a deals table.
- `source` values: `manual` | `website` | `referral`. Default `manual`.
- Lead→client field mapping: `name←brand_name`, `pic←full_name`, `contact←contact_value`, `notes←[project_type, notes].filter(Boolean).join(' · ')`, `stage←'lead'`, `source←'website'`.
- On conversion the lead is stamped `converted_client_id` AND `status='closed'`.

---

### Task 1: DB migration + types

**Files:**
- Create: `schema_crm_lead_conversion.sql`
- Modify: `lib/database.types.ts` (clients Row), `lib/types.ts` (`Client`), `lib/website-types.ts` (`BsiLead`)
- Apply: live DB via MCP `apply_migration`

**Interfaces:**
- Produces: `clients.source` (text, default 'manual'), `clients.lead_id` (uuid null); `bsi_leads.converted_client_id` (uuid null). App types: `Client.source?`, `Client.lead_id?`, `BsiLead.converted_client_id?`.

- [ ] **Step 1: Write `schema_crm_lead_conversion.sql`**

```sql
-- CRM Lead -> Client conversion: client origin tracking + lead back-link.
alter table public.clients   add column if not exists source text not null default 'manual';
alter table public.clients   add column if not exists lead_id uuid;
alter table public.bsi_leads add column if not exists converted_client_id uuid;
```

- [ ] **Step 2: Apply to the live DB**

MCP `apply_migration`: `project_id: gbmqudkkuzpqykmyrkqc`, `name: crm_lead_conversion`, `query:` the file contents.

- [ ] **Step 3: Verify via SQL**

MCP `execute_sql`:
```sql
select column_name from information_schema.columns
where table_schema='public' and table_name='clients' and column_name in ('source','lead_id')
union all
select column_name from information_schema.columns
where table_schema='public' and table_name='bsi_leads' and column_name='converted_client_id';
```
Expected: three rows (`source`, `lead_id`, `converted_client_id`).

- [ ] **Step 4: Update `lib/database.types.ts`** — in the `clients` table `Row`, add after `notes: string`:

```ts
          source: string
          lead_id: string | null
```
And change the `clients` `Insert` to keep them optional (they have a default / are nullable):
```ts
        Insert: Omit<Database['public']['Tables']['clients']['Row'], 'id' | 'created_at' | 'updated_at' | 'source' | 'lead_id'> & {
          id?: string
          created_at?: string
          updated_at?: string
          source?: string
          lead_id?: string | null
        }
```
(`bsi_leads` is a `GenericTable` — no change needed.)

- [ ] **Step 5: Update `lib/types.ts`** — add to the `Client` interface (after `notes: string`):

```ts
  source?: string
  lead_id?: string | null
```

- [ ] **Step 6: Update `lib/website-types.ts`** — add to the `BsiLead` interface (after `status: ...`):

```ts
  converted_client_id?: string | null
```

- [ ] **Step 7: Typecheck + commit**

```bash
npx tsc --noEmit
git add schema_crm_lead_conversion.sql lib/database.types.ts lib/types.ts lib/website-types.ts
git commit -m "feat(crm): client source/lead_id + bsi_leads.converted_client_id"
```
Expected `tsc`: clean.

---

### Task 2: Export + extend `ClientModal` (source field, conversion props)

**Files:**
- Modify: `components/CRM/index.tsx` (the `ClientModal` component, ~lines 150–241)

**Interfaces:**
- Consumes: `Client`, `ClientStage` (`lib/types`), `SERVICE_OPTIONS`/`STAGE_LABELS` (`lib/constants`), `upsertClient` (store).
- Produces (exported): `ClientModal` with props
  ```ts
  { open: boolean; client: Client | null; onClose: () => void;
    prefill?: Partial<{ name: string; pic: string; contact: string; stage: ClientStage; service: string; notes: string }>;
    source?: string; leadId?: string; onCreated?: (clientId: string) => void }
  ```

- [ ] **Step 1: Export the component + widen its props**

Change `function ClientModal({ open, client, onClose }: { open: boolean; client: Client | null; onClose: () => void })` to:

```tsx
export function ClientModal({ open, client, onClose, prefill, source: sourceProp, leadId, onCreated }: {
  open: boolean
  client: Client | null
  onClose: () => void
  prefill?: Partial<{ name: string; pic: string; contact: string; stage: ClientStage; service: string; notes: string }>
  source?: string
  leadId?: string
  onCreated?: (clientId: string) => void
}) {
```

- [ ] **Step 2: Seed form state from prefill + add `source`**

Replace the `useState({...})` initialiser with:

```tsx
  const [form, setForm] = useState({
    name:     client?.name    || prefill?.name    || '',
    pic:      client?.pic     || prefill?.pic     || '',
    contact:  client?.contact || prefill?.contact || '',
    stage:    client?.stage   || prefill?.stage   || 'lead',
    value:    client?.value?.toString() || '',
    service:  client?.service || prefill?.service || 'smm',
    internal: client?.internal || 'Dandi',
    notes:    client?.notes   || prefill?.notes   || '',
    source:   client?.source  || sourceProp       || 'manual',
  })
```

- [ ] **Step 3: Add `source` to the saved `data` and write `lead_id` + return the id on insert**

In `handleSave`, add `source: form.source` to the `data` object. Then replace the create branch (currently `await supabase.from('clients').insert(data)` + `logActivity(...)`) with one that captures the new row, writes `lead_id`, and notifies:

```tsx
    if (client) {
      await supabase.from('clients').update(data).eq('id', client.id)
      logActivity(`Client diupdate: "${form.name}"`)
      if (client.stage !== form.stage) logStageChange(client.id, client.stage, form.stage)
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: created, error } = await (supabase as any)
        .from('clients').insert({ ...data, lead_id: leadId || null }).select().single()
      if (error) { setLoading(false); alert(t('Gagal menyimpan: ') + error.message); return }
      logActivity(`Client baru: "${form.name}" (${STAGE_LABELS[form.stage]})`)
      if (created?.id) onCreated?.(created.id as string)
    }
```
(The `logStageChange` import already exists in this file from sub-project 1. Keep the existing edit-branch stage-change call.)

- [ ] **Step 4: Add the "Sumber" select to the form**

After the existing PIC Internal `FG` block (the `<FG label={t('PIC Internal')}>...</FG>`), add:

```tsx
        <FG label={t('Sumber')}>
          <select value={form.source} onChange={e => setForm(f=>({...f,source:e.target.value}))}>
            <option value="manual">Manual</option>
            <option value="website">Website</option>
            <option value="referral">Referral</option>
          </select>
        </FG>
```

- [ ] **Step 5: Confirm the in-file caller still compiles**

`CRMPage` renders `<ClientModal open={...} client={editClient} onClose={...} />` — the new props are all optional, so this call is unchanged. Verify it still typechecks.

- [ ] **Step 6: Typecheck + commit**

```bash
npx tsc --noEmit
git add components/CRM/index.tsx
git commit -m "feat(crm): export ClientModal with source field + lead-conversion props"
```
Expected `tsc`: clean.

---

### Task 3: "Jadikan Client" on the leads page

**Files:**
- Modify: `app/(dashboard)/website/leads/page.tsx` (the page component + `LeadCard`)

**Interfaces:**
- Consumes: `ClientModal` (`components/CRM`), `BsiLead.converted_client_id` (Task 1).

- [ ] **Step 1: Import ClientModal, Link, and add conversion state**

At the top of `app/(dashboard)/website/leads/page.tsx` add imports:
```tsx
import Link from 'next/link'
import { ClientModal } from '@/components/CRM'
```
In `LeadsAdminPage`, after the existing `useState` hooks, add:
```tsx
  const [convertLead, setConvertLead] = useState<BsiLead | null>(null)
```

- [ ] **Step 2: Add the conversion handler**

Inside `LeadsAdminPage`, add:
```tsx
  async function handleConverted(clientId: string) {
    const lead = convertLead
    if (!lead) return
    await supabase.from('bsi_leads').update({ converted_client_id: clientId, status: 'closed' }).eq('id', lead.id)
    setItems(xs => xs.map(x => x.id === lead.id ? { ...x, converted_client_id: clientId, status: 'closed' } : x))
    setConvertLead(null)
  }
```

- [ ] **Step 3: Pass an `onConvert` prop into each `LeadCard`**

Where `LeadCard` is rendered, add the prop:
```tsx
                <LeadCard
                  key={lead.id}
                  lead={lead}
                  onUpdateStatus={(s) => updateStatus(lead.id, s)}
                  onConvert={() => setConvertLead(lead)}
                />
```

- [ ] **Step 4: Render the modal once, at the end of the page's returned JSX**

Immediately before the closing `</PageShell>`:
```tsx
        {convertLead && (
          <ClientModal
            open
            client={null}
            source="website"
            leadId={convertLead.id}
            prefill={{
              name: convertLead.brand_name,
              pic: convertLead.full_name,
              contact: convertLead.contact_value,
              notes: [convertLead.project_type, convertLead.notes].filter(Boolean).join(' · '),
              stage: 'lead',
            }}
            onCreated={handleConverted}
            onClose={() => setConvertLead(null)}
          />
        )}
```

- [ ] **Step 5: Add the button / converted badge to `LeadCard`**

Widen `LeadCard`'s props to `{ lead: BsiLead; onUpdateStatus: (s: BsiLead['status']) => void; onConvert: () => void }`. In its header row (the always-visible grid, after the status control), add:
```tsx
        {lead.converted_client_id ? (
          <Link
            href={`/clients/${lead.converted_client_id}`}
            onClick={(e) => e.stopPropagation()}
            style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent3)', textDecoration: 'none', whiteSpace: 'nowrap' }}
          >
            ✓ {t('Jadi Client')}
          </Link>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onConvert() }}
            style={{ fontSize: 12, fontWeight: 600, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            {t('Jadikan Client')}
          </button>
        )}
```
If adding a new cell shifts the header's `gridTemplateColumns`, append one more `auto` to that template so the new control gets its own column.

- [ ] **Step 6: Typecheck + manual verify**

Run `npx tsc --noEmit` (clean). Then on http://localhost:3000/website/leads: click **Jadikan Client** on a lead → the modal opens pre-filled (brand→name, full_name→PIC, contact, project_type+notes→notes); set PIC + value → Simpan → the lead card flips to **✓ Jadi Client** linking to `/clients/<id>` (no reload); the new client is on the CRM board; re-opening shows no convert button.

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/website/leads/page.tsx"
git commit -m "feat(crm): convert a website lead into a CRM client"
```

---

### Task 4: Source label on the Client 360 header

**Files:**
- Modify: `components/CRM/ClientProfile.tsx` (header block)

**Interfaces:**
- Consumes: `client.source`, `client.lead_id` (Task 1).

- [ ] **Step 1: Render source (and a back-link when from a website lead)**

In the header's info grid (the `<div style={{ fontSize: 13, color: 'var(--text2)', ... }}>` block), add a line:
```tsx
              <div>
                {t('Sumber')}: {client.source === 'website' ? 'Website' : client.source === 'referral' ? 'Referral' : 'Manual'}
                {client.lead_id && (
                  <>
                    {' · '}
                    <Link href="/website/leads" style={{ color: 'var(--accent)', textDecoration: 'none' }}>{t('dari Lead website')}</Link>
                  </>
                )}
              </div>
```
`Link` from `next/link` is already imported in this file (sub-project 1). If not, add `import Link from 'next/link'`.

- [ ] **Step 2: Typecheck + manual verify**

`npx tsc --noEmit` (clean). Open a client converted from a lead → header shows "Sumber: Website · dari Lead website" (link → leads). A manual client shows "Sumber: Manual" with no link.

- [ ] **Step 3: Commit**

```bash
git add components/CRM/ClientProfile.tsx
git commit -m "feat(crm): show client source + lead origin on the 360 header"
```

---

## Self-Review

**Spec coverage:**
- `clients.source` + `clients.lead_id` + `bsi_leads.converted_client_id` → Task 1 ✓
- "Jadikan Client" + prefilled ClientModal + mapping → Tasks 2 (modal) + 3 (leads page) ✓
- Converted badge + double-conversion guard (button hidden when `converted_client_id` set) → Task 3 ✓
- Lead stamped `converted_client_id` + `status='closed'` → Task 3 Step 2 ✓
- "Sumber" select on the modal, default Manual → Task 2 Step 4 ✓
- Source label + lead back-link on Client 360 → Task 4 ✓
- Realtime (client appears via existing `clients` channel; leads page updates local state) → no new code needed; Task 3 updates `items` locally ✓

**Placeholder scan:** none — every step has concrete code. The only "if it differs" note (Task 3 Step 5, grid columns) names the exact remedy.

**Type consistency:** `ClientModal` prop shape in Task 2 matches the call in Task 3. `prefill` keys (name/pic/contact/stage/service/notes) match the form-state seed in Task 2 Step 2. `onCreated(clientId: string)` defined in Task 2, called in Task 3. `converted_client_id` added in Task 1, read in Task 3. `source`/`lead_id` added in Task 1, written in Task 2, read in Task 4.
