import type { Asset, LayoutResult, Page, Slot } from '../types'
import { sourcePixelsForExport } from './coverDraw'
import { resolveDrawSlots } from './layouts'

const MIN_EXPORT_WIDTH = 1080

export function resolveExportSize(
  page: Page,
  layout: LayoutResult,
  assets: Map<string, Asset>,
): { width: number; height: number } {
  let minWidth = MIN_EXPORT_WIDTH
  const drawSlots = resolveDrawSlots(page, layout)

  page.slots.forEach((slot, i) => {
    const rect = drawSlots[i]
    if (!slot.assetId || !rect) return
    const asset = assets.get(slot.assetId)
    if (!asset) return

    const { sw, sh } = sourcePixelsForExport(
      asset.width,
      asset.height,
      slot.transform,
    )

    if (rect.w > 0) {
      minWidth = Math.max(minWidth, sw / rect.w)
    }
    if (rect.h > 0) {
      const needW = sh / (rect.h * (layout.aspectH / layout.aspectW))
      minWidth = Math.max(minWidth, needW)
    }
  })

  const width = Math.ceil(minWidth)
  const height = Math.ceil((width * layout.aspectH) / layout.aspectW)
  return { width, height }
}

export function pageHasImages(slots: Slot[]): boolean {
  return slots.some((s) => s.assetId != null)
}
