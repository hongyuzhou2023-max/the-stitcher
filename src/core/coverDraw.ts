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
 * 照片投影：模仿外层画布卡片的柔和分层阴影
 * （对应 CSS `0 24px 64px / 0 6px 18px` 那种自然浮起感）。
 * 用 canvas shadowBlur 双层，主要向下、略偏右；照片随后盖住实体矩形。
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

  // 以短边为参照，按外框卡片阴影的大致比例缩放
  const ref = Math.min(dw, dh)
  const k = 0.4 + 0.6 * s

  const paintLayer = (
    offsetX: number,
    offsetY: number,
    blur: number,
    alpha: number,
  ) => {
    ctx.save()
    ctx.shadowColor = `rgba(0, 0, 0, ${alpha})`
    ctx.shadowBlur = blur
    ctx.shadowOffsetX = offsetX
    ctx.shadowOffsetY = offsetY
    // 实体矩形会被随后画上的照片完全盖住，只留下投影
    ctx.fillStyle = '#000000'
    ctx.fillRect(dx, dy, dw, dh)
    ctx.restore()
  }

  // 远层：大范围柔光（类 0 24px 64px）
  paintLayer(ref * 0.01 * k, ref * 0.055 * k, ref * 0.14 * k, 0.32 * k)
  // 近层：贴边收束（类 0 6px 18px）
  paintLayer(ref * 0.004 * k, ref * 0.018 * k, ref * 0.045 * k, 0.28 * k)
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
