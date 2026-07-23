import { create } from 'zustand'
import {
  createEmptySlots,
  defaultModeA,
  DEFAULT_TRANSFORM,
  slotCountForMode,
  type Asset,
  type CanvasLimits,
  type ExportFormat,
  type ExportSizePreset,
  type ExportPreviewItem,
  type Page,
  type PageMode,
  type Slot,
  type Transform,
} from '../types'
import { uid } from '../utils/formatName'
import { migratePage } from '../utils/pageName'
import { disposeAsset } from '../image/loadAsset'
import type { Locale } from '../i18n/messages'
import {
  deserializeAssets,
  disposeAllAssets,
  loadSnapshot,
  schedulePersist,
  serializeProject,
  type PersistedSnapshot,
} from '../core/persist'

type MobileSheet = 'none' | 'library' | 'params'

type Toast = { id: string; message: string } | null

export type AppDialog =
  | null
  | {
      type:
        | 'limit'
        | 'ios_save'
        | 'busy'
        | 'project_export_confirm'
        | 'clear_confirm'
      message: string
      maxSide?: number
      suggestedWidth?: number
      suggestedHeight?: number
      pendingAction?: 'export_one' | 'export_all'
      estimateLabel?: string
    }

export type UiTheme = 'dark' | 'light'

type HistorySnap = {
  pages: Page[]
  activePageId: string
  selectedSlotIndex: number
  assetOrder: string[]
}

const HISTORY_MAX = 40
const THEME_KEY = 'stitcher_theme_v1'
const ONBOARD_KEY = 'stitcher_onboarding_done_v1'

/** 会话内素材保险库：删除/清空后仍可撤销恢复，不立刻 dispose */
const assetVault = new Map<string, Asset>()

function readStoredTheme(): UiTheme {
  try {
    const v = localStorage.getItem(THEME_KEY)
    if (v === 'light' || v === 'dark') return v
  } catch {
    /* ignore */
  }
  return 'dark'
}

function applyTheme(theme: UiTheme) {
  document.documentElement.setAttribute('data-theme', theme)
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    /* ignore */
  }
}

function clonePages(pages: Page[]): Page[] {
  return pages.map((p) => ({
    ...p,
    mode: { ...p.mode } as PageMode,
    slots: p.slots.map((s) => ({
      ...s,
      transform: { ...s.transform },
    })),
  }))
}

function takeSnap(s: {
  pages: Page[]
  activePageId: string
  selectedSlotIndex: number
  assets: Asset[]
}): HistorySnap {
  return {
    pages: clonePages(s.pages),
    activePageId: s.activePageId,
    selectedSlotIndex: s.selectedSlotIndex,
    assetOrder: s.assets.map((a) => a.id),
  }
}

function vaultAsset(a: Asset) {
  assetVault.set(a.id, a)
}

function rebuildAssets(order: string[]): Asset[] {
  const out: Asset[] = []
  for (const id of order) {
    const a = assetVault.get(id)
    if (a) out.push(a)
  }
  return out
}

function pruneVault(keepIds: Set<string>) {
  for (const [id, asset] of assetVault) {
    if (keepIds.has(id)) continue
    disposeAsset(asset)
    assetVault.delete(id)
  }
}

function collectKeepIds(
  assets: Asset[],
  history: HistorySnap[],
): Set<string> {
  const keep = new Set(assets.map((a) => a.id))
  for (const h of history) {
    for (const id of h.assetOrder) keep.add(id)
  }
  return keep
}

type AppState = {
  hydrated: boolean
  locale: Locale
  theme: UiTheme
  onboardingDone: boolean
  showOnboarding: boolean
  showAbout: boolean
  assets: Asset[]
  pages: Page[]
  activePageId: string
  selectedSlotIndex: number
  exportFormat: ExportFormat
  exportSize: ExportSizePreset
  canvasLimits: CanvasLimits | null
  mobileSheet: MobileSheet
  toast: Toast
  exportPreviews: ExportPreviewItem[]
  exportDialog: AppDialog
  exporting: boolean
  history: HistorySnap[]

  setHydrated: (v: boolean) => void
  setLocale: (locale: Locale) => void
  toggleLocale: () => void
  setTheme: (theme: UiTheme) => void
  toggleTheme: () => void
  completeOnboarding: () => void
  setShowOnboarding: (v: boolean) => void
  setShowAbout: (v: boolean) => void
  openTutorial: () => void
  setCanvasLimits: (limits: CanvasLimits) => void
  setMobileSheet: (sheet: MobileSheet) => void
  showToast: (message: string) => void
  clearToast: () => void
  setExportFormat: (f: ExportFormat) => void
  setExportSize: (s: ExportSizePreset) => void
  setExportDialog: (d: AppDialog) => void
  setExportPreviews: (items: ExportPreviewItem[]) => void
  setExporting: (v: boolean) => void

  pushHistory: () => void
  undo: () => boolean
  canUndo: () => boolean
  clearProject: () => void

  addAssets: (assets: Asset[]) => void
  removeAsset: (id: string) => void
  reorderAssets: (from: number, to: number) => void

  addPage: () => void
  closePage: (id: string) => void
  setActivePage: (id: string) => void
  renamePage: (id: string, name: string) => void
  updateMode: (mode: PageMode) => void
  setPageBackground: (color: string | undefined) => void
  setSelectedSlot: (index: number) => void
  assignAssetToSlot: (slotIndex: number, assetId: string | null) => void
  placeAsset: (assetId: string, preferSlot?: number) => void
  placeAssets: (assetIds: string[]) => void
  updateSlotTransform: (slotIndex: number, transform: Partial<Transform>) => void
  updateSlotFrameScale: (slotIndex: number, frameScale: number) => void
  updateSlotShadow: (slotIndex: number, shadow: number) => void
  swapSlots: (a: number, b: number) => void
  fillSlotsFromLibrary: () => void

  replaceProject: (data: {
    locale: Locale
    exportFormat: ExportFormat
    exportSize?: ExportSizePreset
    activePageId: string
    selectedSlotIndex: number
    pages: Page[]
    assets: Asset[]
  }) => void
  hydrateFromDisk: () => Promise<void>
  persistNow: () => void
}

function makePage(): Page {
  const mode = defaultModeA()
  return {
    id: uid('page'),
    customName: null,
    mode,
    slots: createEmptySlots(slotCountForMode(mode)),
  }
}

function syncSlots(prev: Slot[], count: number): Slot[] {
  const next = prev.slice(0, count).map((s) => ({
    ...s,
    transform: { ...DEFAULT_TRANSFORM, ...s.transform },
  }))
  while (next.length < count) {
    next.push({ assetId: null, transform: { ...DEFAULT_TRANSFORM } })
  }
  return next
}

function freshTransform(): Transform {
  return { ...DEFAULT_TRANSFORM }
}

const initialPage = makePage()

function normalizeExportFormat(v: unknown): ExportFormat {
  if (v === 'png' || v === 'jpeg100') return v
  return 'jpeg'
}

function normalizeExportSize(v: unknown): ExportSizePreset {
  if (v === 'original' || v === '2k') return v
  return '4k'
}

function queuePersist(get: () => AppState) {
  if (!get().hydrated) return
  schedulePersist(async () => {
    const s = get()
    return serializeProject({
      locale: s.locale,
      exportFormat: s.exportFormat,
      exportSize: s.exportSize,
      activePageId: s.activePageId,
      selectedSlotIndex: s.selectedSlotIndex,
      pages: s.pages,
      assets: s.assets,
      onboardingDone: s.onboardingDone,
    })
  })
}

function withHistory(get: () => AppState, set: (partial: Partial<AppState>) => void) {
  const s = get()
  const snap = takeSnap(s)
  const history = [...s.history, snap].slice(-HISTORY_MAX)
  set({ history })
  pruneVault(collectKeepIds(s.assets, history))
}

export const useAppStore = create<AppState>((set, get) => ({
  hydrated: false,
  locale: 'zh',
  theme: readStoredTheme(),
  onboardingDone: false,
  showOnboarding: false,
  showAbout: false,
  assets: [],
  pages: [initialPage],
  activePageId: initialPage.id,
  selectedSlotIndex: 0,
  exportFormat: 'jpeg',
  exportSize: '4k',
  canvasLimits: null,
  mobileSheet: 'none',
  toast: null,
  exportPreviews: [],
  exportDialog: null,
  exporting: false,
  history: [],

  setHydrated: (v) => set({ hydrated: v }),
  setLocale: (locale) => {
    set({ locale })
    queuePersist(get)
  },
  toggleLocale: () => {
    const next = get().locale === 'zh' ? 'en' : 'zh'
    set({ locale: next })
    queuePersist(get)
  },
  setTheme: (theme) => {
    applyTheme(theme)
    set({ theme })
  },
  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    set({ theme: next })
  },
  completeOnboarding: () => {
    try {
      localStorage.setItem(ONBOARD_KEY, '1')
    } catch {
      /* ignore */
    }
    set({ onboardingDone: true, showOnboarding: false })
    queuePersist(get)
  },
  setShowOnboarding: (v) => set({ showOnboarding: v }),
  setShowAbout: (v) => set({ showAbout: v }),
  openTutorial: () => set({ showOnboarding: true }),
  setCanvasLimits: (limits) => set({ canvasLimits: limits }),
  setMobileSheet: (sheet) => set({ mobileSheet: sheet }),
  showToast: (message) => {
    const id = uid('toast')
    set({ toast: { id, message } })
    window.setTimeout(() => {
      if (get().toast?.id === id) set({ toast: null })
    }, 4000)
  },
  clearToast: () => set({ toast: null }),
  setExportFormat: (f) => {
    set({ exportFormat: f })
    queuePersist(get)
  },
  setExportSize: (s) => {
    set({ exportSize: s })
    queuePersist(get)
  },
  setExportDialog: (d) => set({ exportDialog: d }),
  setExportPreviews: (items) => set({ exportPreviews: items }),
  setExporting: (v) => set({ exporting: v }),

  pushHistory: () => {
    withHistory(get, set)
  },

  canUndo: () => get().history.length > 0,

  undo: () => {
    const s = get()
    if (!s.history.length) return false
    const history = [...s.history]
    const snap = history.pop()!
    const assets = rebuildAssets(snap.assetOrder)
    set({
      history,
      pages: clonePages(snap.pages),
      activePageId: snap.activePageId,
      selectedSlotIndex: snap.selectedSlotIndex,
      assets,
    })
    pruneVault(collectKeepIds(assets, history))
    queuePersist(get)
    return true
  },

  clearProject: () => {
    withHistory(get, set)
    const page = makePage()
    set({
      assets: [],
      pages: [page],
      activePageId: page.id,
      selectedSlotIndex: 0,
    })
    pruneVault(collectKeepIds([], get().history))
    queuePersist(get)
  },

  addAssets: (assets) => {
    withHistory(get, set)
    for (const a of assets) vaultAsset(a)
    set((s) => ({ assets: [...s.assets, ...assets] }))
    queuePersist(get)
  },

  removeAsset: (id) => {
    withHistory(get, set)
    // 不立刻 dispose：留在 vault 供撤销
    set((s) => ({
      assets: s.assets.filter((a) => a.id !== id),
      pages: s.pages.map((p) => ({
        ...p,
        slots: p.slots.map((slot) =>
          slot.assetId === id ? { ...slot, assetId: null } : slot,
        ),
      })),
    }))
    pruneVault(collectKeepIds(get().assets, get().history))
    queuePersist(get)
  },

  reorderAssets: (from, to) => {
    withHistory(get, set)
    set((s) => {
      if (
        from === to ||
        from < 0 ||
        to < 0 ||
        from >= s.assets.length ||
        to >= s.assets.length
      ) {
        return s
      }
      const assets = [...s.assets]
      const [item] = assets.splice(from, 1)
      assets.splice(to, 0, item)
      return { assets }
    })
    queuePersist(get)
  },

  addPage: () => {
    withHistory(get, set)
    const page = makePage()
    set((s) => ({
      pages: [...s.pages, page],
      activePageId: page.id,
      selectedSlotIndex: 0,
    }))
    queuePersist(get)
  },

  closePage: (id) => {
    const { pages, activePageId } = get()
    if (pages.length <= 1) return
    withHistory(get, set)
    const idx = pages.findIndex((p) => p.id === id)
    const nextPages = pages.filter((p) => p.id !== id)
    let nextActive = activePageId
    if (activePageId === id) {
      nextActive = nextPages[Math.max(0, idx - 1)]?.id ?? nextPages[0].id
    }
    set({ pages: nextPages, activePageId: nextActive, selectedSlotIndex: 0 })
    queuePersist(get)
  },

  setActivePage: (id) => {
    set({ activePageId: id, selectedSlotIndex: 0 })
    queuePersist(get)
  },

  renamePage: (id, name) => {
    withHistory(get, set)
    const trimmed = name.trim()
    set((s) => ({
      pages: s.pages.map((p) =>
        p.id === id ? { ...p, customName: trimmed || null } : p,
      ),
    }))
    queuePersist(get)
  },

  updateMode: (mode) => {
    withHistory(get, set)
    const count = slotCountForMode(mode)
    set((s) => ({
      pages: s.pages.map((p) =>
        p.id === s.activePageId
          ? { ...p, mode, slots: syncSlots(p.slots, count) }
          : p,
      ),
      selectedSlotIndex: 0,
    }))
    queuePersist(get)
  },

  setPageBackground: (color) => {
    withHistory(get, set)
    set((s) => ({
      pages: s.pages.map((p) =>
        p.id === s.activePageId
          ? { ...p, backgroundColor: color }
          : p,
      ),
    }))
    queuePersist(get)
  },

  setSelectedSlot: (index) => set({ selectedSlotIndex: index }),

  assignAssetToSlot: (slotIndex, assetId) => {
    withHistory(get, set)
    set((s) => ({
      pages: s.pages.map((p) => {
        if (p.id !== s.activePageId) return p
        const slots = p.slots.map((slot, i) =>
          i === slotIndex
            ? {
                assetId,
                transform: freshTransform(),
                shadow: slot.shadow,
                frameScale: slot.frameScale,
              }
            : slot,
        )
        return { ...p, slots }
      }),
    }))
    queuePersist(get)
  },

  placeAsset: (assetId, preferSlot) => {
    withHistory(get, set)
    const s = get()
    const page = s.pages.find((p) => p.id === s.activePageId)
    if (!page) return

    let target =
      preferSlot != null && preferSlot >= 0 && preferSlot < page.slots.length
        ? preferSlot
        : -1

    if (target < 0) {
      const selectedEmpty =
        page.slots[s.selectedSlotIndex]?.assetId == null
          ? s.selectedSlotIndex
          : -1
      target =
        selectedEmpty >= 0
          ? selectedEmpty
          : page.slots.findIndex((slot) => slot.assetId == null)
    }
    if (target < 0) target = s.selectedSlotIndex

    const slots = page.slots.map((slot, i) =>
      i === target
        ? {
            assetId,
            transform: freshTransform(),
            shadow: slot.shadow,
            frameScale: slot.frameScale,
          }
        : slot,
    )
    const nextEmpty = slots.findIndex((slot) => slot.assetId == null)

    set({
      pages: s.pages.map((p) =>
        p.id === s.activePageId ? { ...p, slots } : p,
      ),
      selectedSlotIndex: nextEmpty >= 0 ? nextEmpty : target,
    })
    queuePersist(get)
  },

  placeAssets: (assetIds) => {
    if (!assetIds.length) return
    withHistory(get, set)
    const s = get()
    const page = s.pages.find((p) => p.id === s.activePageId)
    if (!page) return

    const slots = page.slots.map((slot) => ({ ...slot }))
    let ai = 0
    for (let i = 0; i < slots.length && ai < assetIds.length; i++) {
      if (slots[i].assetId == null) {
        slots[i] = {
          assetId: assetIds[ai++],
          transform: freshTransform(),
          shadow: slots[i].shadow,
          frameScale: slots[i].frameScale,
        }
      }
    }
    let idx = s.selectedSlotIndex
    while (ai < assetIds.length && slots.length > 0) {
      slots[idx] = {
        assetId: assetIds[ai++],
        transform: freshTransform(),
        shadow: slots[idx].shadow,
        frameScale: slots[idx].frameScale,
      }
      idx = (idx + 1) % slots.length
    }
    const nextEmpty = slots.findIndex((slot) => slot.assetId == null)
    set({
      pages: s.pages.map((p) =>
        p.id === s.activePageId ? { ...p, slots } : p,
      ),
      selectedSlotIndex:
        nextEmpty >= 0
          ? nextEmpty
          : Math.min(s.selectedSlotIndex, slots.length - 1),
    })
    queuePersist(get)
  },

  swapSlots: (a, b) => {
    const s = get()
    const page = s.pages.find((p) => p.id === s.activePageId)
    if (!page) return
    if (!page.slots[a] || !page.slots[b] || a === b) return
    withHistory(get, set)
    const slots = [...page.slots]
    ;[slots[a], slots[b]] = [slots[b], slots[a]]
    set({
      pages: get().pages.map((p) =>
        p.id === get().activePageId ? { ...p, slots } : p,
      ),
    })
    queuePersist(get)
  },

  updateSlotTransform: (slotIndex, transform) => {
    // 连续手势：由调用方在 pointerdown 时 pushHistory，此处不重复推
    set((s) => ({
      pages: s.pages.map((p) => {
        if (p.id !== s.activePageId) return p
        const slots = p.slots.map((slot, i) =>
          i === slotIndex
            ? { ...slot, transform: { ...slot.transform, ...transform } }
            : slot,
        )
        return { ...p, slots }
      }),
    }))
    queuePersist(get)
  },

  updateSlotFrameScale: (slotIndex, frameScale) => {
    set((s) => ({
      pages: s.pages.map((p) => {
        if (p.id !== s.activePageId) return p
        const slots = p.slots.map((slot, i) =>
          i === slotIndex ? { ...slot, frameScale } : slot,
        )
        return { ...p, slots }
      }),
    }))
    queuePersist(get)
  },

  updateSlotShadow: (slotIndex, shadow) => {
    set((s) => ({
      pages: s.pages.map((p) => {
        if (p.id !== s.activePageId) return p
        const slots = p.slots.map((slot, i) =>
          i === slotIndex
            ? { ...slot, shadow: Math.min(1, Math.max(0, shadow)) }
            : slot,
        )
        return { ...p, slots }
      }),
    }))
    queuePersist(get)
  },

  fillSlotsFromLibrary: () => {
    withHistory(get, set)
    const { assets, activePageId, pages } = get()
    const page = pages.find((p) => p.id === activePageId)
    if (!page || !assets.length) return
    const filled = page.slots.map((slot, i) => ({
      assetId: assets[i]?.id ?? null,
      transform: freshTransform(),
      shadow: slot.shadow,
      frameScale: slot.frameScale,
    }))
    const nextEmpty = filled.findIndex((slot) => slot.assetId == null)
    set((s) => ({
      pages: s.pages.map((p) =>
        p.id === activePageId ? { ...p, slots: filled } : p,
      ),
      selectedSlotIndex: nextEmpty >= 0 ? nextEmpty : 0,
    }))
    queuePersist(get)
  },

  replaceProject: (data) => {
    disposeAllAssets(get().assets)
    for (const a of assetVault.values()) disposeAsset(a)
    assetVault.clear()
    const pages = data.pages.map((p) => {
      const migrated = migratePage(p as unknown as Record<string, unknown>)
      return {
        ...migrated,
        slots: migrated.slots.map((s) => ({
          ...s,
          transform: { ...DEFAULT_TRANSFORM, ...s.transform },
        })),
      }
    })
    for (const a of data.assets) vaultAsset(a)
    const activeOk = pages.some((p) => p.id === data.activePageId)
    set({
      locale: data.locale,
      exportFormat: normalizeExportFormat(data.exportFormat),
      exportSize: normalizeExportSize(data.exportSize),
      pages,
      assets: data.assets,
      activePageId: activeOk ? data.activePageId : pages[0]?.id,
      selectedSlotIndex: data.selectedSlotIndex ?? 0,
      hydrated: true,
      history: [],
    })
    queuePersist(get)
  },

  hydrateFromDisk: async () => {
    let localOnboard = false
    try {
      localOnboard = localStorage.getItem(ONBOARD_KEY) === '1'
    } catch {
      /* ignore */
    }
    try {
      const snap = await loadSnapshot()
      if (!snap || !snap.pages?.length) {
        const needOnboard = !localOnboard
        set({
          hydrated: true,
          onboardingDone: localOnboard,
          showOnboarding: needOnboard,
        })
        return
      }
      const assets = await deserializeAssets(snap.assets)
      for (const a of assets) vaultAsset(a)
      const pages = snap.pages.map((p) => {
        const migrated = migratePage(p as unknown as Record<string, unknown>)
        return {
          ...migrated,
          slots: migrated.slots.map((s) => ({
            ...s,
            transform: { ...DEFAULT_TRANSFORM, ...s.transform },
          })),
        }
      })
      disposeAllAssets(get().assets)
      const activeOk = pages.some((p) => p.id === snap.activePageId)
      const onboard =
        localOnboard || Boolean((snap as { onboardingDone?: boolean }).onboardingDone)
      set({
        locale: snap.locale === 'en' ? 'en' : 'zh',
        exportFormat: normalizeExportFormat(snap.exportFormat),
        exportSize: normalizeExportSize(snap.exportSize),
        pages,
        assets,
        activePageId: activeOk ? snap.activePageId : pages[0].id,
        selectedSlotIndex: snap.selectedSlotIndex ?? 0,
        hydrated: true,
        onboardingDone: onboard,
        showOnboarding: !onboard,
        history: [],
      })
      if (assets.length || pages.length > 1) {
        const { t } = await import('../i18n/messages')
        get().showToast(t(get().locale, 'hydrated'))
      }
    } catch (e) {
      console.warn(e)
      set({
        hydrated: true,
        onboardingDone: localOnboard,
        showOnboarding: !localOnboard,
      })
    }
  },

  persistNow: () => queuePersist(get),
}))

export function getActivePage(): Page | undefined {
  const s = useAppStore.getState()
  return s.pages.find((p) => p.id === s.activePageId)
}

export function assetsMap(): Map<string, Asset> {
  return new Map(useAppStore.getState().assets.map((a) => [a.id, a]))
}

export type { PersistedSnapshot }
