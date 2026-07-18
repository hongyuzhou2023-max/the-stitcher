import UTIF from 'utif'
import type { Asset } from '../types'
import { uid } from '../utils/formatName'
import { closeBitmap, revokeUrl } from './memory'

const THUMB_MAX = 200
/** 画布预览足够清晰，避免用 200px 缩略图拉伸发糊 */
const PREVIEW_MAX = 2400

function isTiff(file: File): boolean {
  const name = file.name.toLowerCase()
  return (
    name.endsWith('.tif') ||
    name.endsWith('.tiff') ||
    file.type === 'image/tiff' ||
    file.type === 'image/tif'
  )
}

async function decodeTiff(file: File): Promise<ImageBitmap> {
  const buffer = await file.arrayBuffer()
  const ifds = UTIF.decode(buffer)
  if (!ifds.length) throw new Error('TIFF 无有效帧')
  UTIF.decodeImage(buffer, ifds[0])
  const rgba = UTIF.toRGBA8(ifds[0])
  const w = ifds[0].width
  const h = ifds[0].height
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建画布')
  const imageData = new ImageData(new Uint8ClampedArray(rgba), w, h)
  ctx.putImageData(imageData, 0, 0)
  return createImageBitmap(canvas)
}

async function decodeStandard(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file)
  } catch {
    const url = URL.createObjectURL(file)
    try {
      const img = await loadHtmlImage(url)
      return await createImageBitmap(img)
    } finally {
      URL.revokeObjectURL(url)
    }
  }
}

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = url
  })
}

async function resizeBitmap(
  source: ImageBitmap,
  maxEdge: number,
  quality: 'low' | 'medium' | 'high',
): Promise<ImageBitmap> {
  const scale = Math.min(1, maxEdge / Math.max(source.width, source.height))
  const w = Math.max(1, Math.round(source.width * scale))
  const h = Math.max(1, Math.round(source.height * scale))
  if (w === source.width && h === source.height) {
    return createImageBitmap(source)
  }
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('缩放失败')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = quality
  ctx.drawImage(source, 0, 0, w, h)
  try {
    return await createImageBitmap(canvas)
  } catch {
    return createImageBitmap(source, {
      resizeWidth: w,
      resizeHeight: h,
      resizeQuality: quality,
    })
  }
}

async function makeThumbUrl(thumb: ImageBitmap): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = thumb.width
  canvas.height = thumb.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('缩略图失败')
  ctx.drawImage(thumb, 0, 0)
  const blob = await new Promise<Blob | null>((res) =>
    canvas.toBlob(res, 'image/jpeg', 0.85),
  )
  if (!blob) throw new Error('缩略图编码失败')
  return URL.createObjectURL(blob)
}

export type LoadAssetResult =
  | { ok: true; asset: Asset }
  | { ok: false; fileName: string; message: string }

export async function loadAssetFromFile(file: File): Promise<LoadAssetResult> {
  let full: ImageBitmap | null = null
  try {
    if (isTiff(file)) {
      try {
        full = await decodeTiff(file)
      } catch {
        return {
          ok: false,
          fileName: file.name,
          message: `无法解析 TIFF「${file.name}」，请先转换为 JPG 或 PNG 后再导入。`,
        }
      }
    } else {
      try {
        full = await decodeStandard(file)
      } catch {
        return {
          ok: false,
          fileName: file.name,
          message: `无法加载「${file.name}」，请确认格式为 JPG / PNG（TIFF 可尝试转换）。`,
        }
      }
    }

    const preview = await resizeBitmap(full, PREVIEW_MAX, 'high')
    const thumb = await resizeBitmap(full, THUMB_MAX, 'medium')
    const thumbUrl = await makeThumbUrl(thumb)

    const asset: Asset = {
      id: uid('asset'),
      name: file.name,
      file,
      width: full.width,
      height: full.height,
      thumb,
      thumbUrl,
      preview,
    }
    closeBitmap(full)
    full = null
    return { ok: true, asset }
  } catch (e) {
    closeBitmap(full)
    return {
      ok: false,
      fileName: file.name,
      message: e instanceof Error ? e.message : '导入失败',
    }
  }
}

export function disposeAsset(asset: Asset) {
  closeBitmap(asset.thumb)
  closeBitmap(asset.preview)
  revokeUrl(asset.thumbUrl)
}
