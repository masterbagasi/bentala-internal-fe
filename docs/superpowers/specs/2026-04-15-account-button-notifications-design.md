# Design: Account Button & Notification Bell

**Date:** 2026-04-15  
**Status:** Approved

---

## Overview

Add a user account button at the bottom-left of the sidebar and a notification bell at the top-right of the page header. Remove the existing "Keluar" button from the page header since logout moves to the account popup.

---

## Scope

1. **AccountButton** — new component, bottom of sidebar
2. **NotificationBell** — new component, right side of PageHeader
3. **Sidebar** — mount AccountButton at the bottom
4. **PageHeader** — remove Keluar button, add NotificationBell
5. **globals.css** — add light mode CSS variable values

---

## Components

### `components/shared/AccountButton.tsx`

**Appearance (Option C — Card Button):**
- Card with border: `background: var(--bg3)`, `border: 1px solid var(--border)`, `border-radius: 8px`
- Inside: avatar circle + name (font-size 12, bold) + email (font-size 10, muted) + chevron icon
- Collapsed sidebar state: show avatar only (no name/email), consistent with how sidebar handles `isExpanded`
- Expanded sidebar state: full card layout

**Avatar:**
- If `user_metadata.avatar_url` exists → render `<img>` with rounded-full
- Otherwise → initials from display name (e.g. "Dandi Rivaldi" → "DR"), purple gradient background (matching sidebar style)

**Popup (opens above the button):**
- Triggered by clicking the card button
- Closes on click outside (mousedown listener on document)
- Position: `absolute, bottom: 100% + 8px, left: 0, right: 0`
- Contains:
  1. **Header section** — avatar (larger, 40px) + full name + email; click avatar → triggers hidden file input
  2. **Edit Profil** — same as clicking avatar, triggers file input
  3. **Ganti Bahasa** — shows current lang (ID/EN), clicking toggles; saves to `localStorage('lang')`; updates sidebar/header label strings
  4. **Tema** — shows sun/moon icon; clicking toggles dark/light; saves to `localStorage('theme')`; toggles `data-theme="light"` on `<html>`
  5. Separator (`<hr>`)
  6. **Keluar** — red text; calls `supabase.auth.signOut()` then `router.push('/login')`

**Photo Upload:**
- Hidden `<input type="file" accept="image/*">` triggered by clicking avatar or "Edit Profil"
- Client-side validation: if file size > 20MB → reject with inline error message
- If file dimensions are large but size ≤ 20MB → use `canvas` to resize to max 1920px on longest side while preserving aspect ratio, re-encode as `image/jpeg` quality 0.92 (HD)
- Upload to Supabase Storage bucket `avatars`, path: `{user_id}/avatar.jpg`
- After upload: call `supabase.auth.updateUser({ data: { avatar_url: publicUrl } })`
- Update local state immediately (optimistic) so UI reflects new photo without page reload

**Language toggle (ID/EN):**
- Scope: only UI label strings in Sidebar section headers and PageHeader title (not a full i18n system)
- Saves to `localStorage('bentala_lang')`
- Read via a small `useLang()` hook or direct localStorage read in components

**Theme toggle (dark/light):**
- On mount, read `localStorage('bentala_theme')` — if `'light'`, add `data-theme="light"` to `document.documentElement`
- On toggle: flip the attribute and save to localStorage
- Light mode CSS variables defined in `globals.css` under `[data-theme="light"]` selector

---

### `components/shared/NotificationBell.tsx`

**Appearance:**
- Bell icon (SVG), 20×20, color `var(--text2)`
- If unread count > 0: red circle badge (top-right of icon), shows count up to "9+" 
- Positioned in PageHeader title bar, right side, before any action slot

**Unread tracking:**
- On mount: read `localStorage('bentala_notif_last_seen')` (Unix ms timestamp)
- Unread count = items in `useStore().activity` where `created_at > last_seen`
- On popup open: set `localStorage('bentala_notif_last_seen') = Date.now()`, recompute unread → badge disappears

**Popup dropdown:**
- Appears below bell icon, right-aligned
- Width: 320px
- Header: "Aktivitas" label + "Tandai semua dibaca" button (resets last_seen)
- List: up to 20 most recent `activity` entries from store
- Each item: message text + relative timestamp ("2 menit lalu", "1 jam lalu")
- Empty state: "Belum ada aktivitas"
- Closes on click outside

---

## Modified Files

### `components/Sidebar.tsx`
- Import and render `<AccountButton />` after the scrollable nav `<div>`, inside the `<nav>`, as a `flex-shrink-0` element
- Pass `isExpanded` prop to AccountButton so it can hide name/email when collapsed

### `components/shared/PageHeader.tsx`
- Remove the "Keluar" button block entirely
- Import and render `<NotificationBell />` inside the actions `<div>` (left of any existing action buttons)

### `globals.css`
- Add `[data-theme="light"]` block with light mode values for: `--bg`, `--bg2`, `--bg3`, `--border`, `--text`, `--text2`, and any other tokens currently defined

---

## Data Flow

```
Supabase Auth
  └── getUser() on mount → AccountButton (name, email, avatar_url)
  └── updateUser() on photo upload → avatar_url saved to user_metadata

Supabase Storage (bucket: avatars)
  └── upload path: {user_id}/avatar.jpg
  └── getPublicUrl() → stored in user_metadata.avatar_url

useStore().activity (already populated by DataProvider + realtime)
  └── NotificationBell reads this array
  └── Filters by created_at > localStorage('bentala_notif_last_seen')

localStorage
  └── bentala_notif_last_seen — Unix ms, set on popup open
  └── bentala_lang — 'id' | 'en'
  └── bentala_theme — 'dark' | 'light'
```

---

## Edge Cases

- **Sidebar collapsed:** AccountButton shows avatar only; popup still fully functional
- **Upload error:** inline error text shown inside popup, no modal
- **File > 20MB:** reject immediately, show "Ukuran file maks 20MB" inline
- **File ≤ 20MB but large dimensions:** canvas resize to max 1920px, quality 0.92 JPEG
- **activity store empty:** notification popup shows "Belum ada aktivitas"
- **No unread:** badge not rendered (not "0", just hidden)
- **localStorage unavailable:** theme/lang fall back to defaults (dark, ID); notif treats all as unread
