import { useAppStore } from '../store/appStore'
import { useT } from '../i18n/useT'
import { LibraryPanel } from './LibraryPanel'
import { ModePanel } from './ModePanel'

export function BottomSheets() {
  const sheet = useAppStore((s) => s.mobileSheet)
  const setMobileSheet = useAppStore((s) => s.setMobileSheet)
  const t = useT()

  if (sheet === 'none') return null

  const title = sheet === 'library' ? t('library') : t('params')

  return (
    <div
      className="mobile-sheet"
      onClick={() => setMobileSheet('none')}
      role="presentation"
    >
      <div
        className="mobile-sheet-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <div className="mobile-sheet-handle" />
        <div className="mobile-sheet-title">{title}</div>
        <div className="mobile-sheet-body">
          {sheet === 'library' ? <LibraryPanel /> : <ModePanel />}
        </div>
      </div>
    </div>
  )
}

export function MobileTabBar() {
  const sheet = useAppStore((s) => s.mobileSheet)
  const setMobileSheet = useAppStore((s) => s.setMobileSheet)
  const t = useT()

  return (
    <div className="mobile-tabbar">
      <button
        type="button"
        className={sheet === 'library' ? 'active' : ''}
        onClick={() =>
          setMobileSheet(sheet === 'library' ? 'none' : 'library')
        }
      >
        {t('library')}
      </button>
      <button
        type="button"
        className={sheet === 'params' ? 'active' : ''}
        onClick={() => {
          const next = sheet === 'params' ? 'none' : 'params'
          setMobileSheet(next)
          if (next === 'params') {
            void (
              window as unknown as {
                __stitcherEnsureMotion?: () => Promise<boolean>
              }
            ).__stitcherEnsureMotion?.()
          }
        }}
      >
        {t('params')}
      </button>
    </div>
  )
}
