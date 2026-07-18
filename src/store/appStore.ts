import { create } from 'zustand'
import {
  createEmptySlots,
  defaultModeA,
  DEFAULT_TRANSFORM,
  slotCountForMode,
  type Asset,
  type CanvasLimits,
  type ExportFormat,
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
      type: 'limit' | 'ios_save' | 'busy' | 'project_export_confirm'
      message: string
      maxSide?: number
      suggestedWidth?: number
      suggestedHeight?: number
      pendingAction?: 'export_one' | 'export_all'
      estimateLabel?: string
    }

type AppState = {
  hydrated: boolean
  locale: Locale
  onboardingDone: boolean
  showOnboarding: boolean
  assets: Asset[]
  pages: Page[]
  activePageId: string
  selectedSlotIndex: number
  exportFormat: ExportFormat
  canvasLimits: CanvasLimits | null
  mobileSheet: MobileSheet
  toast: Toast
  exportPreviews: ExportPreviewItem[]
  exportDialog: AppDialog
  exporting: boolean

  setHydrated: (v: boolean) => void
  setLocale: (locale: Locale) => void
  toggleLocale: () => void
  completeOnboarding: () => void
  setShowOnboarding: (v: boolean) => void
  openTutorial: () => void
  setCanvasLimits: (limits: CanvasLimits) => void
  setMobileSheet: (sheet: MobileSheet) => void
  showToast: (message: string) => void
  clearToast: () => void
  setExportFormat: (f: ExportFormat) => void
  setExportDialog: (d: AppDialog) => void
  setExportPreviews: (items: ExportPreviewItem[]) => void
  setExporting: (v: boolean) => void

  addAssets: (assets: Asset[]) => void
  removeAsset: (id: string) => void
  reorderAssets: (from: number, to: number) => void

  addPage: () => void
  closePage: (id: string) => void
  setActivePage: (id: string) => void
  renamePage: (id: string, name: string) => void
  updateMode: (mode: PageMode) => void
  setSelectedSlot: (index: number) => void
  assignAssetToSlot: (slotIndex: number, assetId: string | null) => void
  placeAsset: (assetId: string, preferSlot?: number) => void
  placeAssets: (assetIds: string[]) => void
  updateSlotTransform: (slotIndex: number, transform: Partial<Transform>) => void
  updateSlotFrameScale: (slotIndex: number, frameScale: number) => void
  fillSlotsFromLibrary: () => void

  replaceProject: (data: {
    locale: Locale
    exportFormat: ExportFormat
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

const ONBOARD_KEY = 'stitcher_onboarding_done_v1'

function queuePersist(get: () => AppState) {
  if (!get().hydrated) return
  schedulePersist(async () => {
    const s = get()
    return serializeProject({
      locale: s.locale,
      exportFormat: s.exportFormat,
      activePageId: s.activePageId,
      selectedSlotIndex: s.selectedSlotIndex,
      pages: s.pages,
      assets: s.assets,
      onboardingDone: s.onboardingDone,
    })
  })
}

export const useAppStore = create<AppState>((set, get) => ({
  hydrated: false,
  locale: 'zh',
  onboardingDone: false,
  showOnboarding: false,
  assets: [],
  pages: [initialPage],
  activePageId: initialPage.id,
  selectedSlotIndex: 0,
  exportFormat: 'png',
  canvasLimits: null,
  mobileSheet: 'none',
  toast: null,
  exportPreviews: [],
  exportDialog: null,
  exporting: false,

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
  setExportDialog: (d) => set({ exportDialog: d }),
  setExportPreviews: (items) => set({ exportPreviews: items }),
  setExporting: (v) => set({ exporting: v }),

  addAssets: (assets) => {
    set((s) => ({ assets: [...s.assets, ...assets] }))
    queuePersist(get)
  },

  removeAsset: (id) => {
    const asset = get().assets.find((a) => a.id === id)
    if (asset) disposeAsset(asset)
    set((s) => ({
      assets: s.assets.filter((a) => a.id !== id),
      pages: s.pages.map((p) => ({
        ...p,
        slots: p.slots.map((slot) =>
          slot.assetId === id ? { ...slot, assetId: null } : slot,
        ),
      })),
    }))
    queuePersist(get)
  },

  reorderAssets: (from, to) => {
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
    const trimmed = name.trim()
    set((s) => ({
      pages: s.pages.map((p) =>
        p.id === id ? { ...p, customName: trimmed || null } : p,
      ),
    }))
    queuePersist(get)
  },

  updateMode: (mode) => {
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

  setSelectedSlot: (index) => set({ selectedSlotIndex: index }),

  assignAssetToSlot: (slotIndex, assetId) => {
    set((s) => ({
      pages: s.pages.map((p) => {
        if (p.id !== s.activePageId) return p
        const slots = p.slots.map((slot, i) =>
          i === slotIndex
            ? { assetId, transform: freshTransform() }
            : slot,
        )
        return { ...p, slots }
      }),
    }))
    queuePersist(get)
  },

  placeAsset: (assetId, preferSlot) => {
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
      i === target ? { assetId, transform: freshTransform() } : slot,
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
    const s = get()
    const page = s.pages.find((p) => p.id === s.activePageId)
    if (!page) return

    const slots = page.slots.map((slot) => ({ ...slot }))
    let ai = 0
    for (let i = 0; i < slots.length && ai < assetIds.length; i++) {
      if (slots[i].assetId == null) {
        slots[i] = { assetId: assetIds[ai++], transform: freshTransform() }
      }
    }
    let idx = s.selectedSlotIndex
    while (ai < assetIds.length && slots.length > 0) {
      slots[idx] = { assetId: assetIds[ai++], transform: freshTransform() }
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

  updateSlotTransform: (slotIndex, transform) => {
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

  fillSlotsFromLibrary: () => {
    const { assets, activePageId, pages } = get()
    const page = pages.find((p) => p.id === activePageId)
    if (!page || !assets.length) return
    const filled = page.slots.map((_, i) => ({
      assetId: assets[i]?.id ?? null,
      transform: freshTransform(),
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
    const activeOk = pages.some((p) => p.id === data.activePageId)
    set({
      locale: data.locale,
      exportFormat: data.exportFormat,
      pages,
      assets: data.assets,
      activePageId: activeOk ? data.activePageId : pages[0]?.id,
      selectedSlotIndex: data.selectedSlotIndex ?? 0,
      hydrated: true,
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
        exportFormat: snap.exportFormat === 'jpeg' ? 'jpeg' : 'png',
        pages,
        assets,
        activePageId: activeOk ? snap.activePageId : pages[0].id,
        selectedSlotIndex: snap.selectedSlotIndex ?? 0,
        hydrated: true,
        onboardingDone: onboard,
        showOnboarding: !onboard,
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
