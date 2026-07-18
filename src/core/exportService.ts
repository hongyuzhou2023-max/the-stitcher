import { computeLayout } from './layouts'
import { resolveExportSize, pageHasImages } from './exportSize'
import { exportCollageBlob } from './tileExport'
import { probeCanvasLimits, clampToLimits } from './canvasProbe'
import {
  downloadBlob,
  downloadZip,
  blobsToPreviewItems,
  shouldUseSequentialSave,
  revokePreviewItems,
} from './download'
import { formatExportName } from '../utils/formatName'
import { getPageDisplayName } from '../utils/pageName'
import { assetsMap, useAppStore } from '../store/appStore'
import type { Page } from '../types'
import { t } from '../i18n/messages'

async function exportOnePage(
  page: Page,
  index: number,
  allowDownscale: boolean,
): Promise<{ name: string; blob: Blob } | null> {
  const state = useAppStore.getState()
  const pageLabel = getPageDisplayName(page, index - 1, state.locale)
  if (!pageHasImages(page.slots)) {
    state.showToast(t(state.locale, 'skippedEmpty', { name: pageLabel }))
    return null
  }

  const layout = computeLayout(page.mode)
  const assets = assetsMap()
  const size = resolveExportSize(page, layout, assets)
  let limits = state.canvasLimits
  if (!limits) {
    limits = await probeCanvasLimits()
    state.setCanvasLimits(limits)
  }

  const result = await exportCollageBlob(
    page,
    layout,
    assets,
    size.width,
    size.height,
    limits,
    state.exportFormat,
    allowDownscale,
  )

  if (!result.ok && result.reason === 'needs_confirm' && !allowDownscale) {
    return new Promise((resolve) => {
      state.setExportDialog({
        type: 'limit',
        message: result.message,
        maxSide: result.maxSide,
        suggestedWidth: result.suggestedWidth,
        suggestedHeight: result.suggestedHeight,
        pendingAction: 'export_one',
      })
      pendingLimitResolve = async (confirmed) => {
        state.setExportDialog(null)
        if (!confirmed) {
          resolve(null)
          return
        }
        const clamped = clampToLimits(size.width, size.height, limits!)
        const retry = await exportCollageBlob(
          page,
          layout,
          assets,
          clamped.width,
          clamped.height,
          limits!,
          state.exportFormat,
          true,
        )
        if (!retry.ok) {
          state.showToast(retry.message)
          resolve(null)
          return
        }
        const ext = state.exportFormat === 'png' ? 'png' : 'jpg'
        resolve({
          name: formatExportName(pageLabel, page.mode.type, index, ext),
          blob: retry.blob,
        })
      }
    })
  }

  if (!result.ok) {
    state.showToast(result.message)
    return null
  }

  const ext = state.exportFormat === 'png' ? 'png' : 'jpg'
  return {
    name: formatExportName(pageLabel, page.mode.type, index, ext),
    blob: result.blob,
  }
}

let pendingLimitResolve:
  | ((confirmed: boolean) => void | Promise<void>)
  | null = null

export function confirmLimitDialog(confirmed: boolean) {
  const fn = pendingLimitResolve
  pendingLimitResolve = null
  void fn?.(confirmed)
}

export async function runExportActivePage() {
  const state = useAppStore.getState()
  if (state.exporting) return
  state.setExporting(true)
  state.setExportDialog({
    type: 'busy',
    message: t(state.locale, 'exporting'),
  })
  try {
    const page = state.pages.find((p) => p.id === state.activePageId)
    if (!page) return
    const idx = state.pages.findIndex((p) => p.id === page.id) + 1
    const file = await exportOnePage(page, idx, false)
    if (!file) return

    if (shouldUseSequentialSave()) {
      revokePreviewItems(state.exportPreviews)
      state.setExportPreviews(blobsToPreviewItems([file]))
      state.setExportDialog({
        type: 'ios_save',
        message: t(state.locale, 'saveToAlbum'),
      })
    } else {
      downloadBlob(file.blob, file.name)
      state.setExportDialog(null)
      state.showToast(t(state.locale, 'exported', { name: file.name }))
    }
  } finally {
    state.setExporting(false)
    if (useAppStore.getState().exportDialog?.type === 'busy') {
      useAppStore.getState().setExportDialog(null)
    }
  }
}

export async function runExportAllPages() {
  const state = useAppStore.getState()
  if (state.exporting) return
  state.setExporting(true)
  state.setExportDialog({
    type: 'busy',
    message: t(state.locale, 'batchExporting'),
  })
  try {
    const files: Array<{ name: string; blob: Blob }> = []
    for (let i = 0; i < state.pages.length; i++) {
      const file = await exportOnePage(state.pages[i], i + 1, false)
      if (file) files.push(file)
    }
    if (!files.length) {
      state.showToast(t(state.locale, 'nothingToExport'))
      state.setExportDialog(null)
      return
    }

    if (shouldUseSequentialSave()) {
      revokePreviewItems(state.exportPreviews)
      state.setExportPreviews(blobsToPreviewItems(files))
      state.setExportDialog({
        type: 'ios_save',
        message: t(state.locale, 'saveToAlbum'),
      })
    } else if (files.length === 1) {
      downloadBlob(files[0].blob, files[0].name)
      state.setExportDialog(null)
      state.showToast(t(state.locale, 'exported', { name: files[0].name }))
    } else {
      const date = new Date()
      const y = date.getFullYear()
      const m = String(date.getMonth() + 1).padStart(2, '0')
      const d = String(date.getDate()).padStart(2, '0')
      await downloadZip(files, `xhs_collage_${y}${m}${d}.zip`)
      state.setExportDialog(null)
      state.showToast(t(state.locale, 'zipped', { n: files.length }))
    }
  } finally {
    state.setExporting(false)
    if (useAppStore.getState().exportDialog?.type === 'busy') {
      useAppStore.getState().setExportDialog(null)
    }
  }
}
