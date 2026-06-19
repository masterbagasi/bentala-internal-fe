import type { Post } from './types'
import { taskChatRoom } from './access'

// PIC names for the workspace boards (Video Production / Design Studio). Must
// match the values stored in post.pics and used by the BPI board scoping.
export const VP_PIC = 'Video Production'
export const DS_PIC = 'Design Studio'

/**
 * isPostUnread — a post carries an "unread change" marker for the current user
 * when its most recent meaningful change was made by SOMEONE ELSE and the user
 * hasn't opened it since.
 *
 *   unread = last_actor present
 *            AND last_actor !== me
 *            AND last_change_at > the time I last opened this task
 *
 * Old posts have last_actor = null (the column was added later), so nothing
 * lights up until a fresh change happens. The actor never sees their own change.
 */
export function isPostUnread(
  post: Pick<Post, 'id' | 'last_actor' | 'last_change_at'>,
  meEmail: string | null,
  postSeen: Record<string, number>,
): boolean {
  const actor = post.last_actor
  if (!actor || !post.last_change_at) return false
  // Until we know who the viewer is, don't flag anything — otherwise the
  // viewer's own just-made change could briefly show before meEmail loads.
  if (!meEmail) return false
  if (actor.toLowerCase() === meEmail.toLowerCase()) return false
  const changedAt = Date.parse(post.last_change_at)
  if (Number.isNaN(changedAt)) return false
  const seenAt = postSeen[post.id] ?? 0
  return changedAt > seenAt
}

/** Does the task's chat room have unread messages (from someone else)? */
export function isChatUnread(
  post: Pick<Post, 'id' | 'entity'>,
  chatUnread: Record<string, number>,
): boolean {
  return (chatUnread[taskChatRoom(post.entity, post.id)] ?? 0) > 0
}

/**
 * isPostMarked — the unified "this task needs your attention" signal that drives
 * the card dots, status counts and nav badges: a change by someone else you
 * haven't opened, OR an unread chat message in the task's room.
 */
export function isPostMarked(
  post: Post,
  meEmail: string | null,
  postSeen: Record<string, number>,
  chatUnread: Record<string, number>,
): boolean {
  return isPostUnread(post, meEmail, postSeen) || isChatUnread(post, chatUnread)
}

/** Does a post belong to a given board's scope? Mirrors BPIPage's `filtered`. */
export type BoardScope =
  | { kind: 'all' }
  | { kind: 'entity'; entity: string }
  | { kind: 'pic'; pic: string }

export function postInScope(post: Post, scope: BoardScope): boolean {
  switch (scope.kind) {
    case 'all':
      return true
    case 'entity':
      return post.entity === scope.entity
    case 'pic':
      // Workspace boards only pick a post up once it's briefed (not 'todo').
      return (post.pics || []).includes(scope.pic) && post.status !== 'todo'
  }
}

/** Count marked posts within a board scope (for the sidebar nav badge) —
 *  counts both post-change and chat-message unread. */
export function countUnreadInScope(
  posts: Post[],
  scope: BoardScope,
  meEmail: string | null,
  postSeen: Record<string, number>,
  chatUnread: Record<string, number>,
): number {
  let n = 0
  for (const p of posts) {
    if (postInScope(p, scope) && isPostMarked(p, meEmail, postSeen, chatUnread)) n++
  }
  return n
}
