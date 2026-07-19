import { useEffect, useRef } from 'react'
import type { LayoutResult, Page, Rect } from '../types'
import { clamp01 } from '../core/coverDraw'
import { resolveDrawSlots } from '../core/layouts'
import { useAppStore } from '../store/appStore'

type Options = {
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  containerRef: React.RefObject<HTMLElement | null>
  page: Page
  layout: LayoutResult
  cssWidth: number
  cssHeight: number
}

function hitTestSlot(nx: number, ny: number, slots: Rect[]): number {
  for (let i = slots.length - 1; i >= 0; i--) {
    const r = slots[i]
    if (nx >= r.x && nx <= r.x + r.w && ny >= r.y && ny <= r.y + r.h) {
      return i
    }
  }
  return -1
}

export function useSlotGestures({
  canvasRef,
  containerRef,
  page,
  layout,
  cssWidth,
  cssHeight,
}: Options) {
  const pageRef = useRef(page)
  const layoutRef = useRef(layout)
  pageRef.current = page
  layoutRef.current = layout
  void cssWidth
  void cssHeight

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const pointers = new Map<number, { x: number; y: number }>()
    let mode: 'none' | 'pan' | 'pinch' = 'none'
    let slotIndex = -1
    let lastX = 0
    let lastY = 0
    let pinchStartDist = 0
    let startScale = 1

    const drawSlots = () =>
      resolveDrawSlots(pageRef.current, layoutRef.current)

    const toNorm = (clientX: number, clientY: number) => {
      const canvas = canvasRef.current
      const cr = canvas?.getBoundingClientRect() ?? el.getBoundingClientRect()
      return {
        x: (clientX - cr.left) / Math.max(cr.width, 1),
        y: (clientY - cr.top) / Math.max(cr.height, 1),
      }
    }

    const onPointerDown = (e: PointerEvent) => {
      // 互换按钮的点击不能被手势层捕获：setPointerCapture 会把 pointerup
      // 劫持到容器上，导致按钮永远收不到完整 click
      if ((e.target as HTMLElement).closest?.('.slot-swap-btn')) return
      el.setPointerCapture(e.pointerId)
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

      if (pointers.size === 1) {
        const n = toNorm(e.clientX, e.clientY)
        const hit = hitTestSlot(n.x, n.y, drawSlots())
        if (hit >= 0 && pageRef.current.slots[hit]?.assetId) {
          slotIndex = hit
          mode = 'pan'
          lastX = e.clientX
          lastY = e.clientY
          useAppStore.getState().setSelectedSlot(hit)
        }
      } else if (pointers.size === 2) {
        const pts = [...pointers.values()]
        pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
        if (slotIndex < 0) {
          const n = toNorm(
            (pts[0].x + pts[1].x) / 2,
            (pts[0].y + pts[1].y) / 2,
          )
          slotIndex = hitTestSlot(n.x, n.y, drawSlots())
        }
        if (slotIndex >= 0 && pageRef.current.slots[slotIndex]?.assetId) {
          mode = 'pinch'
          startScale = pageRef.current.slots[slotIndex].transform.scale
          useAppStore.getState().setSelectedSlot(slotIndex)
        }
      }
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

      if (mode === 'pan' && pointers.size === 1 && slotIndex >= 0) {
        const slot = pageRef.current.slots[slotIndex]
        const rect = drawSlots()[slotIndex]
        if (!slot?.assetId || !rect) return
        const dx = e.clientX - lastX
        const dy = e.clientY - lastY
        lastX = e.clientX
        lastY = e.clientY
        const cr = canvasRef.current?.getBoundingClientRect()
        if (!cr) return
        const sensitivity = 1 / (slot.transform.scale || 1)
        useAppStore.getState().updateSlotTransform(slotIndex, {
          offsetX: clamp01(
            slot.transform.offsetX -
              (dx / (cr.width * Math.max(rect.w, 0.01))) * sensitivity,
          ),
          offsetY: clamp01(
            slot.transform.offsetY -
              (dy / (cr.height * Math.max(rect.h, 0.01))) * sensitivity,
          ),
        })
      } else if (mode === 'pinch' && pointers.size >= 2 && slotIndex >= 0) {
        const pts = [...pointers.values()]
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
        if (pinchStartDist > 0) {
          const next = Math.min(
            20,
            Math.max(1, startScale * (dist / pinchStartDist)),
          )
          useAppStore.getState().updateSlotTransform(slotIndex, { scale: next })
        }
      }
    }

    const onPointerUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      try {
        el.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      if (pointers.size < 2 && mode === 'pinch') {
        mode = pointers.size === 1 ? 'pan' : 'none'
        if (pointers.size === 1) {
          const pt = [...pointers.values()][0]
          lastX = pt.x
          lastY = pt.y
        }
      }
      if (pointers.size === 0) {
        mode = 'none'
        slotIndex = -1
      }
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const n = toNorm(e.clientX, e.clientY)
      const hit = hitTestSlot(n.x, n.y, drawSlots())
      if (hit < 0) return
      const slot = pageRef.current.slots[hit]
      if (!slot?.assetId) return
      const delta = e.deltaY > 0 ? -0.08 : 0.08
      const next = Math.min(20, Math.max(1, slot.transform.scale + delta))
      useAppStore.getState().setSelectedSlot(hit)
      useAppStore.getState().updateSlotTransform(hit, { scale: next })
    }

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('pointercancel', onPointerUp)
    el.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('pointercancel', onPointerUp)
      el.removeEventListener('wheel', onWheel)
    }
  }, [canvasRef, containerRef])
}
