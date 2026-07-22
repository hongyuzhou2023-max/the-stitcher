export type Transform = {
  scale: number
  offsetX: number
  offsetY: number
  /** 顺时针角度（度） */
  rotation: number
}

export type Slot = {
  assetId: string | null
  transform: Transform
  /**
   * 仅白底 3:4：照片框相对布局格的缩放（0.4～1），默认 1。
   * 缩小后周围露出更多白边。
   */
  frameScale?: number
}

export const FRAME_SCALE_MIN = 0.4
export const FRAME_SCALE_MAX = 1
export const FRAME_SCALE_DEFAULT = 1

export type TemplateA = 'v' | 'h' | 'grid2'

export type ModeA = {
  type: 'A'
  template: TemplateA
  count: 1 | 2 | 3 | 4
  margin: number
  tight: boolean
}

export type ModeB = {
  type: 'B'
  count: 1 | 2 | 3
  gap: number
  tight: boolean
}

export type ModeC = {
  type: 'C'
  ratio: '9:19.5' | '9:16' | 'custom'
  customW: number
  customH: number
}

/** 黑底 3:4 + 19.5:9 壁纸横条堆叠（同电影感参数） */
export type ModeD = {
  type: 'D'
  count: 1 | 2 | 3
  gap: number
  tight: boolean
}

export type PageMode = ModeA | ModeB | ModeC | ModeD

export type Page = {
  id: string
  /** 用户自定义名；null 则按语言显示「拼图 n / Page n」 */
  customName: string | null
  mode: PageMode
  slots: Slot[]
}

export type Asset = {
  id: string
  name: string
  file: File
  width: number
  height: number
  thumb: ImageBitmap
  thumbUrl: string
  preview: ImageBitmap
}

export type Rect = {
  x: number
  y: number
  w: number
  h: number
}

export type LayoutResult = {
  aspectW: number
  aspectH: number
  background: string
  slots: Rect[]
}

/**
 * 导出格式：
 * - png：真无损，但胶片照片体积巨大
 * - jpeg：高质量 92%，与 100% 肉眼无差、体积约缩小 3-5 倍（推荐）
 * - jpeg100：Canvas 满档编码，体积极大，仅特殊需求使用
 */
export type ExportFormat = 'png' | 'jpeg' | 'jpeg100'

/** 高质量 JPEG 的编码质量（视觉无损区间） */
export const JPEG_HQ_QUALITY = 0.92

/**
 * 导出尺寸档位（限制长边像素）：
 * - original：按原图像素密度反推（旧行为，可能得到 6000+ px 巨图）
 * - 4k：长边 ≤ 4096（推荐；小红书上传后会再压缩，超过此尺寸无收益，
 *   且手机端可走单 Canvas 路径，避免分块渲染时内存爆掉导致浏览器崩溃）
 * - 2k：长边 ≤ 2048，最省空间
 */
export type ExportSizePreset = 'original' | '4k' | '2k'

export const EXPORT_SIZE_CAPS: Record<ExportSizePreset, number | null> = {
  original: null,
  '4k': 4096,
  '2k': 2048,
}

export type CanvasLimits = {
  maxSide: number
  maxArea: number
}

export type ExportPreviewItem = {
  name: string
  url: string
  blob: Blob
}

export const DEFAULT_TRANSFORM: Transform = {
  scale: 1,
  offsetX: 0.5,
  offsetY: 0.5,
  rotation: 0,
}

/** iPhone 壁纸竖版约 9:19.5，横置条带为 19.5:9 */
export const WALLPAPER_STRIP_ASPECT = 19.5 / 9

/**
 * 小红书「全屏笔记」安全画幅 9:16。
 * 对标实测：旧壁纸横幅导出 3:4（≈0.75）在全屏笔记里会被左右裁切；
 * 旧全屏竖版 9:19.5（≈0.46）又偏高，会被上下裁切。9:16（0.5625）完整呈现。
 */
export const XHS_FULLSCREEN_ASPECT_W = 9
export const XHS_FULLSCREEN_ASPECT_H = 16

export function createEmptySlots(count: number): Slot[] {
  return Array.from({ length: count }, () => ({
    assetId: null,
    transform: { ...DEFAULT_TRANSFORM },
  }))
}

export function defaultModeA(): ModeA {
  return {
    type: 'A',
    template: 'v',
    count: 2,
    margin: 0.05,
    tight: false,
  }
}

export function defaultModeB(): ModeB {
  return {
    type: 'B',
    count: 2,
    gap: 0.02,
    tight: false,
  }
}

export function defaultModeC(): ModeC {
  return {
    type: 'C',
    ratio: '9:16',
    customW: 9,
    customH: 16,
  }
}

export function defaultModeD(): ModeD {
  return {
    type: 'D',
    count: 2,
    gap: 0.1,
    tight: false,
  }
}

/** 壁纸横幅模式条间距滑杆上限（%）；默认 10%，故上限放宽到 20% */
export const WALLPAPER_GAP_MAX_PCT = 20

export function slotCountForMode(mode: PageMode): number {
  if (mode.type === 'C') return 1
  return mode.count
}
