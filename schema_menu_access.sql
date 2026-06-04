-- Per-account menu access control.
-- Stores which sidebar sections (by id, see lib/access.ts ACCESS_SECTIONS)
-- each login account may access. Default is DENY: no row / empty array means
-- the account can access nothing until the super admin grants sections.
-- The super admin (lib/access.ts SUPER_ADMIN_EMAILS) always has full access and
-- is never stored here.

CREATE TABLE IF NOT EXISTS public.menu_access (
  email      text PRIMARY KEY,
  sections   text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);

ALTER TABLE public.menu_access ENABLE ROW LEVEL SECURITY;

-- A logged-in user may read ONLY their own access row. The sidebar and the
-- middleware use this to decide what to show / allow. All writes go through the
-- service-role admin API (which bypasses RLS), so there are intentionally no
-- insert/update/delete policies for normal users.
DROP POLICY IF EXISTS menu_access_read_own ON public.menu_access;
CREATE POLICY menu_access_read_own
  ON public.menu_access
  FOR SELECT
  TO authenticated
  USING (lower(email) = lower(auth.jwt() ->> 'email'));
