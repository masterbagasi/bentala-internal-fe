import { redirect } from 'next/navigation'

/**
 * The standalone Website Dashboard was folded into the unified
 * top-level Dashboard (Website tab). Redirect anyone who lands on
 * /website directly to the right tab so old bookmarks keep working.
 */
export default function WebsiteDashboardRedirect() {
  redirect('/?tab=website')
}
