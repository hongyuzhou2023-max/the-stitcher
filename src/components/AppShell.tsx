import { useEffect } from 'react'
import { PageTabs } from './PageTabs'
import { LibraryPanel } from './LibraryPanel'
import { CanvasStage } from './CanvasStage'
import { ModePanel } from './ModePanel'
import { BottomSheets, MobileTabBar } from './BottomSheets'
import { ExportDialog } from './ExportDialog'
import { Onboarding } from './Onboarding'
import { useAppStore } from '../store/appStore'
import { useT } from '../i18n/useT'
import { probeCanvasLimits } from '../core/canvasProbe'

export function AppShell() {
  const toast = useAppStore((s) => s.toast)
  const hydrated = useAppStore((s) => s.hydrated)
  const setCanvasLimits = useAppStore((s) => s.setCanvasLimits)
  const hydrateFromDisk = useAppStore((s) => s.hydrateFromDisk)
  const toggleLocale = useAppStore((s) => s.toggleLocale)
  const openTutorial = useAppStore((s) => s.openTutorial)
  const t = useT()

  useEffect(() => {
    void hydrateFromDisk()
  }, [hydrateFromDisk])

  const locale = useAppStore((s) => s.locale)
  useEffect(() => {
    document.title = t('appTitle')
  }, [locale, t])

  useEffect(() => {
    void probeCanvasLimits().then(setCanvasLimits)
  }, [setCanvasLimits])

  /* 手机浏览器（iOS Safari / Android Chrome / 微信内嵌）地址栏收起展开时
     可视高度动态变化，height:100% 各家解释不一，会导致画布被裁或需滚动。
     用 visualViewport 实时把真实可见高度写进 --app-height，全平台一致。 */
  useEffect(() => {
    const vv = window.visualViewport
    const setH = () => {
      const h = Math.round(vv?.height ?? window.innerHeight)
      document.documentElement.style.setProperty('--app-height', `${h}px`)
    }
    setH()
    vv?.addEventListener('resize', setH)
    window.addEventListener('resize', setH)
    window.addEventListener('orientationchange', setH)
    return () => {
      vv?.removeEventListener('resize', setH)
      window.removeEventListener('resize', setH)
      window.removeEventListener('orientationchange', setH)
    }
  }, [])

  useEffect(() => {
    const allow = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes('Files')) return
      e.preventDefault()
    }
    const blockNav = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes('Files')) return
      e.preventDefault()
    }
    window.addEventListener('dragover', allow)
    window.addEventListener('drop', blockNav)
    return () => {
      window.removeEventListener('dragover', allow)
      window.removeEventListener('drop', blockNav)
    }
  }, [])

  if (!hydrated) {
    return (
      <div className="app-shell" style={{ placeItems: 'center' }}>
        <p className="muted">{t('processing')}…</p>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-block">
          <h1>{t('appTitle')}</h1>
          <span className="brand-sub">{t('appTitleEn')}</span>
        </div>
        <PageTabs />
        <div className="header-actions">
          <button type="button" className="btn btn-sm" onClick={() => openTutorial()}>
            {t('replayTutorial')}
          </button>
          <button type="button" className="btn btn-sm" onClick={toggleLocale}>
            {t('langSwitch')}
          </button>
        </div>
      </header>
      <div className="app-body">
        <aside className="panel desktop-only">
          <LibraryPanel />
        </aside>
        <main className="stage-wrap">
          <CanvasStage />
          <MobileTabBar />
        </main>
        <aside className="panel panel-right desktop-only">
          <ModePanel />
        </aside>
      </div>
      <BottomSheets />
      <ExportDialog />
      <Onboarding />
      {toast && <div className="toast">{toast.message}</div>}
    </div>
  )
}
