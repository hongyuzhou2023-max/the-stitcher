import type { Rect, Transform } from '../types'

export type CoverSource = {
  width: number
  height: number
  drawFull: (ctx: CanvasRenderingContext2D) => void
}

export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

function normAngle(deg: number): number {
  let a = deg % 360
  if (a < 0) a += 360
  return a
}

/** 旋转后图像 AABB（未缩放） */
export function rotatedAabb(imgW: number, imgH: number, rotationDeg: number) {
  const rad = (normAngle(rotationDeg) * Math.PI) / 180
  const c = Math.abs(Math.cos(rad))
  const s = Math.abs(Math.sin(rad))
  return {
    w: imgW * c + imgH * s,
    h: imgW * s + imgH * c,
  }
}

/**
 * 槽内 cover + 用户缩放/平移/旋转。
 * 旋转绕槽中心；缩放保证旋转后仍铺满槽位。
 */
export function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  source: CoverSource,
  slot: Rect,
  transform: Transform,
  canvasW: number,
  canvasH: number,
): void {
  const dx = slot.x * canvasW
  const dy = slot.y * canvasH
  const dw = slot.w * canvasW
  const dh = slot.h * canvasH
  if (dw < 1 || dh < 1) return

  const rotation = transform.rotation ?? 0
  const aabb = rotatedAabb(source.width, source.height, rotation)
  const base = Math.max(dw / Math.max(aabb.w, 1e-6), dh / Math.max(aabb.h, 1e-6))
  const scale = base * Math.max(1, transform.scale)

  const drawnW = source.width * scale
  const drawnH = source.height * scale
  // 在未旋转平面上的可平移余量（近似，保证手感稳定）
  const overflowX = Math.max(0, drawnW - dw)
  const overflowY = Math.max(0, drawnH - dh)
  const panX = (0.5 - clamp01(transform.offsetX)) * overflowX
  const panY = (0.5 - clamp01(transform.offsetY)) * overflowY

  ctx.save()
  ctx.beginPath()
  ctx.rect(dx, dy, dw, dh)
  ctx.clip()
  ctx.translate(dx + dw / 2, dy + dh / 2)
  ctx.rotate((normAngle(rotation) * Math.PI) / 180)
  ctx.translate(-drawnW / 2 + panX, -drawnH / 2 + panY)
  ctx.scale(scale, scale)
  source.drawFull(ctx)
  ctx.restore()
}

/**
 * 斜向下投影阴影（画在照片之前，不进入 clip）。
 * 同尺寸矩形向右下偏移 + 模糊，给整张照片立体浮起感。
 * strength 0～1。
 */
export function drawSlotShadow(
  ctx: CanvasRenderingContext2D,
  slot: Rect,
  strength: number,
  canvasW: number,
  canvasH: number,
): void {
  const s = Math.min(1, Math.max(0, strength))
  if (s < 0.01) return

  const dx = slot.x * canvasW
  const dy = slot.y * canvasH
  const dw = slot.w * canvasW
  const dh = slot.h * canvasH
  if (dw < 2 || dh < 2) return

  // 斜向下（右下）偏移：随强度与槽位尺寸缩放
  const minSide = Math.min(dw, dh)
  const offset = Math.max(3, minSide * (0.018 + 0.055 * s))
  const blur = Math.max(4, minSide * (0.03 + 0.1 * s))
  const alpha = 0.18 + 0.42 * s

  ctx.save()
  ctx.filter = `blur(${blur}px)`
  ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`
  // 与照片同形的矩形，向右下偏移，形成经典 drop shadow
  ctx.fillRect(dx + offset, dy + offset, dw, dh)
  ctx.restore()
}

/** 导出尺寸估算：槽位需覆盖的源像素（考虑旋转 AABB） */
export function sourcePixelsForExport(
  imgW: number,
  imgH: number,
  transform: Transform,
): { sw: number; sh: number } {
  const aabb = rotatedAabb(imgW, imgH, transform.rotation ?? 0)
  const scale = Math.max(1, transform.scale)
  // 用户放大 = 看见更少源像素
  return {
    sw: aabb.w / scale,
    sh: aabb.h / scale,
  }
}

export function bitmapSource(bitmap: ImageBitmap): CoverSource {
  return {
    width: bitmap.width,
    height: bitmap.height,
    drawFull: (ctx) => {
      ctx.drawImage(bitmap, 0, 0)
    },
  }
}
