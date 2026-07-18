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

export function CanvasStage() {
  const pages = useAppStore((s) => s.pages)
  const activePageId = useAppStore((s) => s.activePageId)
  const assets = useAppStore((s) => s.assets)
  const selectedSlotIndex = useAppStore((s) => s.selectedSlotIndex)
  const setSelectedSlot = useAppStore((s) => s.setSelectedSlot)
  const placeAsset = useAppStore((s) => s.placeAsset)
  const t = useT()

  const page = pages.find((p) => p.id === activePageId)!
  const layout = useMemo(() => computeLayout(page.mode), [page.mode])
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
      </div>
    </div>
  )
}
