# Chat Features — Retract, Edit, Attachments, Clear

Date: 2026-06-12
Status: Approved (design)

## Goal

Extend the project group chat (`/smm/<slug>/chat`) with: retract (unsend) a sent
message, edit a sent message, send file attachments, and clear messages (select
specific messages to delete, or empty the whole room). All changes sync live to
every room member.

This is **Track A**. Web-admin performance is a separate spec
(`2026-06-12-web-admin-performance-design.md`).

## Decisions (from brainstorming)

- **Retract** = soft delete → bubble shows *"Pesan ini ditarik"* (history stays tidy).
- **Clear (#3)** = hard delete, two flavors: select specific messages → delete, and
  empty the whole room (super admin only).
- **Attachments** = images shown inline; common documents (pdf, doc/x, xls/x, ppt/x,
  zip) shown as download chips. Max ~10 MB per file. One optional file per message.
- **Permissions** = author can edit/retract their own; super admin can retract/delete
  anyone's (moderation) and empty the room. No time limit on edit/retract.

## Data model

New migration: `docs/sql/2026-06-12-chat-v2.sql`.

`chat_messages` gains:

| column          | type          | meaning                                   |
|-----------------|---------------|-------------------------------------------|
| `edited_at`     | timestamptz   | set when the body is edited (UI shows "(diedit)") |
| `deleted_at`    | timestamptz   | set on retract; body is blanked           |
| `attachment_path` | text        | storage path inside `chat-attachments`    |
| `attachment_name` | text        | original filename (for display/download)  |
| `attachment_type` | text        | MIME type (drives inline-image vs chip)   |
| `attachment_size` | int         | bytes (for display)                       |

- `body` becomes effectively optional: a message is valid if it has a non-empty
  `body` OR an `attachment_path`. (Keep the column `not null`; send `''` when only a
  file is attached, to avoid a schema change to nullability.)
- A retracted message keeps its row: `deleted_at` set, `body` set to `''`,
  attachment columns cleared.

### SQL helper

`is_chat_super_admin()` — `security definer`, mirrors the super-admin branch already
in `can_access_chat_room`:
```
lower(auth.jwt()->>'email') = 'dandirivaldi@masterbagasi.com'
or auth.jwt()->'app_metadata'->>'role' = 'super_admin'
```

### RLS (added to existing select/insert policies)

- **UPDATE** `chat_messages_update`:
  `using ( can_access_chat_room(room) and (author_email = auth.jwt()->>'email' or is_chat_super_admin()) )`
  `with check (` same `)`. Covers edit and retract.
- **DELETE** `chat_messages_delete`:
  `using ( can_access_chat_room(room) and (author_email = auth.jwt()->>'email' or is_chat_super_admin()) )`.
  Covers select-delete and empty-room. A non-super user emptying a room only removes
  their own rows (RLS), so the UI restricts the "empty room" button to super admin and
  RLS enforces it server-side regardless.

### Storage

Private bucket `chat-attachments`. Objects keyed `"<room>/<uuid>-<sanitized-name>"`.
No public read; access goes through the API (signed URL), so the bucket stays private.

## API routes

All under `app/api/chat/`. Each route re-uses the existing `gate(room)` helper for
access control; mutation routes additionally check author/super-admin.

- `PATCH /api/chat/[room]/[id]`
  - body `{ body: string }` → edit: trims, rejects empty, sets `body` + `edited_at`.
  - body `{ action: 'retract' }` → soft delete: sets `deleted_at = now()`, `body = ''`,
    clears attachment columns.
  - Author-only for edit; author or super admin for retract.
- `DELETE /api/chat/[room]/[id]` → hard-delete one message (author or super admin). If
  it had an attachment, also remove the storage object.
- `POST /api/chat/[room]/clear` → `{ ids?: string[] }` hard-deletes the listed messages
  (RLS limits to allowed rows); `{ all: true }` deletes every message in the room
  (super admin only — checked in the route AND enforced by RLS). Removes associated
  storage objects.
- `POST /api/chat/[room]/upload` (multipart) → validates type + size (≤10 MB), uploads
  to `chat-attachments`, returns `{ attachment_path, attachment_name, attachment_type,
  attachment_size }`. The client then calls the existing send-message `POST` including
  these fields.
- `GET /api/chat/[room]/file?path=<storage-path>` → verifies room access, then 302-redirects
  to a short-lived (≈60s) signed URL for the object. Used as `<img src>` and download href.

Existing `POST /api/chat/[room]` is extended to accept optional `attachment_*` fields and
to allow empty `body` when an attachment is present.

## Frontend (`components/Chat/ChatRoom.tsx`)

- **Message type** extended with `edited_at`, `deleted_at`, `attachment_*`.
- **Per-message actions:** a **⋯** button appears on hover. Menu: own message → *Edit*,
  *Tarik*; super admin on others → *Hapus*. (Touch: long-press opens the same menu.)
- **Edit mode:** the bubble swaps to an inline textarea with *Simpan* / *Batal*
  (Enter saves, Esc cancels). Optimistic update; reconciles with PATCH response.
- **Retracted render:** italic muted *"Pesan ini ditarik"*; no actions, no tick.
- **Edited render:** "(diedit)" appended near the timestamp.
- **Attachments:**
  - Composer gets a 📎 button → file input. Chosen file shows as a removable preview
    chip above the input; *Kirim* uploads then sends.
  - Image messages render an inline thumbnail (max ~260px) via the `file?path=` endpoint;
    click opens a lightbox. Document messages render a chip (type icon + name + size) that
    downloads via the same endpoint.
- **Select / clear mode:** a *Pilih* control in the room header toggles selection mode.
  Checkboxes appear on every message; a bottom action bar shows *Hapus (n)* and — for
  super admin — *Kosongkan room*. Both confirm via the shared `Modal` before calling
  `clear`.
- **Realtime:** the existing channel subscription adds `UPDATE` (apply edit/retract by id)
  and `DELETE` (drop by id) handlers alongside the current `INSERT`. The render-time
  dedupe-by-id safety net stays.

## Out of scope (YAGNI)

- Multiple files per message (send several messages instead).
- Reactions, replies/threads, read-by-list.
- Edit/retract time limits.
- Per-user "clear from my view only" (we chose select-delete + empty-room instead).

## Testing

- RLS: a non-author cannot edit/delete another's message; super admin can; non-member
  cannot touch the room at all.
- Upload: oversize and disallowed MIME are rejected.
- File endpoint denies users without room access.
- Realtime: edit/retract/delete propagate to a second client.
- Empty `body` allowed only with an attachment.
