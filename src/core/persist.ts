import type { Asset, Page, ExportFormat, ExportSizePreset } from '../types'
import { loadAssetFromFile, disposeAsset } from '../image/loadAsset'
import type { Locale } from '../i18n/messages'

const DB_NAME = 'xhs_collage_db'
const DB_VERSION = 1
const STORE = 'kv'

export type PersistedSnapshot = {
  version: 1
  locale: Locale
  exportFormat: ExportFormat
  exportSize?: ExportSizePreset
  activePageId: string
  selectedSlotIndex: number
  onboardingDone?: boolean
  pages: Page[]
  assets: Array<{
    id: string
    name: string
    type: string
    buffer: ArrayBuffer
  }>
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IDB open failed'))
  })
}

function idbGet<T>(key: string): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly')
        const req = tx.objectStore(STORE).get(key)
        req.onsuccess = () => resolve(req.result as T | undefined)
        req.onerror = () => reject(req.error)
      }),
  )
}

function idbSet(key: string, value: unknown): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite')
        tx.objectStore(STORE).put(value, key)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      }),
  )
}

async function fileToBuffer(file: File): Promise<ArrayBuffer> {
  return file.arrayBuffer()
}

export async function serializeProject(input: {
  locale: Locale
  exportFormat: ExportFormat
  exportSize?: ExportSizePreset
  activePageId: string
  selectedSlotIndex: number
  pages: Page[]
  assets: Asset[]
  onboardingDone?: boolean
}): Promise<PersistedSnapshot> {
  const assets = []
  for (const a of input.assets) {
    assets.push({
      id: a.id,
      name: a.name,
      type: a.file.type || 'application/octet-stream',
      buffer: await fileToBuffer(a.file),
    })
  }
  return {
    version: 1,
    locale: input.locale,
    exportFormat: input.exportFormat,
    exportSize: input.exportSize,
    activePageId: input.activePageId,
    selectedSlotIndex: input.selectedSlotIndex,
    onboardingDone: input.onboardingDone,
    pages: input.pages,
    assets,
  }
}

export async function deserializeAssets(
  rows: PersistedSnapshot['assets'],
): Promise<Asset[]> {
  const out: Asset[] = []
  for (const row of rows) {
    const file = new File([row.buffer], row.name, {
      type: row.type || undefined,
    })
    const result = await loadAssetFromFile(file)
    if (!result.ok) continue
    // 保持原 id，便于 slots 引用
    const asset = { ...result.asset, id: row.id }
    out.push(asset)
  }
  return out
}

export async function saveSnapshot(snapshot: PersistedSnapshot): Promise<void> {
  try {
    await idbSet('project', snapshot)
  } catch (e) {
    // file:// 等环境下 IndexedDB 可能不可用
    console.warn('IndexedDB save failed', e)
    throw e
  }
}

export async function loadSnapshot(): Promise<PersistedSnapshot | null> {
  try {
    const data = await idbGet<PersistedSnapshot>('project')
    if (!data || data.version !== 1) return null
    return data
  } catch {
    return null
  }
}

export async function clearSnapshot(): Promise<void> {
  await idbSet('project', null)
}

let saveTimer: number | null = null

export function schedulePersist(build: () => Promise<PersistedSnapshot>) {
  if (saveTimer != null) window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    void build()
      .then(saveSnapshot)
      .catch((e) => console.warn('persist failed', e))
  }, 600)
}

export function disposeAllAssets(assets: Asset[]) {
  for (const a of assets) disposeAsset(a)
}
