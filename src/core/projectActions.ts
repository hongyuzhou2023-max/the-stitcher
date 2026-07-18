import { useAppStore } from '../store/appStore'
import { t } from '../i18n/messages'
import { exportProjectZip } from './projectIO'

export async function confirmAndExportProject() {
  const s = useAppStore.getState()
  s.setExportDialog({
    type: 'busy',
    message: t(s.locale, 'projectExporting'),
  })
  try {
    await exportProjectZip({
      locale: s.locale,
      exportFormat: s.exportFormat,
      activePageId: s.activePageId,
      selectedSlotIndex: s.selectedSlotIndex,
      pages: s.pages,
      assets: s.assets,
    })
    s.showToast(t(s.locale, 'projectExported'))
  } catch (e) {
    console.warn(e)
    s.showToast(t(s.locale, 'projectImportFail'))
  } finally {
    s.setExportDialog(null)
  }
}
