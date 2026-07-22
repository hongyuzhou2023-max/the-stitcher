import { useMemo, useRef } from 'react'
import { useAppStore } from '../store/appStore'
import { useT } from '../i18n/useT'
import {
  defaultModeA,
  defaultModeB,
  defaultModeC,
  defaultModeD,
  FRAME_SCALE_DEFAULT,
  FRAME_SCALE_MAX,
  FRAME_SCALE_MIN,
  type ModeA,
  type ModeB,
  type ModeC,
  type ModeD,
  type TemplateA,
  WALLPAPER_GAP_MAX_PCT,
} from '../types'
import { runExportActivePage, runExportAllPages } from '../core/exportService'
import { computeLayout } from '../core/layouts'
import { pageHasImages, resolveExportSize } from '../core/exportSize'
import {
  estimateProjectBytes,
  formatBytes,
  importProjectZip,
} from '../core/projectIO'

const MAX_SCALE = 20

type ActionIconKind =
  | 'exportPage'
  | 'exportAll'
  | 'remove'
  | 'reset'
  | 'projectOut'
  | 'projectIn'

function ActionIcon({ kind }: { kind: ActionIconKind }) {
  const common = {
    className: 'action-icon',
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  switch (kind) {
    case 'exportPage':
      // 下载：箭头落入托盘
      return (
        <svg {...common}>
          <path d="M8 2.5v7M5.2 7l2.8 2.8L10.8 7" />
          <path d="M2.5 11v1.5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V11" />
        </svg>
      )
    case 'exportAll':
      // 批量：叠层 + 下载箭头
      return (
        <svg {...common}>
          <rect x="4.5" y="2" width="9" height="9" rx="1.2" />
          <path d="M2.5 5v7.5a1.5 1.5 0 0 0 1.5 1.5H11" />
          <path d="M9 4.8v3.4M7.6 7l1.4 1.4L10.4 7" />
        </svg>
      )
    case 'remove':
      // 照片 + 删除斜线
      return (
        <svg {...common}>
          <rect x="2.5" y="3" width="11" height="10" rx="1.2" />
          <circle cx="6" cy="6.5" r="1" fill="currentColor" stroke="none" />
          <path d="M2.5 11l3-2.6 2.4 2M12.8 3.8L3.2 12.6" />
        </svg>
      )
    case 'reset':
      // 环形箭头
      return (
        <svg {...common}>
          <path d="M13 8a5 5 0 1 1-1.7-3.75" />
          <path d="M13 2.6v2.6h-2.6" />
        </svg>
      )
    case 'projectOut':
      // 项目盒子 + 向上箭头
      return (
        <svg {...common}>
          <path d="M2.5 6.5h11v6a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-6z" />
          <path d="M4.2 6.5L5.5 4h5l1.3 2.5" />
          <path d="M8 12v-3.4M6.6 10l1.4-1.4L9.4 10" />
        </svg>
      )
    case 'projectIn':
      // 项目盒子 + 向下箭头
      return (
        <svg {...common}>
          <path d="M2.5 6.5h11v6a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-6z" />
          <path d="M4.2 6.5L5.5 4h5l1.3 2.5" />
          <path d="M8 8.6V12M6.6 10.6L8 12l1.4-1.4" />
        </svg>
      )
  }
}

function ModeIcon({ kind }: { kind: 'A' | 'B' | 'C' | 'D' }) {
  if (kind === 'A') {
    return (
      <svg className="mode-icon" viewBox="0 0 24 30" aria-hidden>
        <rect x="1" y="1" width="22" height="28" rx="2" fill="#fff" />
        <rect x="4" y="4" width="16" height="10" rx="1" fill="#8fa8b8" />
        <rect x="4" y="16" width="16" height="10" rx="1" fill="#6e8899" />
      </svg>
    )
  }
  if (kind === 'B') {
    return (
      <svg className="mode-icon" viewBox="0 0 24 30" aria-hidden>
        <rect x="1" y="1" width="22" height="28" rx="2" fill="#000" stroke="#3a3a3a" strokeWidth="0.5" />
        <rect x="1" y="6" width="22" height="8" fill="#8fa8b8" />
        <rect x="1" y="16" width="22" height="8" fill="#6e8899" />
      </svg>
    )
  }
  if (kind === 'C') {
    return (
      <svg className="mode-icon" viewBox="0 0 24 30" aria-hidden>
        <rect x="6" y="1" width="12" height="28" rx="2" fill="#8fa8b8" />
        <rect x="6" y="1" width="12" height="28" rx="2" fill="none" stroke="#3a3a3a" strokeWidth="0.5" />
      </svg>
    )
  }
  return (
    <svg className="mode-icon" viewBox="0 0 24 30" aria-hidden>
      <rect x="1" y="1" width="22" height="28" rx="2" fill="#000" stroke="#3a3a3a" strokeWidth="0.5" />
      <rect x="1" y="8" width="22" height="5" fill="#8fa8b8" />
      <rect x="1" y="17" width="22" height="5" fill="#6e8899" />
    </svg>
  )
}

export function ModePanel() {
  const t = useT()
  const pages = useAppStore((s) => s.pages)
  const activePageId = useAppStore((s) => s.activePageId)
  const updateMode = useAppStore((s) => s.updateMode)
  const selectedSlotIndex = useAppStore((s) => s.selectedSlotIndex)
  const updateSlotTransform = useAppStore((s) => s.updateSlotTransform)
  const updateSlotFrameScale = useAppStore((s) => s.updateSlotFrameScale)
  const assignAssetToSlot = useAppStore((s) => s.assignAssetToSlot)
  const exportFormat = useAppStore((s) => s.exportFormat)
  const setExportFormat = useAppStore((s) => s.setExportFormat)
  const exportSize = useAppStore((s) => s.exportSize)
  const setExportSize = useAppStore((s) => s.setExportSize)
  const exporting = useAppStore((s) => s.exporting)
  const canvasLimits = useAppStore((s) => s.canvasLimits)
  const assets = useAppStore((s) => s.assets)
  const setExportDialog = useAppStore((s) => s.setExportDialog)
  const replaceProject = useAppStore((s) => s.replaceProject)
  const showToast = useAppStore((s) => s.showToast)
  const setShowAbout = useAppStore((s) => s.setShowAbout)
  const importRef = useRef<HTMLInputElement>(null)

  const page = pages.find((p) => p.id === activePageId)!
  const mode = page.mode
  const slot = page.slots[selectedSlotIndex]
  const rotation = slot?.transform.rotation ?? 0

  // 当前档位下本页的实际导出像素（帮助用户理解尺寸档位的效果）
  const exportEstimate = useMemo(() => {
    if (!pageHasImages(page.slots)) return null
    const map = new Map(assets.map((a) => [a.id, a]))
    return resolveExportSize(page, computeLayout(page.mode), map, exportSize)
  }, [page, assets, exportSize])

  const setType = (type: 'A' | 'B' | 'C' | 'D') => {
    if (type === 'A') updateMode(defaultModeA())
    else if (type === 'B') updateMode(defaultModeB())
    else if (type === 'C') updateMode(defaultModeC())
    else updateMode(defaultModeD())
  }

  const askExportProject = () => {
    const bytes = estimateProjectBytes(assets)
    setExportDialog({
      type: 'project_export_confirm',
      message: t('projectExportWarn'),
      estimateLabel: formatBytes(bytes),
    })
  }

  const onImportProject = async (file: File) => {
    setExportDialog({ type: 'busy', message: t('projectImporting') })
    try {
      const data = await importProjectZip(file)
      replaceProject(data)
      showToast(t('projectImported'))
    } catch {
      showToast(t('projectImportFail'))
    } finally {
      setExportDialog(null)
    }
  }

  return (
    <div className="mode-panel panel-inner">
      <div className="action-grid">
        <button
          type="button"
          className="btn btn-action btn-primary"
          disabled={exporting}
          onClick={() => void runExportActivePage()}
        >
          <ActionIcon kind="exportPage" />
          <span>{t('exportPage')}</span>
        </button>
        <button
          type="button"
          className="btn btn-action"
          disabled={exporting}
          onClick={() => void runExportAllPages()}
        >
          <ActionIcon kind="exportAll" />
          <span>{t('exportAll')}</span>
        </button>
        <button
          type="button"
          className="btn btn-action btn-danger"
          disabled={!slot?.assetId}
          onClick={() => assignAssetToSlot(selectedSlotIndex, null)}
        >
          <ActionIcon kind="remove" />
          <span>{t('removePhoto')}</span>
        </button>
        <button
          type="button"
          className="btn btn-action"
          disabled={!slot?.assetId}
          onClick={() =>
            updateSlotTransform(selectedSlotIndex, {
              scale: 1,
              offsetX: 0.5,
              offsetY: 0.5,
              rotation: 0,
            })
          }
        >
          <ActionIcon kind="reset" />
          <span>{t('resetView')}</span>
        </button>
        <button
          type="button"
          className="btn btn-action"
          disabled={exporting}
          onClick={askExportProject}
        >
          <ActionIcon kind="projectOut" />
          <span>{t('exportProject')}</span>
        </button>
        <button
          type="button"
          className="btn btn-action"
          disabled={exporting}
          onClick={() => importRef.current?.click()}
        >
          <ActionIcon kind="projectIn" />
          <span>{t('importProject')}</span>
        </button>
        <input
          ref={importRef}
          type="file"
          accept=".zip,application/zip"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void onImportProject(f)
            e.target.value = ''
          }}
        />
      </div>

      <div className="seg seg-compact format-row">
        <button
          type="button"
          className={exportFormat === 'jpeg' ? 'active' : ''}
          onClick={() => setExportFormat('jpeg')}
        >
          {t('jpegHq')}
        </button>
        <button
          type="button"
          className={exportFormat === 'jpeg100' ? 'active' : ''}
          onClick={() => setExportFormat('jpeg100')}
        >
          {t('jpeg100')}
        </button>
        <button
          type="button"
          className={exportFormat === 'png' ? 'active' : ''}
          onClick={() => setExportFormat('png')}
        >
          {t('pngLossless')}
        </button>
      </div>

      <div className="seg seg-compact format-row">
        <button
          type="button"
          className={exportSize === '4k' ? 'active' : ''}
          onClick={() => setExportSize('4k')}
        >
          {t('size4k')}
        </button>
        <button
          type="button"
          className={exportSize === '2k' ? 'active' : ''}
          onClick={() => setExportSize('2k')}
        >
          {t('size2k')}
        </button>
        <button
          type="button"
          className={exportSize === 'original' ? 'active' : ''}
          onClick={() => setExportSize('original')}
        >
          {t('sizeOriginal')}
        </button>
      </div>

      {exportEstimate && (
        <p
          className="muted export-estimate"
          title={t('exportEstimateTip')}
        >
          {t('exportEstimate', {
            w: exportEstimate.width,
            h: exportEstimate.height,
          })}
        </p>
      )}

      <p className="section-title">{t('modeTitle')}</p>
      <div className="mode-switch">
        {(
          [
            ['A', 'modeA'],
            ['B', 'modeB'],
            ['C', 'modeC'],
            ['D', 'modeD'],
          ] as const
        ).map(([type, key]) => (
          <button
            key={type}
            type="button"
            className={mode.type === type ? 'active' : ''}
            onClick={() => setType(type)}
          >
            <ModeIcon kind={type} />
            <span>{t(key)}</span>
          </button>
        ))}
      </div>

      {mode.type === 'A' && <ModeAControls mode={mode} onChange={updateMode} />}
      {mode.type === 'B' && (
        <ModeBControls mode={mode} onChange={updateMode} wallpaper={false} />
      )}
      {mode.type === 'D' && (
        <ModeBControls mode={mode} onChange={updateMode} wallpaper />
      )}
      {mode.type === 'C' && <ModeCControls mode={mode} onChange={updateMode} />}

      <p className="section-title">
        {t('currentSlot')} #{selectedSlotIndex + 1}
      </p>
      {mode.type === 'A' && slot && (
        <div className="field">
          <label>
            {t('frameSize')}{' '}
            {Math.round((slot.frameScale ?? FRAME_SCALE_DEFAULT) * 100)}%
          </label>
          <input
            type="range"
            min={FRAME_SCALE_MIN}
            max={FRAME_SCALE_MAX}
            step={0.01}
            value={slot.frameScale ?? FRAME_SCALE_DEFAULT}
            onChange={(e) =>
              updateSlotFrameScale(selectedSlotIndex, Number(e.target.value))
            }
          />
        </div>
      )}
      {slot?.assetId ? (
        <>
          <div className="field">
            <label>
              {t('scale')} {slot.transform.scale.toFixed(2)}×
            </label>
            <input
              type="range"
              min={1}
              max={MAX_SCALE}
              step={0.01}
              value={Math.min(MAX_SCALE, slot.transform.scale)}
              onChange={(e) =>
                updateSlotTransform(selectedSlotIndex, {
                  scale: Number(e.target.value),
                })
              }
            />
          </div>
          <div className="field">
            <label>
              {t('rotation')} {Math.round(rotation)}°
            </label>
            <div className="seg seg-compact">
              <button
                type="button"
                onClick={() =>
                  updateSlotTransform(selectedSlotIndex, {
                    rotation: rotation - 90,
                  })
                }
              >
                {t('rotLeft')}
              </button>
              <button
                type="button"
                onClick={() =>
                  updateSlotTransform(selectedSlotIndex, {
                    rotation: rotation + 90,
                  })
                }
              >
                {t('rotRight')}
              </button>
              <button
                type="button"
                onClick={() =>
                  updateSlotTransform(selectedSlotIndex, {
                    rotation: rotation + 180,
                  })
                }
              >
                {t('rot180')}
              </button>
              <button
                type="button"
                onClick={() =>
                  updateSlotTransform(selectedSlotIndex, { rotation: 0 })
                }
              >
                {t('rotReset')}
              </button>
            </div>
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={((((rotation + 180) % 360) + 360) % 360) - 180}
              onChange={(e) =>
                updateSlotTransform(selectedSlotIndex, {
                  rotation: Number(e.target.value),
                })
              }
            />
          </div>
        </>
      ) : (
        <p className="muted">{t('slotHintEmpty')}</p>
      )}

      <div className="panel-footer">
        {canvasLimits && (
          <p className="muted">{t('canvasLimit', { n: canvasLimits.maxSide })}</p>
        )}
        <p className="app-credit">{t('credit')}</p>
        <button
          type="button"
          className="about-me-link"
          onClick={() => setShowAbout(true)}
        >
          {t('aboutMe')}
        </button>
      </div>
    </div>
  )
}

function ModeAControls({
  mode,
  onChange,
}: {
  mode: ModeA
  onChange: (m: ModeA) => void
}) {
  const t = useT()
  return (
    <div className="mode-controls">
      <div className="field field-inline">
        <label>{t('photoCount')}</label>
        <div className="seg seg-compact">
          {([1, 2, 3, 4] as const).map((n) => (
            <button
              key={n}
              type="button"
              className={mode.count === n ? 'active' : ''}
              onClick={() =>
                onChange({
                  ...mode,
                  count: n,
                  template: n === 4 ? 'grid2' : mode.template,
                })
              }
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      <div className="field field-inline">
        <label>{t('layoutTemplate')}</label>
        <div className="seg seg-compact">
          {(
            [
              ['v', 'tplV'],
              ['h', 'tplH'],
              ['grid2', 'tplGrid'],
            ] as [TemplateA, 'tplV' | 'tplH' | 'tplGrid'][]
          ).map(([tpl, key]) => (
            <button
              key={tpl}
              type="button"
              className={mode.template === tpl ? 'active' : ''}
              disabled={tpl === 'grid2' && mode.count < 3}
              onClick={() => onChange({ ...mode, template: tpl })}
            >
              {t(key)}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>
          {t('whiteMargin')} {(mode.tight ? 0 : mode.margin * 100).toFixed(0)}%
        </label>
        <input
          type="range"
          min={0}
          max={15}
          step={1}
          disabled={mode.tight}
          value={mode.margin * 100}
          onChange={(e) =>
            onChange({ ...mode, margin: Number(e.target.value) / 100 })
          }
        />
      </div>
      <label className="toggle">
        <input
          type="checkbox"
          checked={mode.tight}
          onChange={(e) => onChange({ ...mode, tight: e.target.checked })}
        />
        {t('tightJoin')}
      </label>
    </div>
  )
}

function ModeBControls({
  mode,
  onChange,
  wallpaper,
}: {
  mode: ModeB | ModeD
  onChange: (m: ModeB | ModeD) => void
  wallpaper: boolean
}) {
  const t = useT()
  return (
    <div className="mode-controls">
      <div className="field field-inline">
        <label>{wallpaper ? t('stripCountWp') : t('stripCount16')}</label>
        <div className="seg seg-compact">
          {([1, 2, 3] as const).map((n) => (
            <button
              key={n}
              type="button"
              className={mode.count === n ? 'active' : ''}
              onClick={() => onChange({ ...mode, count: n })}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>
          {t('stripGap')} {(mode.tight ? 0 : mode.gap * 100).toFixed(0)}%
          {wallpaper && (
            <span className="field-hint">{t('wallpaperGapHint')}</span>
          )}
        </label>
        <input
          type="range"
          min={0}
          max={wallpaper ? WALLPAPER_GAP_MAX_PCT : 10}
          step={0.5}
          disabled={mode.tight}
          value={mode.gap * 100}
          onChange={(e) =>
            onChange({ ...mode, gap: Number(e.target.value) / 100 })
          }
        />
      </div>
      <label className="toggle">
        <input
          type="checkbox"
          checked={mode.tight}
          onChange={(e) => onChange({ ...mode, tight: e.target.checked })}
        />
        {t('tightJoin')}
      </label>
    </div>
  )
}

function ModeCControls({
  mode,
  onChange,
}: {
  mode: ModeC
  onChange: (m: ModeC) => void
}) {
  const t = useT()
  return (
    <div className="mode-controls">
      <div className="field">
        <label>
          {t('canvasRatio')}
          <span className="field-hint">{t('fullscreenRatioHint')}</span>
        </label>
        <div className="seg seg-compact">
          <button
            type="button"
            className={mode.ratio === '9:16' ? 'active' : ''}
            onClick={() => onChange({ ...mode, ratio: '9:16' })}
            title={t('ratioXhsFullscreen')}
          >
            9:16
          </button>
          <button
            type="button"
            className={mode.ratio === '9:19.5' ? 'active' : ''}
            onClick={() => onChange({ ...mode, ratio: '9:19.5' })}
            title={t('ratioPhoneWallpaper')}
          >
            9:19.5
          </button>
          <button
            type="button"
            className={mode.ratio === 'custom' ? 'active' : ''}
            onClick={() => onChange({ ...mode, ratio: 'custom' })}
          >
            {t('custom')}
          </button>
        </div>
      </div>
      {mode.ratio === 'custom' && (
        <div className="row">
          <div className="field" style={{ flex: 1 }}>
            <label>{t('width')}</label>
            <input
              type="number"
              min={1}
              step={0.1}
              value={mode.customW}
              onChange={(e) =>
                onChange({ ...mode, customW: Number(e.target.value) || 1 })
              }
            />
          </div>
          <span>:</span>
          <div className="field" style={{ flex: 1 }}>
            <label>{t('height')}</label>
            <input
              type="number"
              min={1}
              step={0.1}
              value={mode.customH}
              onChange={(e) =>
                onChange({ ...mode, customH: Number(e.target.value) || 1 })
              }
            />
          </div>
        </div>
      )}
    </div>
  )
}
