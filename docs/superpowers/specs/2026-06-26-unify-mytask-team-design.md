# Unify "My Task" & "Production" → My Task + Team

**Date:** 2026-06-26
**Branch:** feat/crm-comms (work area; do not push until asked)
**Status:** Design approved, pending spec review

## Problem

Three near-identical boards exist, all using the same worksheet columns
(To Do List · Revisi · Production · Review · Done):

- **Video Production** (`/bpi-faizal`) — pulls tasks whose `pics` contains the
  literal track tag `'Video Production'`; board tracks progress via `video_status`.
- **Design Studio** (`/bpi-reinaldi`) — same, for track tag `'Design Studio'` and
  `design_status`.
- **My Task** (`/my-task`) — the logged-in user's own board: tasks that **tag**
  them (Tag Account) plus their own personal/ad-hoc tasks (`entity = 'personal'`).

They are the same idea — "one person's work board" — wearing three hats, split by
two parallel assignment mechanisms (`pics` track tags vs `tagged` accounts). This
confuses the team. The real org model is by jobdesk:

- **Social Media Specialist** lives in **Projects**, plans content and hands the
  production parts (video/design) to the production people.
- **Videographer & Designer** execute the work assigned to them.
- The **lead** monitors progress in **Projects** (All Project) — already covered.

## Goal

Collapse the three boards into **two clear surfaces**:

1. **My Task** — every user's single personal work board (assigned-to-me +
   personal/ad-hoc), with a per-user **Dashboard** summary tab.
2. **Team** — a super-admin-only window into every account's board, with an
   **Overview** (all accounts) tab plus one auto-generated tab per account.

Assignment is unified on **Tag Account**. Nothing is deleted; legacy track tasks
are migrated by *adding* the right account tag so they keep appearing.

## Target Model

### My Task (sidebar → Overview section, every user)

- Visible to every logged-in user; shows **only their own** board.
- **Tabs:** `Dashboard` · `Board` · `List` · `Calendar` · `Files`.
  - **Dashboard** (new) = a summary of *my* tasks: counts per status
    (To Do List / Revisi / Production / Review / Done), items due soon, total
    open vs done. Read-only.
  - Board/List/Calendar/Files unchanged (WS columns, realtime).
- **Contents:** tasks where my account is in `tagged`, plus my own
  `entity = 'personal'` tasks (created via **+ Tambah Task** = personal/ad-hoc
  only, private bucket, never shown in Projects/All Project).
- **Add Task** form unchanged from current personal form (Nama · Due date ·
  Status · Description · Subtasks · File Attachments).

### Team (sidebar → "Team" section, super admin ONLY)

- Renamed from the current "Productions" section. **Replaces** the Video
  Production and Design Studio pages.
- One page (`/team`) with tabs:
  - **Overview** = summary/dashboard of **all accounts combined** (per-account
    breakdown + totals).
  - **One tab per account**, labelled by account name (e.g. `Faizal`,
    `Komengsteffy`, `Dandi`, …), generated automatically from the accounts list.
    Each tab = that account's full board (assigned + personal/ad-hoc — super
    admin sees everything, including private tasks).
- Access: **super admin only** (not grantable via menu_access). Regular users
  never see Team; they use My Task.

### Dashboard (top `/`)

- Unchanged. Per-account visibility is handled by **Team**, not here.

### Assignment mechanism (single, going forward)

- Assigning production work = **tagging the person's account** (Tag Account) on
  the task in Projects. It then appears in that person's My Task (and their Team
  tab) in the **To Do List** column.
- `content_type` (Video/Design) remains as content categorization but **no longer
  routes** a task to a track board.

### Status model

- **Same as Video Production & Design Studio.** The new My Task / Team boards use
  the identical column set — **To Do List · Revisi · Production · Review · Done**
  (`WS_STATUS_COLS`) — and the identical per-track progression: a **video** task's
  column is driven by `video_status`, a **design** task's by `design_status`
  (the existing `smmColKey`/`trackColKey` logic, already reused by My Task via
  `mineColKey`). So progress tracking behaves exactly like the old track boards;
  in a per-account board each task simply sits in its own track-derived column.
- Drag/lock behaviour matches the track boards where applicable (e.g. locked
  `ready`/`published`).
- **All status data is kept and actively used** — `status`, `video_status`, and
  `design_status` are NOT dropped, simplified, or deleted.

## Visibility / Access summary

| Surface            | Who sees it            | Scope                                  |
|--------------------|------------------------|----------------------------------------|
| My Task            | every user             | only their own tasks                   |
| Team › Overview    | super admin only       | all accounts, summarised               |
| Team › <account>   | super admin only       | that account's full board (incl. private) |
| Projects/All Project | as today (gated)     | the content pipeline (lead monitoring) |

## Data Migration (non-destructive — NOTHING deleted)

Add the correct account tag so legacy work keeps surfacing. Tags are **added**
(union), never replaced or removed.

1. **Videographer = Faizal Kusuma (`fzkusuma16@gmail.com`)** — for every task
   where ANY of: `pics` contains `'Video Production'`, OR `content_types`
   contains `video`, OR `tagged` already contains `fzkusuma16@gmail.com` → ensure
   `fzkusuma16@gmail.com` is present in `tagged`.
2. **Designer = Komengsteffy (`reynaldisya1998@gmail.com`)** — for every task
   where ANY of: `pics` contains `'Design Studio'`, OR `content_types` contains
   `design`, OR `tagged` already contains `reynaldisya1998@gmail.com` → ensure
   `reynaldisya1998@gmail.com` is present in `tagged`.

Notes:
- Run as an idempotent SQL update (`array_append` only when not already present).
- No rows are deleted; no other tags are touched; `pics`,
  `video_status`/`design_status` left intact.
- A task matching both rules gets both tags.

## Pages: removed / moved / kept

- **Removed from sidebar** (functionality absorbed by Team per-account tabs):
  `Video Production` (`/bpi-faizal`), `Design Studio` (`/bpi-reinaldi`). The route
  files stay as thin redirects to `/team` so any existing bookmarks/links don't
  break; no data is involved.
- **Moved** (not deleted): `All Projects` (`/projects`) and `Task Board`
  (`/tasks`) → relocated from the old Productions section to the **Projects**
  section of the sidebar.
- **Kept:** My Task, Projects/All Project, Dashboard, everything else.

## Components / files affected (implementation map)

- `components/Sidebar.tsx` — rename "Productions" → "Team" (super-admin gate);
  remove Video Production / Design Studio items; add the Team page link; move
  All Projects / Task Board into the Projects section; My Task stays.
- `app/(dashboard)/team/page.tsx` (new) — Team page: Overview tab + per-account
  tabs (built from the accounts list), super-admin guard.
- `components/BPI/index.tsx` (`BPIPage`) — generalise `mineScope` so it can target
  **any** account (not just the current user) for Team per-account tabs; add a
  combined **all-accounts** scope for Team Overview; add the **Dashboard**
  summary tab rendering.
- New summary component (e.g. `components/BPI/TaskDashboard.tsx`) — counts per
  status + due-soon, for a single account (My Task) and all accounts (Team
  Overview).
- `app/(dashboard)/my-task/page.tsx` — add the `Dashboard` tab.
- `lib/access.ts` — register `/team` as a super-admin-only section.
- Migration SQL (via Supabase) — the two non-destructive tag updates above.
- Per-track status logic (`smmColKey`/`trackColKey`, `video_status`/`design_status`)
  is **reused** for the new My Task / Team boards so columns behave exactly like
  Video Production / Design Studio — not bypassed.

## Non-goals / Out of scope

- No change to the Projects (Social Media) boards or All Project monitoring.
- No deletion of `video_status` / `design_status` data or the `pics` field.
- Add Task in My Task stays personal-only (no assign-to-others from there).
- No new role system beyond the existing super-admin concept.

## Open questions

- None blocking. (Account→person mapping, status merge, page relocation, and the
  non-destructive migration are all decided above.)
