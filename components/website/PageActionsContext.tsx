'use client'

import { createContext, ReactNode, useContext, useEffect, useState } from 'react'

// Two separate contexts so consumers can subscribe only to what they need:
// - ActionValueContext: changes whenever the action JSX changes (consumed by header)
// - ActionSetterContext: stable ref (consumed by editor pages)
//
// If both lived in one context, editors would re-render every time the
// header's action changes — which causes an infinite loop because the editor
// itself sets the action on every render.
const ActionValueContext = createContext<ReactNode>(null)
const ActionSetterContext = createContext<(a: ReactNode) => void>(() => {})

export function PageActionsProvider({ children }: { children: ReactNode }) {
  const [action, setAction] = useState<ReactNode>(null)
  return (
    <ActionSetterContext.Provider value={setAction}>
      <ActionValueContext.Provider value={action}>
        {children}
      </ActionValueContext.Provider>
    </ActionSetterContext.Provider>
  )
}

export function usePageAction(): ReactNode {
  return useContext(ActionValueContext)
}

/**
 * Editor pages call this once per render with the JSX they want shown in the
 * parent layout's header. The action is updated on every render so it always
 * reflects the latest state (saving, isDirty, etc.). Cleared on unmount.
 *
 * Internally uses ActionSetterContext (stable ref), so this hook does NOT
 * cause the editor to re-render when other parts of the page (like the header
 * itself) re-render.
 */
export function useRegisterPageAction(action: ReactNode) {
  const setAction = useContext(ActionSetterContext)
  useEffect(() => {
    setAction(action)
  })
  useEffect(() => {
    return () => setAction(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
