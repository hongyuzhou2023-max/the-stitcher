export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const iOSDevice = /iPad|iPhone|iPod/.test(ua)
  const iPadOS =
    navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  return iOSDevice || iPadOS
}

export function isMobileViewport(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(max-width: 1023px)').matches
}

/**
 * 手机/平板判定（与桌面区分的依据）：
 * iOS 一律算；其余按 UA 含移动端关键字 且 主输入是触屏（pointer: coarse）。
 * 微信等内嵌浏览器下载不可靠，触屏设备统一走“长按保存”流程。
 */
export function isMobileLike(): boolean {
  if (typeof navigator === 'undefined') return false
  if (isIOS()) return true
  const uaMobile = /Android|Mobile|HarmonyOS/i.test(navigator.userAgent)
  const coarse =
    typeof window !== 'undefined' &&
    window.matchMedia('(pointer: coarse)').matches
  return uaMobile && coarse
}

export function prefersZipDownload(): boolean {
  return !isMobileLike()
}
