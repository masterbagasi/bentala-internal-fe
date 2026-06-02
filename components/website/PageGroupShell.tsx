'use client'

import { ReactNode } from 'react'
import { PageShell } from '@/components/shared/PageShell'
import { PageActionsProvider, usePageAction } from './PageActionsContext'

interface Tab {
  href: string
  label: string
  icon?: ReactNode
}

interface Props {
  title: string
  tabs: Tab[]
  children: ReactNode
}

/**
 * Thin wrapper around `PageShell` that injects the page-action
 * context (used by descendant pages to register a top-right
 * action button via `useRegisterPageAction`). Visual chrome is
 * 100% delegated to PageShell so every dashboard tab matches.
 */
export function PageGroupShell({ title, tabs, children }: Props) {
  return (
    <PageActionsProvider>
      <ShellInner title={title} tabs={tabs}>
        {children}
      </ShellInner>
    </PageActionsProvider>
  )
}

function ShellInner({ title, tabs, children }: Props) {
  const action = usePageAction()
  return (
    <PageShell
      title={title}
      action={action}
      tabs={{ kind: 'link', items: tabs }}
    >
      {children}
    </PageShell>
  )
}
