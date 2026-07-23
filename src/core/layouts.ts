import type { LayoutResult, Page, PageMode, Rect } from '../types'
import {
  defaultBackgroundForMode,
  FRAME_SCALE_DEFAULT,
  FRAME_SCALE_MAX,
  FRAME_SCALE_MIN,
  WALLPAPER_STRIP_ASPECT,
  XHS_FULLSCREEN_ASPECT_H,
  XHS_FULLSCREEN_ASPECT_W,
} from '../types'

/** 白底模式下按每槽 frameScale 缩小照片框（居中，余量留白） */
export function resolveDrawSlots(page: Page, layout: LayoutResult): Rect[] {
  if (page.mode.type !== 'A') return layout.slots
  return layout.slots.map((cell, i) => {
    const raw = page.slots[i]?.frameScale ?? FRAME_SCALE_DEFAULT
    const scale = Math.min(FRAME_SCALE_MAX, Math.max(FRAME_SCALE_MIN, raw))
    if (scale >= 0.999) return cell
    const w = cell.w * scale
    const h = cell.h * scale
    return {
      x: cell.x + (cell.w - w) / 2,
      y: cell.y + (cell.h - h) / 2,
      w,
      h,
    }
  })
}

function aspectForMode(mode: PageMode): { aspectW: number; aspectH: number } {
  // A/B/D：普通笔记竖屏 3:4
  if (mode.type === 'A' || mode.type === 'B' || mode.type === 'D') {
    return { aspectW: 3, aspectH: 4 }
  }
  // E：竖图加框
  if (mode.type === 'E') {
    if (mode.ratio === '3:4') return { aspectW: 3, aspectH: 4 }
    if (mode.ratio === '9:16') {
      return {
        aspectW: XHS_FULLSCREEN_ASPECT_W,
        aspectH: XHS_FULLSCREEN_ASPECT_H,
      }
    }
    return { aspectW: 9, aspectH: 19.5 }
  }
  // C：全屏笔记
  if (mode.ratio === '9:19.5') return { aspectW: 9, aspectH: 19.5 }
  if (mode.ratio === '9:16') {
    return {
      aspectW: XHS_FULLSCREEN_ASPECT_W,
      aspectH: XHS_FULLSCREEN_ASPECT_H,
    }
  }
  const w = Math.max(0.01, mode.customW)
  const h = Math.max(0.01, mode.customH)
  return { aspectW: w, aspectH: h }
}

function layoutA(mode: Extract<PageMode, { type: 'A' }>): Rect[] {
  const count = mode.count
  const margin = mode.tight ? 0 : mode.margin
  const gap = mode.tight ? 0 : margin
  const innerW = 1 - 2 * margin
  const innerH = 1 - 2 * margin

  if (count === 1) {
    return [{ x: margin, y: margin, w: innerW, h: innerH }]
  }

  if (mode.template === 'grid2' || count === 4) {
    const cols = 2
    const rows = count === 3 ? 2 : Math.ceil(count / 2)
    const cellW = (innerW - gap * (cols - 1)) / cols
    const cellH = (innerH - gap * (rows - 1)) / rows
    const slots: Rect[] = []
    for (let i = 0; i < count; i++) {
      const col = i % cols
      const row = Math.floor(i / cols)
      if (count === 3 && i === 2) {
        slots.push({
          x: margin + (innerW - cellW) / 2,
          y: margin + row * (cellH + gap),
          w: cellW,
          h: cellH,
        })
      } else {
        slots.push({
          x: margin + col * (cellW + gap),
          y: margin + row * (cellH + gap),
          w: cellW,
          h: cellH,
        })
      }
    }
    return slots
  }

  if (mode.template === 'h') {
    const cellW = (innerW - gap * (count - 1)) / count
    return Array.from({ length: count }, (_, i) => ({
      x: margin + i * (cellW + gap),
      y: margin,
      w: cellW,
      h: innerH,
    }))
  }

  const cellH = (innerH - gap * (count - 1)) / count
  return Array.from({ length: count }, (_, i) => ({
    x: margin,
    y: margin + i * (cellH + gap),
    w: innerW,
    h: cellH,
  }))
}

/** 黑底画布内垂直堆叠固定比例横条；canvasAspect = 画布宽/高 */
function layoutStrips(
  count: number,
  gapNorm: number,
  stripAspect: number,
  canvasAspect: number,
): Rect[] {
  const stripW = 1
  const stripH = (stripW * canvasAspect) / stripAspect
  const totalH = count * stripH + (count - 1) * gapNorm
  // 若条带总高超出画布（间距过大），等比压缩间距与条带高度以完整装入
  let scale = 1
  if (totalH > 1) scale = 1 / totalH
  const h = stripH * scale
  const g = gapNorm * scale
  const startY = Math.max(0, (1 - (count * h + (count - 1) * g)) / 2)

  return Array.from({ length: count }, (_, i) => ({
    x: 0,
    y: startY + i * (h + g),
    w: stripW,
    h,
  }))
}

function layoutFull(): Rect[] {
  return [{ x: 0, y: 0, w: 1, h: 1 }]
}

/** 竖图加框：单槽居中，四周留白为「框」 */
function layoutFramed(mode: Extract<PageMode, { type: 'E' }>): Rect[] {
  const margin = mode.tight ? 0 : mode.margin
  const innerW = 1 - 2 * margin
  const innerH = 1 - 2 * margin
  return [{ x: margin, y: margin, w: innerW, h: innerH }]
}

export function computeLayout(
  mode: PageMode,
  backgroundColor?: string | null,
): LayoutResult {
  const { aspectW, aspectH } = aspectForMode(mode)
  const background =
    backgroundColor?.trim() || defaultBackgroundForMode(mode)

  if (mode.type === 'A') {
    return {
      aspectW,
      aspectH,
      background,
      slots: layoutA(mode),
    }
  }
  if (mode.type === 'B') {
    const gap = mode.tight ? 0 : mode.gap
    return {
      aspectW,
      aspectH,
      background,
      slots: layoutStrips(mode.count, gap, 16 / 9, aspectW / aspectH),
    }
  }
  if (mode.type === 'D') {
    const gap = mode.tight ? 0 : mode.gap
    return {
      aspectW,
      aspectH,
      background,
      slots: layoutStrips(
        mode.count,
        gap,
        WALLPAPER_STRIP_ASPECT,
        aspectW / aspectH,
      ),
    }
  }
  if (mode.type === 'E') {
    return {
      aspectW,
      aspectH,
      background,
      slots: layoutFramed(mode),
    }
  }
  return {
    aspectW,
    aspectH,
    background,
    slots: layoutFull(),
  }
}

export function canvasPixelSize(
  aspectW: number,
  aspectH: number,
  exportWidth: number,
): { width: number; height: number } {
  const width = Math.max(1, Math.round(exportWidth))
  const height = Math.max(1, Math.round((width * aspectH) / aspectW))
  return { width, height }
}
