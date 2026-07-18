import UTIF from 'utif'
import { closeBitmap, decodeQueue } from './memory'

const cache = new Map<string, ImageBitmap>()
const refCount = new Map<string, number>()

function isTiff(file: File): boolean {
  const name = file.name.toLowerCase()
  return (
    name.endsWith('.tif') ||
    name.endsWith('.tiff') ||
    file.type === 'image/tiff' ||
    file.type === 'image/tif'
  )
}

async function decodeFile(file: File): Promise<ImageBitmap> {
  if (isTiff(file)) {
    const buffer = await file.arrayBuffer()
    const ifds = UTIF.decode(buffer)
    UTIF.decodeImage(buffer, ifds[0])
    const rgba = UTIF.toRGBA8(ifds[0])
    const w = ifds[0].width
    const h = ifds[0].height
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0)
    return createImageBitmap(canvas)
  }
  return createImageBitmap(file)
}

export async function acquireFullBitmap(
  assetId: string,
  file: File,
): Promise<ImageBitmap> {
  const existing = cache.get(assetId)
  if (existing) {
    refCount.set(assetId, (refCount.get(assetId) ?? 0) + 1)
    return existing
  }

  const bitmap = await decodeQueue.run(() => decodeFile(file))
  cache.set(assetId, bitmap)
  refCount.set(assetId, 1)
  return bitmap
}

export function releaseFullBitmap(assetId: string) {
  const n = (refCount.get(assetId) ?? 0) - 1
  if (n <= 0) {
    const bm = cache.get(assetId)
    closeBitmap(bm)
    cache.delete(assetId)
    refCount.delete(assetId)
  } else {
    refCount.set(assetId, n)
  }
}

export function purgeAllFullBitmaps() {
  for (const bm of cache.values()) closeBitmap(bm)
  cache.clear()
  refCount.clear()
}
