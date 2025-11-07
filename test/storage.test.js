import { store } from '../src/index'
import { describe, it, expect, beforeEach } from 'vitest'

// Reset stores before each test
beforeEach(() => {
  // Clear local and session storage
  localStorage.clear()
  sessionStorage.clear()
})

// Helper to wait for debounced storage operations
const waitForStorage = () => new Promise(resolve => setTimeout(resolve, 10))

describe('Storage Persistence', () => {
  it('should persist to localStorage', () => {
    const localStore = store({ persisted: false }).local('my-key')

    localStore.set({ persisted: true })

    // Wait for the debounce
    setTimeout(() => {
      const fromStorage = JSON.parse(localStorage.getItem('my-key'))
      expect(fromStorage.persisted).toBe(true)
    }, 100)
  })

  it('should persist to sessionStorage', () => {
    const sessionStore = store({ temp: 'data' }).session('my-session')

    sessionStore.set({ temp: 'new data' })

    // Wait for the debounce
    setTimeout(() => {
      const fromStorage = JSON.parse(sessionStorage.getItem('my-session'))
      expect(fromStorage.temp).toBe('new data')
    }, 100)
  })

  it('should persist nested properties to localStorage', () => {
    const userStore = store({
      user: {
        name: 'John',
        settings: { theme: 'dark' },
      },
    })

    const themeStore = userStore.user.settings.theme.local('user-theme')

    themeStore.set('light')

    // Wait for the debounce
    setTimeout(() => {
      const fromStorage = JSON.parse(localStorage.getItem('user-theme'))
      expect(fromStorage).toBe('light')
    }, 100)
  })

  it('should persist nested properties to sessionStorage', () => {
    const appStore = store({
      app: {
        state: 'loading',
        data: { count: 0 },
      },
    })

    const countStore = appStore.app.data.count.session('app-count')

    countStore.set(42)

    // Wait for the debounce
    setTimeout(() => {
      const fromStorage = JSON.parse(sessionStorage.getItem('app-count'))
      expect(fromStorage).toBe(42)
    }, 100)
  })
})

describe('Storage Initial Value Handling', () => {
  it('should use stored value and ignore initial value when key exists in localStorage', async () => {
    // Pre-populate storage with a value
    localStorage.setItem('existing-key', JSON.stringify({ count: 100 }))

    // Create store with different initial value
    const localStore = store({ count: 0 }).local('existing-key')

    // Should use stored value, not initial value
    expect(localStore.get()).toEqual({ count: 100 })
  })

  it('should use stored value and ignore initial value when key exists in sessionStorage', async () => {
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
