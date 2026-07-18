import { useAppStore } from '../store/appStore'
import { useT } from '../i18n/useT'
import { confirmLimitDialog } from '../core/exportService'
import { revokePreviewItems } from '../core/download'
import { confirmAndExportProject } from '../core/projectActions'

export function ExportDialog() {
  const dialog = useAppStore((s) => s.exportDialog)
  const setExportDialog = useAppStore((s) => s.setExportDialog)
  const exportPreviews = useAppStore((s) => s.exportPreviews)
  const setExportPreviews = useAppStore((s) => s.setExportPreviews)
  const t = useT()

  if (!dialog) return null

  if (dialog.type === 'busy') {
    return (
      <div className="dialog-backdrop">
        <div className="dialog">
          <h2>{t('processing')}</h2>
          <p>{dialog.message}</p>
        </div>
      </div>
    )
  }

  if (dialog.type === 'project_export_confirm') {
    return (
      <div className="dialog-backdrop">
        <div className="dialog">
          <h2>{t('projectExportTitle')}</h2>
          <p>{dialog.message}</p>
          {dialog.estimateLabel && (
            <p className="muted">≈ {dialog.estimateLabel}</p>
          )}
          <div className="dialog-actions">
            <button
              type="button"
              className="btn"
              onClick={() => setExportDialog(null)}
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void confirmAndExportProject()}
            >
              {t('continueExport')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (dialog.type === 'limit') {
    return (
      <div className="dialog-backdrop">
        <div className="dialog">
          <h2>{t('deviceLimit')}</h2>
          <p>{dialog.message}</p>
          <p>{t('deviceLimitBody', { n: dialog.maxSide ?? '—' })}</p>
          <div className="dialog-actions">
            <button
              type="button"
              className="btn"
              onClick={() => confirmLimitDialog(false)}
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => confirmLimitDialog(true)}
            >
              {t('exportAtLimit')}
              {dialog.suggestedWidth && dialog.suggestedHeight
                ? `（${dialog.suggestedWidth}×${dialog.suggestedHeight}）`
                : ''}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="dialog-backdrop">
      <div className="dialog">
        <h2>{t('saveToAlbum')}</h2>
        <p className="save-hint">{dialog.message}</p>
        <div className="ios-preview-list">
          {exportPreviews.map((item) => (
            <figure key={item.url}>
              <img src={item.url} alt={item.name} />
              <figcaption>{item.name}</figcaption>
            </figure>
          ))}
        </div>
        <div className="dialog-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              revokePreviewItems(exportPreviews)
              setExportPreviews([])
              setExportDialog(null)
            }}
          >
            {t('done')}
          </button>
        </div>
      </div>
    </div>
  )
}
