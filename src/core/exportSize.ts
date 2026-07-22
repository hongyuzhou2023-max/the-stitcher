import type { Asset, ExportSizePreset, LayoutResult, Page, Slot } from '../types'
import { EXPORT_SIZE_CAPS } from '../types'
import { sourcePixelsForExport } from './coverDraw'
import { resolveDrawSlots } from './layouts'

const MIN_EXPORT_WIDTH = 1080

export function resolveExportSize(
  page: Page,
  layout: LayoutResult,
  assets: Map<string, Asset>,
  sizePreset: ExportSizePreset = 'original',
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

  let width = Math.ceil(minWidth)
  let height = Math.ceil((width * layout.aspectH) / layout.aspectW)

  // 按档位限制长边：小红书上传后会二次压缩，超大尺寸只会白白撑大文件、
  // 拖慢浏览器甚至在手机端因内存不足崩溃
  const cap = EXPORT_SIZE_CAPS[sizePreset]
  if (cap != null) {
    const longEdge = Math.max(width, height)
    if (longEdge > cap) {
      const k = cap / longEdge
      width = Math.max(1, Math.round(width * k))
      height = Math.max(1, Math.round(height * k))
    }
  }
  return { width, height }
}

export function pageHasImages(slots: Slot[]): boolean {
  return slots.some((s) => s.assetId != null)
}
