import type { CanvasLimits } from '../types'

let cached: CanvasLimits | null = null
let probing: Promise<CanvasLimits> | null = null

function canCreateCanvas(size: number): boolean {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return false
    ctx.fillStyle = '#010101'
    ctx.fillRect(0, 0, 1, 1)
    const data = ctx.getImageData(0, 0, 1, 1).data
    const ok = data[0] === 1
    canvas.width = 0
    canvas.height = 0
    return ok
  } catch {
    return false
  }
}

function canCreateArea(width: number, height: number): boolean {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return false
    ctx.fillStyle = '#020202'
    ctx.fillRect(0, 0, 1, 1)
    const data = ctx.getImageData(0, 0, 1, 1).data
    const ok = data[0] === 2
    canvas.width = 0
    canvas.height = 0
    return ok
  } catch {
    return false
  }
}

function binarySearchMaxSide(low: number, high: number): number {
  let lo = low
  let hi = high
  let best = low
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (canCreateCanvas(mid)) {
      best = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return best
}

function binarySearchMaxArea(maxSide: number): number {
  // Probe max square area first, then try wider rectangles up to maxSide.
  let lo = 1
  let hi = maxSide * maxSide
  let best = maxSide * maxSide
  // Verify square at maxSide already worked; find if area is further limited
  // by testing decreasing dimensions for non-square.
  // Conservative: use maxSide^2 if square works; also test 1 x area edge cases.
  if (canCreateArea(maxSide, maxSide)) {
    // Try larger area via non-square? Usually side limit dominates.
    return maxSide * maxSide
  }
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    const side = Math.floor(Math.sqrt(mid))
    if (side > 0 && canCreateArea(side, side)) {
      best = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return best
}

export async function probeCanvasLimits(): Promise<CanvasLimits> {
  if (cached) return cached
  if (probing) return probing

  probing = (async () => {
    // Yield so UI can paint first
    await new Promise((r) => setTimeout(r, 0))
    const maxSide = binarySearchMaxSide(1024, 16384)
    const maxArea = binarySearchMaxArea(maxSide)
    cached = { maxSide, maxArea }
    probing = null
    return cached
  })()

  return probing
}

export function getCachedCanvasLimits(): CanvasLimits | null {
  return cached
}

export function fitsCanvasLimits(
  width: number,
  height: number,
  limits: CanvasLimits,
): boolean {
  return (
    width <= limits.maxSide &&
    height <= limits.maxSide &&
    width * height <= limits.maxArea
  )
}

export function clampToLimits(
  width: number,
  height: number,
  limits: CanvasLimits,
): { width: number; height: number } {
  const aspect = width / height
  let w = width
  let h = height

  if (w > limits.maxSide) {
    w = limits.maxSide
    h = Math.floor(w / aspect)
  }
  if (h > limits.maxSide) {
    h = limits.maxSide
    w = Math.floor(h * aspect)
  }
  if (w * h > limits.maxArea) {
    const scale = Math.sqrt(limits.maxArea / (w * h))
    w = Math.floor(w * scale)
    h = Math.floor(h * scale)
  }
  return { width: Math.max(1, w), height: Math.max(1, h) }
}
