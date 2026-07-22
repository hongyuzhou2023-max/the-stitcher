import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import type { PersistedSnapshot } from './persist'
import { deserializeAssets, serializeProject } from './persist'
import type { Asset, ExportFormat, ExportSizePreset, Page } from '../types'
import type { Locale } from '../i18n/messages'

const META_NAME = 'project.json'

export async function exportProjectZip(input: {
  locale: Locale
  exportFormat: ExportFormat
  exportSize?: ExportSizePreset
  activePageId: string
  selectedSlotIndex: number
  pages: Page[]
  assets: Asset[]
}): Promise<void> {
  const snap = await serializeProject(input)
  const zip = new JSZip()
  const meta = {
    version: snap.version,
    locale: snap.locale,
    exportFormat: snap.exportFormat,
    exportSize: snap.exportSize,
    activePageId: snap.activePageId,
    selectedSlotIndex: snap.selectedSlotIndex,
    pages: snap.pages,
    assets: snap.assets.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      file: `assets/${a.id}_${safeName(a.name)}`,
    })),
  }
  zip.file(META_NAME, JSON.stringify(meta, null, 2))
  const folder = zip.folder('assets')!
  for (const a of snap.assets) {
    folder.file(`${a.id}_${safeName(a.name)}`, a.buffer)
  }
  const blob = await zip.generateAsync({ type: 'blob' })
  const date = new Date()
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
  saveAs(blob, `stitcher_project_${stamp}.zip`)
}

export type ImportedProject = {
  locale: Locale
  exportFormat: ExportFormat
  exportSize?: ExportSizePreset
  activePageId: string
  selectedSlotIndex: number
  pages: Page[]
  assets: Asset[]
}

export async function importProjectZip(file: File): Promise<ImportedProject> {
  const zip = await JSZip.loadAsync(file)
  const metaFile = zip.file(META_NAME)
  if (!metaFile) throw new Error('missing project.json')
  const meta = JSON.parse(await metaFile.async('string')) as {
    version: number
    locale: Locale
    exportFormat: ExportFormat
    exportSize?: ExportSizePreset
    activePageId: string
    selectedSlotIndex: number
    pages: Page[]
    assets: Array<{ id: string; name: string; type: string; file: string }>
  }

  const rows: PersistedSnapshot['assets'] = []
  for (const a of meta.assets) {
    const entry = zip.file(a.file)
    if (!entry) continue
    const buffer = await entry.async('arraybuffer')
    rows.push({
      id: a.id,
      name: a.name,
      type: a.type,
      buffer,
    })
  }

  const assets = await deserializeAssets(rows)
  return {
    locale: meta.locale === 'en' ? 'en' : 'zh',
    exportFormat: meta.exportFormat,
    exportSize: meta.exportSize,
    activePageId: meta.activePageId,
    selectedSlotIndex: meta.selectedSlotIndex ?? 0,
    pages: meta.pages,
    assets,
  }
}

function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_') || 'image.jpg'
}

export function estimateProjectBytes(assets: Asset[]): number {
  return assets.reduce((sum, a) => sum + (a.file.size || 0), 0)
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}
