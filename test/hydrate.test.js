import { describe, it, expect, beforeEach, vi } from 'vitest'
import { store } from '../src/index'

const waitForStorage = () => new Promise(resolve => setTimeout(resolve, 10))

const dispatchStorageEvent = (key, newValue, oldValue, storageArea) => {
  const event = new StorageEvent('storage', {
    key,
    newValue,
    oldValue,
    storageArea,
    url: window.location.href,
  })
  window.dispatchEvent(event)
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe('explicit hydration', () => {
  it('keeps the store in memory until hydrate is called', async () => {
    localStorage.setItem('settings', JSON.stringify({ theme: 'light' }))
    const settings = store({ theme: 'dark' })

    settings.set({ theme: 'sepia' })
    await waitForStorage()

    expect(settings.get()).toEqual({ theme: 'sepia' })
    expect(JSON.parse(localStorage.getItem('settings'))).toEqual({
      theme: 'light',
    })

    settings.hydrate({ storage: 'local', key: 'settings' })
    expect(settings.get()).toEqual({ theme: 'light' })
    settings.destroy()
  })

  it('creates a missing key from the current store value', () => {
    const settings = store({ theme: 'dark' })
    settings.set({ theme: 'sepia' })

    settings.hydrate({ storage: 'local', key: 'settings' })

    expect(settings.get()).toEqual({ theme: 'sepia' })
    expect(JSON.parse(localStorage.getItem('settings'))).toEqual({
      theme: 'sepia',
    })
    settings.destroy()
  })

  it('hydrates the same store instance from an existing key', () => {
    localStorage.setItem('settings', JSON.stringify({ theme: 'light' }))
    const settings = store({ theme: 'dark' })

    const hydrated = settings.hydrate({
      storage: 'local',
      key: 'settings',
    })

    expect(hydrated).toBe(settings)
    expect(settings.get()).toEqual({ theme: 'light' })
    settings.destroy()
  })

  it('notifies subscribers and derived stores when an existing key wins', () => {
    localStorage.setItem('count', JSON.stringify({ n: 3 }))
    const count = store({ n: 0 })
    const doubled = count.derive(value => value.n * 2)
    let notifications = 0
    count._obj.listeners.add(() => notifications++)

    count.hydrate({ storage: 'local', key: 'count' })

    expect(count.get()).toEqual({ n: 3 })
    expect(doubled.get()).toBe(6)
    expect(notifications).toBe(1)
    count.destroy()
    doubled.destroy()
  })

  it('persists subsequent writes', async () => {
    const settings = store({ theme: 'dark' })
    settings.hydrate({ storage: 'local', key: 'settings' })

    settings.set({ theme: 'light' })
    await waitForStorage()

    expect(JSON.parse(localStorage.getItem('settings'))).toEqual({
      theme: 'light',
    })
    settings.destroy()
  })

  it('supports sessionStorage with the same semantics', async () => {
    sessionStorage.setItem('temp', JSON.stringify({ n: 1 }))
    const temp = store({ n: 0 })

    temp.hydrate({ storage: 'session', key: 'temp' })
    expect(temp.get()).toEqual({ n: 1 })

    temp.set({ n: 2 })
    await waitForStorage()
    expect(JSON.parse(sessionStorage.getItem('temp'))).toEqual({ n: 2 })
    temp.destroy()
  })

  it('loads a stored null rather than treating it as a missing key', () => {
    localStorage.setItem('nullable', JSON.stringify(null))
    const nullable = store({ present: true })

    nullable.hydrate({ storage: 'local', key: 'nullable' })

    expect(nullable.get()).toBeNull()
    nullable.destroy()
  })

  it('can retry after storage is unavailable on the first attempt', () => {
    const originalStorage = globalThis.localStorage
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const settings = store({ theme: 'dark' })

    try {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: undefined,
      })
      settings.hydrate({ storage: 'local', key: 'settings' })
      expect(settings.get()).toEqual({ theme: 'dark' })
      expect(warn).toHaveBeenCalledOnce()
    } finally {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: originalStorage,
      })
      warn.mockRestore()
    }

    settings.hydrate({ storage: 'local', key: 'settings' })
    expect(JSON.parse(localStorage.getItem('settings'))).toEqual({
      theme: 'dark',
    })
    settings.destroy()
  })
})

describe('hydration retargeting', () => {
  it('creates a missing new key from the current store value', async () => {
    localStorage.setItem('v1', JSON.stringify({ n: 1 }))
    const s = store({ n: 0 })
    s.hydrate({ storage: 'local', key: 'v1' })

    s.set({ n: 99 })
    await waitForStorage()
    s.hydrate({ storage: 'local', key: 'v2' })

    expect(s.get()).toEqual({ n: 99 })
    expect(JSON.parse(localStorage.getItem('v1'))).toEqual({ n: 99 })
    expect(JSON.parse(localStorage.getItem('v2'))).toEqual({ n: 99 })
    s.destroy()
  })

  it('loads an existing value from the new key', () => {
    localStorage.setItem('a', JSON.stringify({ n: 1 }))
    localStorage.setItem('b', JSON.stringify({ n: 2 }))
    const s = store({ n: 0 })

    s.hydrate({ storage: 'local', key: 'a' })
    s.hydrate({ storage: 'local', key: 'b' })

    expect(s.get()).toEqual({ n: 2 })
    expect(JSON.parse(localStorage.getItem('a'))).toEqual({ n: 1 })
    s.destroy()
  })

  it('writes subsequent updates to the new key only', async () => {
    const s = store({ n: 0 })
    s.hydrate({ storage: 'local', key: 'a' })
    s.hydrate({ storage: 'local', key: 'b' })
    s.set({ n: 3 })
    await waitForStorage()

    expect(JSON.parse(localStorage.getItem('a'))).toEqual({ n: 0 })
    expect(JSON.parse(localStorage.getItem('b'))).toEqual({ n: 3 })
    s.destroy()
  })

  it('leaves the old key stale when switching with a pending write', () => {
    const s = store({ n: 0 })
    s.hydrate({ storage: 'local', key: 'a', debounce: 5000 })
    s.set({ n: 7 })

    s.hydrate({ storage: 'local', key: 'b' })

    expect(JSON.parse(localStorage.getItem('a'))).toEqual({ n: 0 })
    expect(JSON.parse(localStorage.getItem('b'))).toEqual({ n: 7 })
    s.destroy()
  })

  it('can switch from localStorage to sessionStorage', async () => {
    const s = store({ n: 0 })
    s.hydrate({ storage: 'local', key: 'shared' })
    s.set({ n: 4 })
    await waitForStorage()

    s.hydrate({ storage: 'session', key: 'shared' })
    s.set({ n: 5 })
    await waitForStorage()

    expect(JSON.parse(localStorage.getItem('shared'))).toEqual({ n: 4 })
    expect(JSON.parse(sessionStorage.getItem('shared'))).toEqual({ n: 5 })
    s.destroy()
  })

  it('ignores storage events for the previous key after retargeting', async () => {
    const s = store({ n: 0 })
    s.hydrate({ storage: 'local', key: 'a' })
    s.hydrate({ storage: 'local', key: 'b' })

    const otherTab = JSON.stringify({ n: 8 })
    localStorage.setItem('a', otherTab)
    dispatchStorageEvent('a', otherTab, JSON.stringify({ n: 0 }), localStorage)
    await waitForStorage()

    expect(s.get()).toEqual({ n: 0 })
    s.destroy()
  })

  it('listens for storage events on the new key', async () => {
    const s = store({ n: 0 })
    s.hydrate({ storage: 'local', key: 'a' })
    s.hydrate({ storage: 'local', key: 'b' })

    const otherTab = JSON.stringify({ n: 4 })
    localStorage.setItem('b', otherTab)
    dispatchStorageEvent('b', otherTab, JSON.stringify({ n: 0 }), localStorage)
    await waitForStorage()

    expect(s.get()).toEqual({ n: 4 })
    s.destroy()
  })

  it('can bind again after destroy', async () => {
    const s = store({ n: 0 })
    s.hydrate({ storage: 'local', key: 'a' })
    s.set({ n: 1 })
    await waitForStorage()
    s.destroy()

    s.set({ n: 2 })
    s.hydrate({ storage: 'local', key: 'b' })
    s.set({ n: 3 })
    await waitForStorage()

    expect(JSON.parse(localStorage.getItem('a'))).toEqual({ n: 1 })
    expect(JSON.parse(localStorage.getItem('b'))).toEqual({ n: 3 })
    s.destroy()
  })

  it('leaves the old local() key stale when retargeting', () => {
    localStorage.setItem('b', JSON.stringify({ n: 2 }))
    const s = store({ n: 0 }).local('a', { debounce: 5000 })
    s.set({ n: 1 })

    s.hydrate({ storage: 'local', key: 'b' })

    expect(JSON.parse(localStorage.getItem('a'))).toEqual({ n: 0 })
    expect(s.get()).toEqual({ n: 2 })
    s.destroy()
  })
})

describe('hydrate validation', () => {
  it('rejects an unknown storage backend', () => {
    const s = store({ n: 0 })
    expect(() => s.hydrate({ storage: 'cookie', key: 'a' })).toThrow(
      /storage must be either/,
    )
  })

  it('requires a string key', () => {
    const s = store({ n: 0 })
    expect(() => s.hydrate({ storage: 'local' })).toThrow(
      /key must be a string/,
    )
  })

  it('rejects hydration from a nested proxy', () => {
    const s = store({ nested: { n: 0 } })
    expect(() => s.nested.hydrate({ storage: 'local', key: 'nested' })).toThrow(
      /root store/,
    )
  })
})
