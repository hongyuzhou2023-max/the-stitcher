import { useState } from 'react'
import { useAppStore } from '../store/appStore'
import { useT } from '../i18n/useT'
import { getPageDisplayName } from '../utils/pageName'

export function PageTabs() {
  const pages = useAppStore((s) => s.pages)
  const activePageId = useAppStore((s) => s.activePageId)
  const locale = useAppStore((s) => s.locale)
  const setActivePage = useAppStore((s) => s.setActivePage)
  const addPage = useAppStore((s) => s.addPage)
  const closePage = useAppStore((s) => s.closePage)
  const renamePage = useAppStore((s) => s.renamePage)
  const t = useT()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const startRename = (id: string, currentLabel: string) => {
    setEditingId(id)
    setDraft(currentLabel)
  }

  const commitRename = () => {
    if (editingId) renamePage(editingId, draft)
    setEditingId(null)
  }

  return (
    <div className="page-tabs">
      {pages.map((p, index) => {
        const label = getPageDisplayName(p, index, locale)
        const active = p.id === activePageId
        return (
          <div key={p.id} className={`page-tab ${active ? 'active' : ''}`}>
            {editingId === p.id ? (
              <input
                className="page-rename-input"
                value={draft}
                autoFocus
                aria-label={t('renamePage')}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename()
                  if (e.key === 'Escape') setEditingId(null)
                }}
              />
            ) : (
              <button
                type="button"
                title={t('renamePageHint')}
                onClick={() => setActivePage(p.id)}
                onDoubleClick={() => startRename(p.id, label)}
              >
                {label}
              </button>
            )}
            <button
              type="button"
              className="rename-btn"
              aria-label={t('renamePage')}
              title={t('renamePage')}
              onClick={() => startRename(p.id, label)}
            >
              ✎
            </button>
            {pages.length > 1 && (
              <button
                type="button"
                className="close"
                aria-label={t('close')}
                onClick={() => closePage(p.id)}
              >
                ×
              </button>
            )}
          </div>
        )
      })}
      <button
        type="button"
        className="btn"
        onClick={addPage}
        title={t('newPage')}
      >
        +
      </button>
    </div>
  )
}
