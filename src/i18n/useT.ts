import { useCallback } from 'react'
import { useAppStore } from '../store/appStore'
import { t, type MessageKey } from './messages'

export function useT() {
  const locale = useAppStore((s) => s.locale)
  return useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) =>
      t(locale, key, vars),
    [locale],
  )
}
