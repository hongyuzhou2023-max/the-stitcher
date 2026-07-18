import { useEffect, useState, type ReactElement, type ReactNode } from 'react'
import { useAppStore } from '../store/appStore'
import { useT } from '../i18n/useT'
import type { Locale, MessageKey } from '../i18n/messages'

/* 教程动画：每一步都是一个模拟真实界面的小型 mock-up，
   用 CSS keyframes 演示实际操作流程。 */

function MiniApp({
  children,
  canvasClass = 'white',
  libraryChildren,
}: {
  children?: ReactNode
  canvasClass?: string
  libraryChildren?: ReactNode
}) {
  return (
    <div className="tut-app">
      <div className="tut-panel tut-left">{libraryChildren}</div>
      <div className={`tut-canvas ${canvasClass}`}>{children}</div>
      <div className="tut-panel tut-right">
        <span className="tut-line w60" />
        <span className="tut-line w80" />
        <span className="tut-line w50" />
      </div>
    </div>
  )
}

function VisualWelcome() {
  return (
    <div className="tut-stage tut-welcome">
      <MiniApp
        libraryChildren={
          <>
            <span className="tut-thumb c1" />
            <span className="tut-thumb c2" />
          </>
        }
      >
        <span className="tut-slot-photo c1 fly1" />
        <span className="tut-slot-photo c2 fly2" />
      </MiniApp>
      <span className="tut-export-badge">PNG ↓</span>
    </div>
  )
}

function VisualImport() {
  return (
    <div className="tut-stage tut-import">
      <MiniApp
        libraryChildren={
          <>
            <span className="tut-thumb c1 appear1" />
            <span className="tut-thumb c2 appear2" />
          </>
        }
      >
        <span className="tut-slot-photo c1 appear1" />
        <span className="tut-slot-photo c2 appear2" />
      </MiniApp>
      <span className="tut-drag-file" />
      <span className="tut-cursor drag-path" />
    </div>
  )
}

function VisualModes() {
  return (
    <div className="tut-stage tut-modes-row">
      <div className="tut-mode-card mA">
        <span className="tut-mini white">
          <i className="ph a1" />
          <i className="ph a2" />
        </span>
        <b>3:4</b>
      </div>
      <div className="tut-mode-card mB">
        <span className="tut-mini black">
          <i className="strip s1" />
          <i className="strip s2" />
        </span>
        <b>16:9</b>
      </div>
      <div className="tut-mode-card mC">
        <span className="tut-mini tall">
          <i className="fill" />
        </span>
        <b>9:19.5</b>
      </div>
      <div className="tut-mode-card mD">
        <span className="tut-mini black">
          <i className="strip thin s1" />
          <i className="strip thin s2" />
        </span>
        <b>19.5:9</b>
      </div>
    </div>
  )
}

function VisualGestures() {
  return (
    <div className="tut-stage tut-gestures">
      <div className="tut-big-slot">
        <span className="tut-moving-photo" />
      </div>
      <span className="tut-hand" />
      <span className="tut-zoom-badge">2.0×</span>
    </div>
  )
}

function VisualExport() {
  return (
    <div className="tut-stage tut-export">
      <div className="tut-tabs">
        <span className="tab active" />
        <span className="tab" />
        <span className="tab" />
      </div>
      <div className="tut-export-canvas">
        <i className="p1" />
        <i className="p2" />
      </div>
      <span className="tut-arrow-down">↓</span>
      <span className="tut-file-card">.png</span>
    </div>
  )
}

const STEPS: Array<{
  title: MessageKey
  body: MessageKey
  Visual: () => ReactElement
}> = [
  { title: 'tutorialStep1Title', body: 'tutorialStep1Body', Visual: VisualWelcome },
  { title: 'tutorialStep2Title', body: 'tutorialStep2Body', Visual: VisualImport },
  { title: 'tutorialStep3Title', body: 'tutorialStep3Body', Visual: VisualModes },
  { title: 'tutorialStep4Title', body: 'tutorialStep4Body', Visual: VisualGestures },
  { title: 'tutorialStep5Title', body: 'tutorialStep5Body', Visual: VisualExport },
]

export function Onboarding() {
  const show = useAppStore((s) => s.showOnboarding)
  const onboardingDone = useAppStore((s) => s.onboardingDone)
  const setLocale = useAppStore((s) => s.setLocale)
  const completeOnboarding = useAppStore((s) => s.completeOnboarding)
  const setShowOnboarding = useAppStore((s) => s.setShowOnboarding)
  const locale = useAppStore((s) => s.locale)
  const t = useT()
  const [phase, setPhase] = useState<'lang' | 'tour'>('lang')
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (!show) return
    setPhase(onboardingDone ? 'tour' : 'lang')
    setStep(0)
  }, [show, onboardingDone])

  if (!show) return null

  const pickLang = (loc: Locale) => {
    setLocale(loc)
    setPhase('tour')
    setStep(0)
  }

  /* 已完成过引导的用户重开教程时直接进入 tour，
     避免 effect 纠正前闪现一帧语言选择界面 */
  if (phase === 'lang' && !onboardingDone) {
    return (
      <div className="onboard-backdrop">
        <div className="onboard-card lang-card">
          <div className="onboard-visual">
            <VisualWelcome />
          </div>
          <h2>{t('chooseLanguage')}</h2>
          <p>{t('chooseLanguageHint')}</p>
          <div className="onboard-lang-row">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => pickLang('zh')}
            >
              中文
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => pickLang('en')}
            >
              English
            </button>
          </div>
        </div>
      </div>
    )
  }

  const current = STEPS[step]
  const isLast = step >= STEPS.length - 1
  const Visual = current.Visual

  return (
    <div className="onboard-backdrop">
      <div className="onboard-card" key={`${locale}-${step}`}>
        <div className="onboard-visual">
          <Visual />
        </div>
        <div className="onboard-progress">
          {STEPS.map((_, i) => (
            <span key={i} className={i === step ? 'dot active' : 'dot'} />
          ))}
        </div>
        <h2>{t(current.title)}</h2>
        <p>{t(current.body)}</p>
        <div className="dialog-actions onboard-actions">
          {onboardingDone ? (
            <button
              type="button"
              className="btn"
              onClick={() => setShowOnboarding(false)}
            >
              {t('close')}
            </button>
          ) : (
            <button
              type="button"
              className="btn"
              onClick={() => completeOnboarding()}
            >
              {t('tutorialSkip')}
            </button>
          )}
          {step > 0 && (
            <button
              type="button"
              className="btn"
              onClick={() => setStep((s) => s - 1)}
            >
              {t('tutorialBack')}
            </button>
          )}
          {!isLast ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setStep((s) => s + 1)}
            >
              {t('tutorialNext')}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                if (!onboardingDone) completeOnboarding()
                else setShowOnboarding(false)
              }}
            >
              {t('tutorialStart')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
