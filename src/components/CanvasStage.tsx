import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../store/appStore'
import { useT } from '../i18n/useT'
import { computeLayout, resolveDrawSlots } from '../core/layouts'
import { renderPreview } from '../core/renderCollage'
import { useSlotGestures } from '../gestures/useSlotGestures'

function fitCanvas(
  availW: number,
  availH: number,
  aspectW: number,
  aspectH: number,
): { width: number; height: number } {
  const aspect = aspectW / aspectH
  // 先按高度适配（竖版 3:4 常见瓶颈），再按宽度夹紧，保证完整可见
  let height = availH
  let width = height * aspect
  if (width > availW) {
    width = availW
    height = width / aspect
  }
  return {
    width: Math.max(1, Math.floor(width)),
    height: Math.max(1, Math.floor(height)),
  }
}

/** 相邻两个槽位之间的互换按钮位置（画布百分比坐标） */
function swapButtonPos(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): { cx: number; cy: number; vertical: boolean } {
  const dx = b.x + b.w / 2 - (a.x + a.w / 2)
  const dy = b.y + b.h / 2 - (a.y + a.h / 2)
  const vertical = Math.abs(dy) >= Math.abs(dx)
  if (vertical) {
    // 上下相邻：按钮放在两图交界处、靠右侧
    return {
      cx: Math.min(a.x + a.w, b.x + b.w),
      cy: (a.y + a.h + b.y) / 2,
      vertical: true,
    }
  }
  // 左右相邻：按钮放在两图交界处、垂直居中
  return {
    cx: (a.x + a.w + b.x) / 2,
    cy: (Math.max(a.y, b.y) + Math.min(a.y + a.h, b.y + b.h)) / 2,
    vertical: false,
  }
}

export function CanvasStage() {
  const pages = useAppStore((s) => s.pages)
  const activePageId = useAppStore((s) => s.activePageId)
  const assets = useAppStore((s) => s.assets)
  const selectedSlotIndex = useAppStore((s) => s.selectedSlotIndex)
  const setSelectedSlot = useAppStore((s) => s.setSelectedSlot)
  const placeAsset = useAppStore((s) => s.placeAsset)
  const swapSlots = useAppStore((s) => s.swapSlots)
  const t = useT()

  const page = pages.find((p) => p.id === activePageId)!
  const layout = useMemo(
    () => computeLayout(page.mode, page.backgroundColor),
    [page.mode, page.backgroundColor],
  )
  const drawSlots = useMemo(
    () => resolveDrawSlots(page, layout),
    [page, layout],
  )

  const containerRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [cssSize, setCssSize] = useState({ width: 300, height: 400 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => {
      const style = getComputedStyle(el)
      const padX =
        (parseFloat(style.paddingLeft) || 0) +
        (parseFloat(style.paddingRight) || 0)
      const padY =
        (parseFloat(style.paddingTop) || 0) +
        (parseFloat(style.paddingBottom) || 0)
      const aw = Math.max(0, el.clientWidth - padX)
      const ah = Math.max(0, el.clientHeight - padY)
      if (aw < 2 || ah < 2) return
      setCssSize(fitCanvas(aw, ah, layout.aspectW, layout.aspectH))
    }
    update()
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(update)
    })
    ro.observe(el)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [layout.aspectW, layout.aspectH])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const map = new Map(assets.map((a) => [a.id, a]))
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    renderPreview(
      canvas,
      page,
      layout,
      map,
      cssSize.width,
      cssSize.height,
      dpr,
    )
  }, [page, layout, assets, cssSize, selectedSlotIndex])

  useSlotGestures({
    canvasRef,
    containerRef: frameRef,
    page,
    layout,
    cssWidth: cssSize.width,
    cssHeight: cssSize.height,
  })

  return (
    <div className="canvas-stage" ref={containerRef}>
      <div
        className="canvas-frame"
        ref={frameRef}
        style={{ width: cssSize.width, height: cssSize.height }}
      >
        <canvas ref={canvasRef} />
        {drawSlots.map((slot, i) => {
          const empty = !page.slots[i]?.assetId
          return (
            <div
              key={i}
              className={`slot-overlay ${i === selectedSlotIndex ? 'active' : ''} ${empty ? 'empty' : ''}`}
              style={{
                left: `${slot.x * 100}%`,
                top: `${slot.y * 100}%`,
                width: `${slot.w * 100}%`,
                height: `${slot.h * 100}%`,
              }}
              onPointerDown={() => setSelectedSlot(i)}
              onDragOver={(e) => {
                const ok =
                  e.dataTransfer.types.includes('application/x-xhs-asset') ||
                  e.dataTransfer.types.includes('text/plain')
                if (!ok) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'copy'
              }}
              onDrop={(e) => {
                const assetId =
                  e.dataTransfer.getData('application/x-xhs-asset') ||
                  e.dataTransfer.getData('text/plain')
                if (!assetId) return
                e.preventDefault()
                e.stopPropagation()
                placeAsset(assetId, i)
              }}
            >
              {empty && (
                <span className="slot-hint">{t('slotLabel', { n: i + 1 })}</span>
              )}
            </div>
          )
        })}
        {drawSlots.slice(0, -1).map((a, i) => {
          const b = drawSlots[i + 1]
          // 两个槽位都为空时没有可交换的内容，不显示按钮
          const hasContent =
            page.slots[i]?.assetId != null || page.slots[i + 1]?.assetId != null
          if (!hasContent) return null
          const pos = swapButtonPos(a, b)
          return (
            <button
              key={`swap-${i}`}
              type="button"
              className="slot-swap-btn"
              title={t('swapOrder')}
              aria-label={t('swapOrder')}
              style={{
                left: pos.vertical
                  ? `calc(${pos.cx * 100}% - 26px)`
                  : `${pos.cx * 100}%`,
                top: `${pos.cy * 100}%`,
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                swapSlots(i, i + 1)
              }}
            >
              <svg
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={pos.vertical ? undefined : { transform: 'rotate(90deg)' }}
              >
                <path d="M5.5 2.5v9M5.5 2.5 3 5M5.5 2.5 8 5" />
                <path d="M10.5 13.5v-9M10.5 13.5 8 11M10.5 13.5 13 11" />
              </svg>
            </button>
          )
        })}
      </div>
    </div>
  )
}
