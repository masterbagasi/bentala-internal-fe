import { POST_STATUS_LABELS, POST_STATUS_COLORS } from '@/lib/constants'

interface StatusBadgeProps {
  status: string
  type?: 'post' | 'stage' | 'inv' | 'task' | 'proj'
  label?: string
  className?: string
}

const POST_BG: Record<string, string> = {
  todo:      '#2e3147',
  brief:     '#1a2540',
  produksi:  '#1a2540',
  revisi:    '#1e1a40',
  review:    '#2a1f10',
  ready:     '#1a3330',
  published: '#1a3330',
  done:      '#1a3330',
}

const STAGE_COLORS: Record<string, { bg: string; color: string }> = {
  lead:     { bg: '#2e3147', color: '#8b8fa8' },
  pitch:    { bg: '#1a2540', color: '#5b9bd5' },
  close:    { bg: '#1a3330', color: '#43d9a2' },
  invoice:  { bg: '#2a1f10', color: '#ffc542' },
  inactive: { bg: '#2e3147', color: '#8b8fa8' },
}

const INV_COLORS: Record<string, { bg: string; color: string }> = {
  pending: { bg: '#2a1f10', color: '#ffc542' },
  dp:      { bg: '#1a2540', color: '#5b9bd5' },
  paid:    { bg: '#1a3330', color: '#43d9a2' },
  overdue: { bg: '#2a1028', color: '#ff6b6b' },
}

const TASK_COLORS: Record<string, { bg: string; color: string }> = {
  todo:     { bg: '#2e3147', color: '#8b8fa8' },
  progress: { bg: '#1a2540', color: '#5b9bd5' },
  review:   { bg: '#2a1f10', color: '#ffc542' },
  done:     { bg: '#1a3330', color: '#43d9a2' },
}

const PROJ_COLORS: Record<string, { bg: string; color: string }> = {
  active:    { bg: '#1a3330', color: '#43d9a2' },
  hold:      { bg: '#2a1f10', color: '#ffc542' },
  done:      { bg: '#1a3330', color: '#43d9a2' },
  cancelled: { bg: '#2e3147', color: '#8b8fa8' },
}

export function StatusBadge({ status, type = 'post', label: labelProp, className }: StatusBadgeProps) {
  let bg = '#2e3147'
  let color = '#8b8fa8'
  let label = status

  if (type === 'post') {
    bg = POST_BG[status] || '#2e3147'
    color = POST_STATUS_COLORS[status] || '#8b8fa8'
    label = POST_STATUS_LABELS[status] || status
  } else if (type === 'stage') {
    const c = STAGE_COLORS[status] || STAGE_COLORS.lead
    bg = c.bg; color = c.color
    label = { lead: 'Lead', pitch: 'Pitching', close: 'Closed', invoice: 'Invoice', inactive: 'Inactive' }[status] || status
  } else if (type === 'inv') {
    const c = INV_COLORS[status] || INV_COLORS.pending
    bg = c.bg; color = c.color
    label = { pending: 'Menunggu', dp: 'DP', paid: 'Lunas', overdue: 'Overdue' }[status] || status
  } else if (type === 'task') {
    const c = TASK_COLORS[status] || TASK_COLORS.todo
    bg = c.bg; color = c.color
    label = { todo: 'To Do', progress: 'In Progress', review: 'Review', done: 'Done' }[status] || status
  } else if (type === 'proj') {
    const c = PROJ_COLORS[status] || PROJ_COLORS.active
    bg = c.bg; color = c.color
    label = { active: 'Active', hold: 'On Hold', done: 'Done', cancelled: 'Cancelled' }[status] || status
  }

  return (
    <span
      className={className}
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 500,
        background: bg,
        color,
        whiteSpace: 'nowrap',
      }}
    >
      {labelProp ?? label}
    </span>
  )
}

export function PlatformBadge({ platform }: { platform: string }) {
  if (platform === 'ig') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, fontSize: 11, background: '#2a1028', color: '#e1306c' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#e1306c', flexShrink: 0, display: 'inline-block' }} />
        Instagram
      </span>
    )
  }
  if (platform === 'tiktok') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, fontSize: 11, background: '#0a1a1a', color: '#69c9d0' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#69c9d0', flexShrink: 0, display: 'inline-block' }} />
        TikTok
      </span>
    )
  }
  return <span className="s-bsi">{platform}</span>
}

export function TeamAvatar({ name, size = 26 }: { name: string; size?: number }) {
  const colors: Record<string, string> = {
    Dandi: '#6c63ff', Naufal: '#43d9a2', 'Design Studio': '#ffc542', 'Video Production': '#ff6b6b',
  }
  const bg = colors[name] || '#8b8fa8'
  return (
    <span
      title={name}
      style={{
        width: size, height: size, borderRadius: '50%',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.42, fontWeight: 700, color: '#fff',
        background: bg, flexShrink: 0,
      }}
    >
      {name.slice(0, 2)}
    </span>
  )
}
