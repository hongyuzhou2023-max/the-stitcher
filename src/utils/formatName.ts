import { sanitizeForFilename } from './pageName'

export function formatExportName(
  pageName: string,
  mode: string,
  index: number,
  ext: 'png' | 'jpg',
  date = new Date(),
): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const n = String(index).padStart(2, '0')
  const safe = sanitizeForFilename(pageName)
  return `stitcher_${safe}_${mode}_${n}_${y}${m}${d}.${ext}`
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}
