import { saveAs } from 'file-saver'
import JSZip from 'jszip'
import { prefersZipDownload } from '../utils/platform'
import type { ExportPreviewItem } from '../types'

export function downloadBlob(blob: Blob, filename: string) {
  saveAs(blob, filename)
}

export async function downloadZip(
  files: Array<{ name: string; blob: Blob }>,
  zipName: string,
): Promise<void> {
  const zip = new JSZip()
  for (const f of files) {
    zip.file(f.name, f.blob)
  }
  const blob = await zip.generateAsync({ type: 'blob' })
  saveAs(blob, zipName)
}

export function shouldUseSequentialSave(): boolean {
  return !prefersZipDownload()
}

export function blobsToPreviewItems(
  files: Array<{ name: string; blob: Blob }>,
): ExportPreviewItem[] {
  return files.map((f) => ({
    name: f.name,
    blob: f.blob,
    url: URL.createObjectURL(f.blob),
  }))
}

export function revokePreviewItems(items: ExportPreviewItem[]) {
  for (const item of items) {
    try {
      URL.revokeObjectURL(item.url)
    } catch {
      /* ignore */
    }
  }
}
