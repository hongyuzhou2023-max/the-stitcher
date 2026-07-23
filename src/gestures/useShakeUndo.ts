import { useEffect, useRef } from 'react'
import { useAppStore } from '../store/appStore'
import { isMobileLike } from '../utils/platform'
import { t } from '../i18n/messages'

const SHAKE_THRESHOLD = 18
const SHAKE_COOLDOWN_MS = 1200

type DeviceMotionPermission = {
  requestPermission?: () => Promise<'granted' | 'denied' | 'default'>
}

/**
 * 手机摇一摇撤销。iOS 需用户手势触发 requestPermission。
 * 返回 ensurePermission：在用户点击「撤销」或打开参数页时调用。
 */
export function useShakeUndo() {
  const lastShake = useRef(0)
  const listening = useRef(false)

  const onMotion = (e: DeviceMotionEvent) => {
    const a = e.accelerationIncludingGravity
    if (!a) return
    const mag = Math.sqrt(
      (a.x ?? 0) ** 2 + (a.y ?? 0) ** 2 + (a.z ?? 0) ** 2,
    )
    // 静止约 9.8；猛摇时瞬时峰值明显更高
    if (mag < SHAKE_THRESHOLD) return
    const now = Date.now()
    if (now - lastShake.current < SHAKE_COOLDOWN_MS) return
    lastShake.current = now
    const store = useAppStore.getState()
    if (!store.canUndo()) return
    if (store.undo()) {
      store.showToast(t(store.locale, 'undone'))
    }
  }

  const startListening = () => {
    if (listening.current || !isMobileLike()) return
    listening.current = true
    window.addEventListener('devicemotion', onMotion)
  }

  const ensurePermission = async (): Promise<boolean> => {
    if (!isMobileLike()) return false
    const DM = DeviceMotionEvent as unknown as DeviceMotionPermission
    if (typeof DM.requestPermission === 'function') {
      try {
        const res = await DM.requestPermission()
        if (res !== 'granted') return false
      } catch {
        return false
      }
    }
    startListening()
    return true
  }

  useEffect(() => {
    if (!isMobileLike()) return
    // Android 等通常无需权限，直接监听
    const DM = DeviceMotionEvent as unknown as DeviceMotionPermission
    if (typeof DM.requestPermission !== 'function') {
      startListening()
    }
    return () => {
      if (listening.current) {
        window.removeEventListener('devicemotion', onMotion)
        listening.current = false
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { ensurePermission }
}
