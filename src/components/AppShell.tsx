import { useEffect } from 'react'
import { PageTabs } from './PageTabs'
import { LibraryPanel } from './LibraryPanel'
import { CanvasStage } from './CanvasStage'
import { ModePanel } from './ModePanel'
import { BottomSheets, MobileTabBar } from './BottomSheets'
import { ExportDialog } from './ExportDialog'
import { Onboarding } from './Onboarding'
import { AboutMeDialog } from './AboutMeDialog'
import { useAppStore } from '../store/appStore'
import { useT } from '../i18n/useT'
import { probeCanvasLimits } from '../core/canvasProbe'
import { useShakeUndo } from '../gestures/useShakeUndo'
import { t as tMsg } from '../i18n/messages'

export function AppShell() {
  const toast = useAppStore((s) => s.toast)
  const hydrated = useAppStore((s) => s.hydrated)
  const setCanvasLimits = useAppStore((s) => s.setCanvasLimits)
  const hydrateFromDisk = useAppStore((s) => s.hydrateFromDisk)
  const toggleLocale = useAppStore((s) => s.toggleLocale)
  const toggleTheme = useAppStore((s) => s.toggleTheme)
  const theme = useAppStore((s) => s.theme)
  const openTutorial = useAppStore((s) => s.openTutorial)
  const undo = useAppStore((s) => s.undo)
  const canUndo = useAppStore((s) => s.canUndo)
  const showToast = useAppStore((s) => s.showToast)
  const locale = useAppStore((s) => s.locale)
  const t = useT()
  const { ensurePermission } = useShakeUndo()

  useEffect(() => {
    void hydrateFromDisk()
  }, [hydrateFromDisk])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  useEffect(() => {
    document.title = t('appTitle')
  }, [locale, t])

  useEffect(() => {
    void probeCanvasLimits().then(setCanvasLimits)
  }, [setCanvasLimits])

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod || (e.key !== 'z' && e.key !== 'Z')) return
      if (e.shiftKey) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if ((e.target as HTMLElement)?.isContentEditable) return
      e.preventDefault()
      if (!canUndo()) {
        showToast(tMsg(locale, 'nothingToUndo'))
        return
      }
      if (undo()) showToast(tMsg(locale, 'undone'))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canUndo, undo, showToast, locale])

  useEffect(() => {
    ;(
      window as unknown as { __stitcherEnsureMotion?: () => Promise<boolean> }
    ).__stitcherEnsureMotion = ensurePermission
    return () => {
      delete (
        window as unknown as { __stitcherEnsureMotion?: () => Promise<boolean> }
      ).__stitcherEnsureMotion
    }
  }, [ensurePermission])

  if (!hydrated) {
    return (
      <div className="app-shell loading-shell">
        <div className="loading-block" role="status" aria-live="polite">
          <span className="loading-spinner" aria-hidden="true" />
          <p className="loading-text">{t('loading')}…</p>
        </div>
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
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => openTutorial()}
          >
            {t('replayTutorial')}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={toggleTheme}
            title={theme === 'dark' ? t('themeToLight') : t('themeToDark')}
          >
            {theme === 'dark' ? t('themeToLight') : t('themeToDark')}
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
      <AboutMeDialog />
      {toast && <div className="toast">{toast.message}</div>}
    </div>
  )
}
