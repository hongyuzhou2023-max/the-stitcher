import { useAppStore } from '../store/appStore'
import { useT } from '../i18n/useT'

export function AboutMeDialog() {
  const open = useAppStore((s) => s.showAbout)
  const setShowAbout = useAppStore((s) => s.setShowAbout)
  const t = useT()

  if (!open) return null

  return (
    <div
      className="about-backdrop"
      onClick={() => setShowAbout(false)}
      role="presentation"
    >
      <div
        className="about-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('aboutMeTitle')}
      >
        <h2 className="about-title">{t('aboutMeTitle')}</h2>
        <div className="about-poem">
          <p>{t('aboutMeLine1')}</p>
          <p>{t('aboutMeLine2')}</p>
          <p>{t('aboutMeLine3')}</p>
          <span className="about-divider" />
          <p>{t('aboutMeLine4')}</p>
          <p>{t('aboutMeLine5')}</p>
          <p>{t('aboutMeLine6')}</p>
        </div>
        <button
          type="button"
          className="btn btn-primary about-close"
          onClick={() => setShowAbout(false)}
        >
          {t('close')}
        </button>
      </div>
    </div>
  )
}
