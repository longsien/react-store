import { store } from '../src/index'
import { describe, it, expect, beforeEach } from 'vitest'

// Reset stores before each test
beforeEach(() => {
  // Clear local and session storage
  localStorage.clear()
  sessionStorage.clear()
})

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
