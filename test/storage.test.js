import { store } from '../src/index'
import { describe, it, expect, beforeEach } from 'vitest'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

// Helper to wait for debounced storage operations
const waitForStorage = () => new Promise(resolve => setTimeout(resolve, 10))

describe('Storage Persistence', () => {
  it('should persist to localStorage', async () => {
    const localStore = store({ persisted: false }).local('my-key')

    localStore.set({ persisted: true })

    // Wait for the debounce
    await waitForStorage()

    const fromStorage = JSON.parse(localStorage.getItem('my-key'))
    expect(fromStorage.persisted).toBe(true)
  })

  it('should persist to sessionStorage', async () => {
    const sessionStore = store({ temp: 'data' }).session('my-session')

    sessionStore.set({ temp: 'new data' })

    // Wait for the debounce
    await waitForStorage()

    const fromStorage = JSON.parse(sessionStorage.getItem('my-session'))
    expect(fromStorage.temp).toBe('new data')
  })

  it('should persist nested properties to localStorage', async () => {
    const userStore = store({
      user: {
        name: 'John',
        settings: { theme: 'dark' },
      },
    })

    const themeStore = userStore.user.settings.theme.local('user-theme')

    themeStore.set('light')

    // Wait for the debounce
    await waitForStorage()

    const fromStorage = JSON.parse(localStorage.getItem('user-theme'))
    expect(fromStorage).toBe('light')
  })

  it('should persist nested properties to sessionStorage', async () => {
    const appStore = store({
      app: {
        state: 'loading',
        data: { count: 0 },
      },
    })

    const countStore = appStore.app.data.count.session('app-count')

    countStore.set(42)

    // Wait for the debounce
    await waitForStorage()

    const fromStorage = JSON.parse(sessionStorage.getItem('app-count'))
    expect(fromStorage).toBe(42)
  })
})

describe('Storage Initial Value Handling', () => {
  it('should use stored value and ignore initial value when key exists in localStorage', () => {
    // Pre-populate storage with a value
    localStorage.setItem('existing-key', JSON.stringify({ count: 100 }))

    // Create store with different initial value
    const localStore = store({ count: 0 }).local('existing-key')

    // Should use stored value, not initial value
    expect(localStore.get()).toEqual({ count: 100 })
  })

  it('should use stored value and ignore initial value when key exists in sessionStorage', () => {
    // Pre-populate storage with a value
    sessionStorage.setItem('existing-session', JSON.stringify({ name: 'Stored' }))

    // Create store with different initial value
    const sessionStore = store({ name: 'Initial' }).session('existing-session')

    // Should use stored value, not initial value
    expect(sessionStore.get()).toEqual({ name: 'Stored' })
  })

  it('should use initial value and save it when key does not exist in localStorage', async () => {
    const initialValue = { count: 42 }
    const localStore = store(initialValue).local('new-key')

    // Should use initial value
    expect(localStore.get()).toEqual(initialValue)

    // Wait for initial save
    await waitForStorage()

    // Should be saved to storage
    const fromStorage = JSON.parse(localStorage.getItem('new-key'))
    expect(fromStorage).toEqual(initialValue)
  })

  it('should use initial value and save it when key does not exist in sessionStorage', async () => {
    const initialValue = { data: 'test' }
    const sessionStore = store(initialValue).session('new-session')

    // Should use initial value
    expect(sessionStore.get()).toEqual(initialValue)

    // Wait for initial save
    await waitForStorage()

    // Should be saved to storage
    const fromStorage = JSON.parse(sessionStorage.getItem('new-session'))
    expect(fromStorage).toEqual(initialValue)
  })

  it('should handle null stored value correctly in localStorage', () => {
    // Store null value
    localStorage.setItem('null-key', JSON.stringify(null))

    // Create store with initial value
    const localStore = store({ count: 0 }).local('null-key')

    // Should use null from storage, not initial value
    expect(localStore.get()).toBeNull()
  })

  it('should handle null stored value correctly in sessionStorage', () => {
    // Store null value
    sessionStorage.setItem('null-session', JSON.stringify(null))

    // Create store with initial value
    const sessionStore = store({ count: 0 }).session('null-session')

    // Should use null from storage, not initial value
    expect(sessionStore.get()).toBeNull()
  })

  it('should save initial null value to localStorage when key does not exist', async () => {
    const localStore = store(null).local('null-initial')

    // Should use null initial value
    expect(localStore.get()).toBeNull()

    // Wait for initial save
    await waitForStorage()

    // Should be saved to storage
    const fromStorage = JSON.parse(localStorage.getItem('null-initial'))
    expect(fromStorage).toBeNull()
  })

  it('should save initial null value to sessionStorage when key does not exist', async () => {
    const sessionStore = store(null).session('null-initial-session')

    // Should use null initial value
    expect(sessionStore.get()).toBeNull()

    // Wait for initial save
    await waitForStorage()

    // Should be saved to storage
    const fromStorage = JSON.parse(sessionStorage.getItem('null-initial-session'))
    expect(fromStorage).toBeNull()
  })
})

// Helper to create and dispatch a storage event (simulating changes from other tabs)
// Note: Only localStorage supports cross-tab synchronization via storage events
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

describe('Cross-Tab Synchronization (localStorage only)', () => {
  it('should update localStorage store when storage changes in another tab', async () => {
    const localStore = store({ count: 0 }).local('sync-key')

    // Initial value
    expect(localStore.get()).toEqual({ count: 0 })

    // Simulate storage change from another tab
    const newValue = JSON.stringify({ count: 42 })
    localStorage.setItem('sync-key', newValue)
    dispatchStorageEvent('sync-key', newValue, JSON.stringify({ count: 0 }), localStorage)

    // Wait for event to be processed
    await waitForStorage()

    // Store should be updated
    expect(localStore.get()).toEqual({ count: 42 })
  })

  it('should ignore storage events for different keys', async () => {
    const localStore = store({ count: 0 }).local('my-key')

    // Initial value
    expect(localStore.get()).toEqual({ count: 0 })

    // Simulate storage change for a different key
    const newValue = JSON.stringify({ count: 100 })
    localStorage.setItem('other-key', newValue)
    dispatchStorageEvent('other-key', newValue, null, localStorage)

    // Wait for event to be processed
    await waitForStorage()

    // Store should NOT be updated
    expect(localStore.get()).toEqual({ count: 0 })
  })

  it('should keep in-memory state when key is removed (null value)', async () => {
    const localStore = store({ count: 0 }).local('removed-key')

    localStore.set({ count: 42 })
    await waitForStorage()

    // Simulate key removal from another tab
    localStorage.removeItem('removed-key')
    dispatchStorageEvent('removed-key', null, JSON.stringify({ count: 42 }), localStorage)

    await waitForStorage()

    expect(localStore.get()).toEqual({ count: 42 })
  })

  it('should not trigger save when updating from storage event', async () => {
    const localStore = store({ count: 0 }).local('no-loop-key')

    // Initial value
    expect(localStore.get()).toEqual({ count: 0 })
    await waitForStorage()

    // Clear storage to track if it gets written again
    localStorage.removeItem('no-loop-key')

    // Simulate storage change from another tab
    const newValue = JSON.stringify({ count: 99 })
    localStorage.setItem('no-loop-key', newValue)
    dispatchStorageEvent('no-loop-key', newValue, JSON.stringify({ count: 0 }), localStorage)

    // Wait for event to be processed
    await waitForStorage()

    // Store should be updated
    expect(localStore.get()).toEqual({ count: 99 })

    // The value should still be in storage (not cleared by our update)
    const fromStorage = JSON.parse(localStorage.getItem('no-loop-key'))
    expect(fromStorage).toEqual({ count: 99 })
  })

  it('should handle multiple stores with different keys', async () => {
    const store1 = store({ a: 1 }).local('key1')
    const store2 = store({ b: 2 }).local('key2')

    // Initial values
    expect(store1.get()).toEqual({ a: 1 })
    expect(store2.get()).toEqual({ b: 2 })

    // Simulate storage changes for both keys
    const newValue1 = JSON.stringify({ a: 10 })
    const newValue2 = JSON.stringify({ b: 20 })
    localStorage.setItem('key1', newValue1)
    localStorage.setItem('key2', newValue2)
    dispatchStorageEvent('key1', newValue1, JSON.stringify({ a: 1 }), localStorage)
    dispatchStorageEvent('key2', newValue2, JSON.stringify({ b: 2 }), localStorage)

    // Wait for events to be processed
    await waitForStorage()

    // Both stores should be updated independently
    expect(store1.get()).toEqual({ a: 10 })
    expect(store2.get()).toEqual({ b: 20 })
  })

  it('should preserve object references for unchanged nested paths', async () => {
    const testStore = store({
      user: { name: 'John', age: 30 },
      settings: { theme: 'dark' },
    }).local('nested-sync')

    // Get initial references
    const initialUser = testStore.user.get()
    const initialSettings = testStore.settings.get()

    // Simulate storage change that only updates settings, not user
    const newValue = JSON.stringify({
      user: { name: 'John', age: 30 }, // Same user data
      settings: { theme: 'light' }, // Changed settings
    })
    localStorage.setItem(
      'nested-sync',
      JSON.stringify({
        user: { name: 'John', age: 30 },
        settings: { theme: 'dark' },
      }),
    )
    dispatchStorageEvent(
      'nested-sync',
      newValue,
      JSON.stringify({
        user: { name: 'John', age: 30 },
        settings: { theme: 'dark' },
      }),
      localStorage,
    )

    // Wait for event to be processed
    await waitForStorage()

    // User object reference should be preserved (same object)
    const updatedUser = testStore.user.get()
    expect(updatedUser).toBe(initialUser) // Same reference
    expect(updatedUser).toEqual({ name: 'John', age: 30 }) // Same content

    // Settings object reference should change (different content)
    const updatedSettings = testStore.settings.get()
    expect(updatedSettings).not.toBe(initialSettings) // Different reference
    expect(updatedSettings).toEqual({ theme: 'light' }) // Updated content
  })

  it('should preserve references when new keys are added', async () => {
    const testStore = store({
      user: { name: 'John', age: 30 },
    }).local('add-key-sync')

    // Get initial reference
    const initialUser = testStore.user.get()

    // Simulate storage change that adds a new key but user stays the same
    const newValue = JSON.stringify({
      user: { name: 'John', age: 30 }, // Same user data
      settings: { theme: 'dark' }, // New key added
    })
    localStorage.setItem(
      'add-key-sync',
      JSON.stringify({
        user: { name: 'John', age: 30 },
      }),
    )
    dispatchStorageEvent(
      'add-key-sync',
      newValue,
      JSON.stringify({
        user: { name: 'John', age: 30 },
      }),
      localStorage,
    )

    // Wait for event to be processed
    await waitForStorage()

    // User object reference should still be preserved even though root structure changed
    const updatedUser = testStore.user.get()
    expect(updatedUser).toBe(initialUser) // Same reference
    expect(updatedUser).toEqual({ name: 'John', age: 30 }) // Same content

    // New key should be present
    expect(testStore.get()).toHaveProperty('settings')
    expect(testStore.settings.get()).toEqual({ theme: 'dark' })
  })

  it('should update derived stores when storage event occurs', async () => {
    const localStore = store({ count: 0 }).local('derived-sync-key')
    const derivedStore = store(get => ({ doubled: get(localStore).count * 2 }))

    // Initial values
    expect(localStore.get()).toEqual({ count: 0 })
    expect(derivedStore.get()).toEqual({ doubled: 0 })

    // Simulate storage change from another tab
    const newValue = JSON.stringify({ count: 21 })
    localStorage.setItem('derived-sync-key', newValue)
    dispatchStorageEvent(
      'derived-sync-key',
      newValue,
      JSON.stringify({ count: 0 }),
      localStorage,
    )

    await waitForStorage()

    // Both base and derived store should be updated
    expect(localStore.get()).toEqual({ count: 21 })
    expect(derivedStore.get()).toEqual({ doubled: 42 })
  })

  it('should update derived stores created with .derive() when storage event occurs', async () => {
    const localStore = store({ count: 0 }).local('derive-sync-key')
    const derivedStore = localStore.derive(value => ({
      doubled: value.count * 2,
      label: `Count × 2 = ${value.count * 2}`,
    }))

    // Initial values
    expect(localStore.get()).toEqual({ count: 0 })
    expect(derivedStore.get()).toEqual({ doubled: 0, label: 'Count × 2 = 0' })

    // Simulate storage change from another tab
    const newValue = JSON.stringify({ count: 5 })
    localStorage.setItem('derive-sync-key', newValue)
    dispatchStorageEvent(
      'derive-sync-key',
      newValue,
      JSON.stringify({ count: 0 }),
      localStorage,
    )

    await waitForStorage()

    // Both base and derived store should be updated
    expect(localStore.get()).toEqual({ count: 5 })
    expect(derivedStore.get()).toEqual({ doubled: 10, label: 'Count × 2 = 10' })
  })
})
