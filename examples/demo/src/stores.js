import { store } from '../../../src/index.js'

// ─── App registry ────────────────────────────────

export const APPS = [
  { id: 'files', title: 'Files', color: '#3b82f6', icon: '📁' },
  { id: 'notes', title: 'Notes', color: '#22c55e', icon: '📝' },
  { id: 'terminal', title: 'Terminal', color: '#f97316', icon: '⬛' },
  { id: 'settings', title: 'Settings', color: '#a855f7', icon: '⚙️' },
  { id: 'browser', title: 'Browser', color: '#ef4444', icon: '🌐' },
]

const DEFAULT_SIZE = { width: 560, height: 400 }
let cascadeOffset = 0

// ─── Windows store ───────────────────────────────

export const windowsStore = store({}).local('wm-windows')

let cachedIds = []
export const windowIdsStore = windowsStore.derive(w => {
  const keys = Object.keys(w)
  if (
    keys.length === cachedIds.length &&
    keys.every((id, i) => id === cachedIds[i])
  )
    return cachedIds
  cachedIds = keys
  return keys
})

// ─── Focus ───────────────────────────────────────

export const focusedWindowStore = store(null)

const focusCache = new Map()
export const getWindowFocusStore = id => {
  if (!focusCache.has(id)) {
    focusCache.set(id, focusedWindowStore.derive(fid => fid === id))
  }
  return focusCache.get(id)
}

// ─── Spaces ──────────────────────────────────────

export const spacesStore = store([{ id: 'default', name: 'Default' }]).local(
  'wm-spaces',
)
export const activeSpaceStore = store('default').session('wm-active-space')
export const spacesViewStore = store(false)

// ─── Insets (observed by ResizeObservers in App/Taskbar) ──

export const topNavInsetStore = store(48)
export const taskbarInsetStore = store(60)

// ─── Operations ──────────────────────────────────

export const bringToFront = id => {
  const w = windowsStore.get()
  if (!w[id]) return
  const maxZ = Math.max(0, ...Object.values(w).map(v => v.zIndex || 0))
  if (w[id].zIndex <= maxZ) {
    windowsStore[id].set(p => ({ ...p, zIndex: maxZ + 1 }))
  }
  focusedWindowStore.set(id)
}

export const openWindow = appId => {
  const app = APPS.find(a => a.id === appId)
  if (!app) return
  const existing = windowsStore[appId].get()
  if (existing) {
    windowsStore[appId].set(p => ({ ...p, open: true, space: activeSpaceStore.get() }))
    bringToFront(appId)
    return
  }
  const offset = (cascadeOffset++ % 6) * 30
  windowsStore[appId].set({
    id: appId,
    title: app.title,
    color: app.color,
    icon: app.icon,
    open: true,
    position: { x: 120 + offset, y: 60 + offset },
    size: { ...DEFAULT_SIZE },
    zIndex: 0,
    space: activeSpaceStore.get(),
  })
  bringToFront(appId)
}

export const closeWindow = id => {
  windowsStore[id].set(p => ({ ...p, open: false }))
  if (focusedWindowStore.get() === id) focusedWindowStore.set(null)
}

export const destroyWindow = id => {
  windowsStore.set(p => {
    const n = { ...p }
    delete n[id]
    return n
  })
  if (focusedWindowStore.get() === id) focusedWindowStore.set(null)
}
