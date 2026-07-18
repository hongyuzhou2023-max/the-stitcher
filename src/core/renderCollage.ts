import type { Asset, LayoutResult, Page } from '../types'
import { bitmapSource, drawCoverImage } from './coverDraw'
import { acquireFullBitmap, releaseFullBitmap } from '../image/decodeFull'
import { resolveDrawSlots } from './layouts'

export type RenderSources = Map<string, ImageBitmap>

export function prepareCanvas(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  width: number,
  height: number,
): CanvasRenderingContext2D {
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | null
  if (!ctx) throw new Error('无法获取 Canvas 上下文')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  return ctx
}

/**
 * Paint collage into ctx. If viewOffset is set, ctx is a tile whose top-left
 * maps to (viewOffset.x, viewOffset.y) in full-export coordinates.
 */
export function paintCollage(
  ctx: CanvasRenderingContext2D,
  layout: LayoutResult,
  page: Page,
  sources: RenderSources,
  exportW: number,
  exportH: number,
  viewOffset?: { x: number; y: number },
): void {
  const ox = viewOffset?.x ?? 0
  const oy = viewOffset?.y ?? 0
  const tileW = ctx.canvas.width
  const tileH = ctx.canvas.height

  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = layout.background
  ctx.fillRect(0, 0, tileW, tileH)

  ctx.setTransform(1, 0, 0, 1, -ox, -oy)

  const drawSlots = resolveDrawSlots(page, layout)
  page.slots.forEach((slot, i) => {
    const rect = drawSlots[i]
    if (!slot.assetId || !rect) return
    const bitmap = sources.get(slot.assetId)
    if (!bitmap) return
    drawCoverImage(
      ctx,
      bitmapSource(bitmap),
      rect,
      slot.transform,
      exportW,
      exportH,
    )
  })

  ctx.setTransform(1, 0, 0, 1, 0, 0)
}

export async function loadPageSources(
  page: Page,
  assets: Map<string, Asset>,
): Promise<{ sources: RenderSources; release: () => void }> {
  const ids = [
    ...new Set(page.slots.map((s) => s.assetId).filter(Boolean)),
  ] as string[]
  const sources: RenderSources = new Map()
  for (const id of ids) {
    const asset = assets.get(id)
    if (!asset) continue
    const bm = await acquireFullBitmap(id, asset.file)
    sources.set(id, bm)
  }
  return {
    sources,
    release: () => {
      for (const id of sources.keys()) releaseFullBitmap(id)
    },
  }
}

export async function renderPageToCanvas(
  canvas: HTMLCanvasElement,
  page: Page,
  layout: LayoutResult,
  assets: Map<string, Asset>,
  width: number,
  height: number,
): Promise<void> {
  const { sources, release } = await loadPageSources(page, assets)
  try {
    const ctx = prepareCanvas(canvas, width, height)
    paintCollage(ctx, layout, page, sources, width, height)
  } finally {
    release()
  }
}

/** 画布预览用高清 preview 位图；导出绝不读取此 canvas。 */
export function renderPreview(
  canvas: HTMLCanvasElement,
  page: Page,
  layout: LayoutResult,
  assets: Map<string, Asset>,
  cssWidth: number,
  cssHeight: number,
  dpr: number,
): void {
  const width = Math.max(1, Math.round(cssWidth * dpr))
  const height = Math.max(1, Math.round(cssHeight * dpr))
  const ctx = prepareCanvas(canvas, width, height)
  const sources: RenderSources = new Map()
  for (const slot of page.slots) {
    if (!slot.assetId) continue
    const asset = assets.get(slot.assetId)
    if (asset) sources.set(slot.assetId, asset.preview ?? asset.thumb)
  }
  paintCollage(ctx, layout, page, sources, width, height)
}
