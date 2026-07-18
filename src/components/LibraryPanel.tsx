import { useCallback, useRef, useState } from 'react'
import { useAppStore } from '../store/appStore'
import { useT } from '../i18n/useT'
import { loadAssetFromFile } from '../image/loadAsset'

function filesFromDataTransfer(dt: DataTransfer): File[] {
  const out: File[] = []
  if (dt.items && dt.items.length > 0) {
    for (let i = 0; i < dt.items.length; i++) {
      const item = dt.items[i]
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) out.push(file)
      }
    }
    if (out.length) return out
  }
  if (dt.files?.length) return [...dt.files]
  return out
}

function isFileDrag(dt: DataTransfer | null): boolean {
  if (!dt) return false
  if (dt.types) {
    for (let i = 0; i < dt.types.length; i++) {
      const type = dt.types[i]
      if (type === 'Files' || type === 'application/x-moz-file') return true
    }
  }
  return (dt.files?.length ?? 0) > 0
}

export function LibraryPanel() {
  const t = useT()
  const assets = useAppStore((s) => s.assets)
  const addAssets = useAppStore((s) => s.addAssets)
  const removeAsset = useAppStore((s) => s.removeAsset)
  const reorderAssets = useAppStore((s) => s.reorderAssets)
  const placeAsset = useAppStore((s) => s.placeAsset)
  const placeAssets = useAppStore((s) => s.placeAssets)
  const fillSlotsFromLibrary = useAppStore((s) => s.fillSlotsFromLibrary)
  const showToast = useAppStore((s) => s.showToast)
  const inputRef = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)
  const [dragOver, setDragOver] = useState(false)
  const [dragFrom, setDragFrom] = useState<number | null>(null)

  const importFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = [...files].filter((f) => f.size > 0)
      if (!list.length) {
        showToast(t('noFiles'))
        return
      }
      const loaded = []
      for (const file of list) {
        const result = await loadAssetFromFile(file)
        if (result.ok) loaded.push(result.asset)
        else showToast(result.message)
      }
      if (loaded.length) {
        addAssets(loaded)
        placeAssets(loaded.map((a) => a.id))
        showToast(t('imported', { n: loaded.length }))
      }
    },
    [addAssets, placeAssets, showToast, t],
  )

  const onPanelDragEnter = (e: React.DragEvent) => {
    if (!isFileDrag(e.dataTransfer)) return
    e.preventDefault()
    e.stopPropagation()
    dragDepth.current += 1
    setDragOver(true)
  }

  const onPanelDragOver = (e: React.DragEvent) => {
    if (!isFileDrag(e.dataTransfer)) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
    setDragOver(true)
  }

  const onPanelDragLeave = (e: React.DragEvent) => {
    if (!isFileDrag(e.dataTransfer)) return
    e.preventDefault()
    e.stopPropagation()
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragOver(false)
  }

  const onPanelDrop = (e: React.DragEvent) => {
    if (!isFileDrag(e.dataTransfer)) return
    e.preventDefault()
    e.stopPropagation()
    dragDepth.current = 0
    setDragOver(false)
    void importFiles(filesFromDataTransfer(e.dataTransfer))
  }

  return (
    <div
      className={`library panel-inner ${dragOver ? 'library-dragover' : ''}`}
      onDragEnter={onPanelDragEnter}
      onDragOver={onPanelDragOver}
      onDragLeave={onPanelDragLeave}
      onDrop={onPanelDrop}
    >
      <p className="section-title">{t('library')}</p>
      <div className={`dropzone ${dragOver ? 'dragover' : ''}`}>
        <span className="hint-desktop">{t('dropHintDesktop')}</span>
        <span className="hint-mobile">{t('dropHintMobile')}</span>
        <div style={{ marginTop: 10 }}>
          <button
            type="button"
            className="btn btn-primary btn-block"
            onClick={() => inputRef.current?.click()}
          >
            {t('pickImages')}
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.tif,.tiff,image/jpeg,image/png,image/tiff"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) void importFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <p className="muted" style={{ marginTop: 8 }}>
          {t('formatsHint')}
        </p>
      </div>

      {assets.length > 0 && (
        <button
          type="button"
          className="btn btn-block"
          style={{ marginTop: 10 }}
          onClick={fillSlotsFromLibrary}
        >
          {t('fillSlots')}
        </button>
      )}

      <div className="thumb-grid" style={{ marginTop: 12 }}>
        {assets.map((asset, index) => (
          <div
            key={asset.id}
            className="thumb-item"
            draggable
            onDragStart={(e) => {
              setDragFrom(index)
              e.dataTransfer.setData('application/x-xhs-asset', asset.id)
              e.dataTransfer.setData('text/plain', asset.id)
              e.dataTransfer.effectAllowed = 'copyMove'
            }}
            onDragOver={(e) => {
              if (isFileDrag(e.dataTransfer)) return
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
            }}
            onDrop={(e) => {
              if (isFileDrag(e.dataTransfer)) return
              e.preventDefault()
              e.stopPropagation()
              if (dragFrom != null) reorderAssets(dragFrom, index)
              setDragFrom(null)
            }}
            onClick={() => placeAsset(asset.id)}
            title={t('clickToFill')}
          >
            <img src={asset.thumbUrl} alt={asset.name} draggable={false} />
            <button
              type="button"
              className="del"
              aria-label={t('delete')}
              onClick={(e) => {
                e.stopPropagation()
                removeAsset(asset.id)
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      {!assets.length && (
        <p className="muted" style={{ marginTop: 12 }}>
          {t('noImages')}
        </p>
      )}
    </div>
  )
}
