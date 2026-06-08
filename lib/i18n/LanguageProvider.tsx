'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { DICT } from './dictionary'

// ── Language (i18n) provider ─────────────────────────────────
//
// Lightweight, dictionary-based i18n. The SOURCE language is
// Indonesian: every t('...') call is keyed by the Indonesian
// string. When the active language is 'id' we return the key
// unchanged; when 'en' we look it up in DICT and fall back to
// the Indonesian source if there's no translation yet.
//
// This keeps the markup readable (the default Indonesian text is
// right there in the code) and lets translation coverage grow
// incrementally without breaking anything.

export type Lang = 'id' | 'en'

interface LangContextValue {
  lang: Lang
  setLang: (l: Lang) => void
  t: (id: string) => string
}

const LangContext = createContext<LangContextValue>({
  lang: 'id',
  setLang: () => {},
  t: (id: string) => id,
})

const STORAGE_KEY = 'bentala_lang'
const EVENT = 'bentala:lang'

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // Always start at 'id' so server and first client render match
  // (avoids hydration mismatch); sync from storage after mount.
  const [lang, setLangState] = useState<Lang>('id')

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Lang | null
      if (stored === 'en' || stored === 'id') setLangState(stored)
    } catch {}
    // Keep in sync if another component toggles the language.
    function onLang(e: Event) {
      const detail = (e as CustomEvent).detail as Lang
      if (detail === 'en' || detail === 'id') setLangState(detail)
    }
    window.addEventListener(EVENT, onLang)
    return () => window.removeEventListener(EVENT, onLang)
  }, [])

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try { localStorage.setItem(STORAGE_KEY, l) } catch {}
    window.dispatchEvent(new CustomEvent(EVENT, { detail: l }))
  }, [])

  const t = useCallback(
    (id: string) => (lang === 'en' ? DICT[id] ?? id : id),
    [lang],
  )

  return (
    <LangContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LangContext.Provider>
  )
}

export function useLang() {
  return useContext(LangContext)
}

// Convenience hook when a component only needs the translate fn.
export function useT() {
  return useContext(LangContext).t
}
