import type { Page } from '../types'
import type { Locale } from '../i18n/messages'
import { t } from '../i18n/messages'

/** 界面显示用页名（跟随语言，除非已重命名） */
export function getPageDisplayName(
  page: Page,
  indexZeroBased: number,
  locale: Locale,
): string {
  const custom = page.customName?.trim()
  if (custom) return custom
  return t(locale, 'pageName', { n: indexZeroBased + 1 })
}

/** 导出文件名用：去掉危险字符 */
export function sanitizeForFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|\s]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'page'
}

/** 兼容旧版 snapshot 里的 name 字段 */
export function migratePage(raw: Record<string, unknown>): Page {
  const id = String(raw.id ?? '')
  const mode = raw.mode as Page['mode']
  const slots = raw.slots as Page['slots']
  if ('customName' in raw) {
    return {
      id,
      customName: (raw.customName as string | null) ?? null,
      mode,
      slots,
    }
  }
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  const isDefault = /^(拼图|Page)\s*\d+$/i.test(name)
  return {
    id,
    customName: name && !isDefault ? name : null,
    mode,
    slots,
  }
}
