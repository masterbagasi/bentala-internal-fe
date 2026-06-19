import { create } from 'zustand'
import type { Post, Client, Invoice, Project, Task, ActivityLog, PipelineItem } from '@/lib/types'

interface DateRange {
  from: string
  to: string
  label: string
}

interface UIState {
  sidebarOpen: boolean
  currentPage: string
  dateRange: DateRange

  // Entity filters
  bpiFilter: string
  bsiFilter: string
  crmFilter: string
  projFilter: string
  taskFilter: string

  // Cal state
  calState: Record<string, Date>
  calView: Record<string, number>
}

interface DataState {
  posts: Post[]
  clients: Client[]
  invoices: Invoice[]
  projects: Project[]
  tasks: Task[]
  activity: ActivityLog[]
  pipelineItems: PipelineItem[]
  loading: boolean
}

interface Actions {
  // Data
  setPosts:    (posts: Post[]) => void
  setClients:  (clients: Client[]) => void
  setInvoices: (invoices: Invoice[]) => void
  setProjects: (projects: Project[]) => void
  setTasks:    (tasks: Task[]) => void
  setActivity: (activity: ActivityLog[]) => void
  setLoading:  (loading: boolean) => void

  // Single item updates
  upsertPost:    (post: Post) => void
  removePost:    (id: string) => void
  upsertClient:  (client: Client) => void
  removeClient:  (id: string) => void
  upsertInvoice: (invoice: Invoice) => void
  removeInvoice: (id: string) => void
  upsertProject: (project: Project) => void
  removeProject: (id: string) => void
  upsertTask:    (task: Task) => void
  removeTask:    (id: string) => void
  addActivity:   (log: ActivityLog) => void
  setPipelineItems:    (items: PipelineItem[]) => void
  upsertPipelineItem:  (item: PipelineItem) => void
  removePipelineItem:  (id: string) => void

  // UI
  setCurrentPage: (page: string) => void
  setBpiFilter: (filter: string) => void
  setBsiFilter: (filter: string) => void
  setCrmFilter: (filter: string) => void
  setProjFilter: (filter: string) => void
  setTaskFilter: (filter: string) => void
  setDateRange: (range: DateRange) => void
  setCalState: (entity: string, date: Date) => void
  setCalView: (entity: string, count: number) => void
}

type StoreState = UIState & DataState & Actions

const today = new Date()
const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)

export const useStore = create<StoreState>((set) => ({
  // Data
  posts: [],
  clients: [],
  invoices: [],
  projects: [],
  tasks: [],
  activity: [],
  pipelineItems: [],
  loading: false,

  // UI
  sidebarOpen: true,
  currentPage: 'dashboard',
  dateRange: {
    from: monthStart.toISOString().slice(0, 10),
    to:   monthEnd.toISOString().slice(0, 10),
    label: 'Bulan Ini',
  },
  bpiFilter:  'all',
  bsiFilter:  'all',
  crmFilter:  'all',
  projFilter: 'all',
  taskFilter: 'all',
  calState: {
    bpi:   new Date(),
    bsi:   new Date(),
    'ws-fz': new Date(),
    'ws-rn': new Date(),
  },
  calView: {
    bpi:   3,
    bsi:   3,
    'ws-fz': 3,
    'ws-rn': 3,
  },

  // ── Data setters ──
  setPosts:    (posts)    => set({ posts }),
  setClients:  (clients)  => set({ clients }),
  setInvoices: (invoices) => set({ invoices }),
  setProjects: (projects) => set({ projects }),
  setTasks:    (tasks)    => set({ tasks }),
  setActivity: (activity) => set({ activity }),
  setLoading:  (loading)  => set({ loading }),

  // ── Upsert / remove helpers ──
  upsertPost: (post) => set((s) => ({
    // New rows prepend to match the created_at DESC order of the initial
    // fetch; existing rows update in place to keep their position.
    posts: s.posts.find(p => p.id === post.id)
      ? s.posts.map(p => p.id === post.id ? post : p)
      : [post, ...s.posts],
  })),
  removePost: (id) => set((s) => ({ posts: s.posts.filter(p => p.id !== id) })),

  upsertClient: (client) => set((s) => ({
    clients: s.clients.find(c => c.id === client.id)
      ? s.clients.map(c => c.id === client.id ? client : c)
      : [client, ...s.clients],
  })),
  removeClient: (id) => set((s) => ({ clients: s.clients.filter(c => c.id !== id) })),

  upsertInvoice: (invoice) => set((s) => ({
    invoices: s.invoices.find(i => i.id === invoice.id)
      ? s.invoices.map(i => i.id === invoice.id ? invoice : i)
      : [...s.invoices, invoice],
  })),
  removeInvoice: (id) => set((s) => ({ invoices: s.invoices.filter(i => i.id !== id) })),

  upsertProject: (project) => set((s) => ({
    projects: s.projects.find(p => p.id === project.id)
      ? s.projects.map(p => p.id === project.id ? project : p)
      : [project, ...s.projects],
  })),
  removeProject: (id) => set((s) => ({ projects: s.projects.filter(p => p.id !== id) })),

  upsertTask: (task) => set((s) => ({
    tasks: s.tasks.find(t => t.id === task.id)
      ? s.tasks.map(t => t.id === task.id ? task : t)
      : [task, ...s.tasks],
  })),
  removeTask: (id) => set((s) => ({ tasks: s.tasks.filter(t => t.id !== id) })),

  addActivity: (log) => set((s) => ({
    activity: [log, ...s.activity].slice(0, 50),
  })),

  setPipelineItems: (pipelineItems) => set({ pipelineItems }),

  upsertPipelineItem: (item) => set((s) => ({
    pipelineItems: s.pipelineItems.find(p => p.id === item.id)
      ? s.pipelineItems.map(p => p.id === item.id ? item : p)
      : [item, ...s.pipelineItems],
  })),

  removePipelineItem: (id) => set((s) => ({
    pipelineItems: s.pipelineItems.filter(p => p.id !== id),
  })),

  // ── UI actions ──
  setCurrentPage: (currentPage) => set({ currentPage }),
  setBpiFilter:   (bpiFilter)   => set({ bpiFilter }),
  setBsiFilter:   (bsiFilter)   => set({ bsiFilter }),
  setCrmFilter:   (crmFilter)   => set({ crmFilter }),
  setProjFilter:  (projFilter)  => set({ projFilter }),
  setTaskFilter:  (taskFilter)  => set({ taskFilter }),
  setDateRange:   (dateRange)   => set({ dateRange }),

  setCalState: (entity, date) => set((s) => ({
    calState: { ...s.calState, [entity]: date },
  })),
  setCalView: (entity, count) => set((s) => ({
    calView: { ...s.calView, [entity]: count },
  })),
}))
