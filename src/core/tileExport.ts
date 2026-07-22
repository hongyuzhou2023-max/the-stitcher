import type { Asset, CanvasLimits, ExportFormat, LayoutResult, Page } from '../types'
import { JPEG_HQ_QUALITY } from '../types'
import { clampToLimits, fitsCanvasLimits } from './canvasProbe'
import {
  loadPageSources,
  paintCollage,
  prepareCanvas,
  type RenderSources,
} from './renderCollage'

export type TileExportResult =
  | { ok: true; blob: Blob; width: number; height: number; tiled: boolean }
  | { ok: false; reason: 'memory'; message: string }
  | {
      ok: false
      reason: 'needs_confirm'
      message: string
      maxSide: number
      suggestedWidth: number
      suggestedHeight: number
    }

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('toBlob 失败'))
      },
      type,
      quality,
    )
  })
}

function pickTileSize(limits: CanvasLimits): number {
  // Leave headroom for browser quirks
  return Math.max(512, Math.floor(Math.min(limits.maxSide, Math.sqrt(limits.maxArea)) * 0.9))
}

async function exportViaSingleCanvas(
  page: Page,
  layout: LayoutResult,
  assets: Map<string, Asset>,
  width: number,
  height: number,
  mime: string,
  quality: number | undefined,
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  const { sources, release } = await loadPageSources(page, assets)
  try {
    const ctx = prepareCanvas(canvas, width, height)
    paintCollage(ctx, layout, page, sources, width, height)
    return await canvasToBlob(canvas, mime, quality)
  } finally {
    release()
    canvas.width = 0
    canvas.height = 0
  }
}

/**
 * Tile-render into a large RGBA buffer, then encode by slicing into
 * max-size strips written through a temporary canvas (JPEG/PNG per strip
 * is not ideal for one file). For a single blob we reassemble onto the
 * largest feasible canvas if area allows, else encode via ImageData strips
 * merged into one canvas when width*height fits after clamping — here we
 * try full buffer + encode on a canvas of export size when possible.
 */
async function exportViaTiles(
  page: Page,
  layout: LayoutResult,
  assets: Map<string, Asset>,
  width: number,
  height: number,
  limits: CanvasLimits,
  mime: string,
  quality: number | undefined,
): Promise<TileExportResult> {
  const tileSize = pickTileSize(limits)
  let buffer: Uint8ClampedArray
  try {
    buffer = new Uint8ClampedArray(width * height * 4)
  } catch {
    return {
      ok: false,
      reason: 'memory',
      message: `无法分配 ${width}×${height} 像素缓冲，内存不足。`,
    }
  }

  const { sources, release } = await loadPageSources(page, assets)
  const tileCanvas = document.createElement('canvas')

  try {
    for (let y = 0; y < height; y += tileSize) {
      for (let x = 0; x < width; x += tileSize) {
        const tw = Math.min(tileSize, width - x)
        const th = Math.min(tileSize, height - y)
        const ctx = prepareCanvas(tileCanvas, tw, th)
        paintCollage(ctx, layout, page, sources, width, height, { x, y })
        const img = ctx.getImageData(0, 0, tw, th)
        for (let row = 0; row < th; row++) {
          const srcStart = row * tw * 4
          const dstStart = ((y + row) * width + x) * 4
          buffer.set(img.data.subarray(srcStart, srcStart + tw * 4), dstStart)
        }
      }
    }

    // Encode: need a canvas that can hold full image, OR strip-encode.
    // If full size doesn't fit, try encoding via Offscreen / progressive putImageData on max canvas — won't work for one PNG.
    // Strategy: if full fits area after all, use it; else fail to needs_confirm
    // (caller already tried single; we're here because side/area exceeded).
    // Attempt encode by creating canvas of export size — may fail on iOS.
    if (fitsCanvasLimits(width, height, limits)) {
      const out = document.createElement('canvas')
      const ctx = prepareCanvas(out, width, height)
      ctx.putImageData(new ImageData(buffer as unknown as ImageDataArray, width, height), 0, 0)
      const blob = await canvasToBlob(out, mime, quality)
      out.width = 0
      out.height = 0
      return { ok: true, blob, width, height, tiled: true }
    }

    // Encode in horizontal bands into a canvas of (width x bandH), then
    // use a PNG encoder workaround: stitch blobs is hard. Prefer putImageData
    // onto largest canvas that fits and... can't produce full res file.
    // Use createImageBitmap from ImageData chunks? 
    // Best effort: encode full ImageData through a canvas sized to limits by
    // failing over — return needs_confirm.
    // Actually: we can use `new Blob` with manually built PNG via UPNG if we add it.
    // Keep dependency light: try OffscreenCanvas if available with full size.
    if (typeof OffscreenCanvas !== 'undefined') {
      try {
        const off = new OffscreenCanvas(width, height)
        const ctx = off.getContext('2d')
        if (ctx) {
          ctx.putImageData(
            new ImageData(buffer as unknown as ImageDataArray, width, height),
            0,
            0,
          )
          const blob = await off.convertToBlob({
            type: mime,
            quality,
          })
          return { ok: true, blob, width, height, tiled: true }
        }
      } catch {
        /* fall through */
      }
    }

    return {
      ok: false,
      reason: 'needs_confirm',
      message: `目标尺寸 ${width}×${height} 超出当前设备 Canvas 上限（约 ${limits.maxSide} px）。分块像素已算出但无法在本机编码为完整图片，建议在电脑上导出。`,
      maxSide: limits.maxSide,
      suggestedWidth: Math.min(width, limits.maxSide),
      suggestedHeight: Math.min(
        height,
        Math.floor(limits.maxSide * (height / width)),
      ),
    }
  } catch (e) {
    return {
      ok: false,
      reason: 'memory',
      message:
        e instanceof Error
          ? e.message
          : '分块渲染失败，可能因内存不足。',
    }
  } finally {
    release()
    tileCanvas.width = 0
    tileCanvas.height = 0
  }
}

export async function exportCollageBlob(
  page: Page,
  layout: LayoutResult,
  assets: Map<string, Asset>,
  width: number,
  height: number,
  limits: CanvasLimits,
  format: ExportFormat,
  allowDownscale: boolean,
): Promise<TileExportResult> {
  const mime = format === 'png' ? 'image/png' : 'image/jpeg'
  const quality =
    format === 'jpeg100' ? 1.0 : format === 'jpeg' ? JPEG_HQ_QUALITY : undefined

  let targetW = width
  let targetH = height

  if (!fitsCanvasLimits(targetW, targetH, limits)) {
    if (!allowDownscale) {
      // Try tile path for full resolution
      const tiled = await exportViaTiles(
        page,
        layout,
        assets,
        targetW,
        targetH,
        limits,
        mime,
        quality,
      )
      if (tiled.ok) return tiled
      if (tiled.reason === 'needs_confirm' || tiled.reason === 'memory') {
        return tiled
      }
    } else {
      const clamped = clampToLimits(targetW, targetH, limits)
      targetW = clamped.width
      targetH = clamped.height
    }
  }

  if (!fitsCanvasLimits(targetW, targetH, limits)) {
    return {
      ok: false,
      reason: 'needs_confirm',
      message: `导出尺寸 ${width}×${height} 超出设备上限（最大边约 ${limits.maxSide} px）。`,
      maxSide: limits.maxSide,
      suggestedWidth: Math.min(width, limits.maxSide),
      suggestedHeight: Math.min(
        height,
        Math.floor((limits.maxSide * height) / width),
      ),
    }
  }

  try {
    const blob = await exportViaSingleCanvas(
      page,
      layout,
      assets,
      targetW,
      targetH,
      mime,
      quality,
    )
    return {
      ok: true,
      blob,
      width: targetW,
      height: targetH,
      tiled: false,
    }
  } catch (e) {
    // Retry with tiles
    const tiled = await exportViaTiles(
      page,
      layout,
      assets,
      targetW,
      targetH,
      limits,
      mime,
      quality,
    )
    if (tiled.ok) return tiled
    return {
      ok: false,
      reason: 'memory',
      message:
        e instanceof Error ? e.message : '导出失败，请尝试较小尺寸或改用电脑。',
    }
  }
}

export async function paintTileForTest(
  sources: RenderSources,
  page: Page,
  layout: LayoutResult,
  exportW: number,
  exportH: number,
  x: number,
  y: number,
  tw: number,
  th: number,
): Promise<ImageData> {
  const canvas = document.createElement('canvas')
  const ctx = prepareCanvas(canvas, tw, th)
  paintCollage(ctx, layout, page, sources, exportW, exportH, { x, y })
  return ctx.getImageData(0, 0, tw, th)
}
