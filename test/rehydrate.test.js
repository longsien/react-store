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

describe('deferred hydration', () => {
  it('does not read or write localStorage until rehydrate', async () => {
    localStorage.setItem('settings', JSON.stringify({ theme: 'light' }))

    const settings = store({ theme: 'dark' }).local('settings', { defer: true })

    expect(settings.get()).toEqual({ theme: 'dark' })
    expect(JSON.parse(localStorage.getItem('settings'))).toEqual({
      theme: 'light',
    })

    settings.set({ theme: 'sepia' })
    await waitForStorage()
    expect(JSON.parse(localStorage.getItem('settings'))).toEqual({
      theme: 'light',
    })

    settings.rehydrate()
    expect(settings.get()).toEqual({ theme: 'light' })
    settings.destroy()
  })

  it('writes the initial value when rehydrate finds no key', async () => {
    const settings = store({ theme: 'dark' }).local('settings', { defer: true })
    expect(localStorage.getItem('settings')).toBeNull()

    settings.rehydrate()
    expect(settings.get()).toEqual({ theme: 'dark' })
    expect(JSON.parse(localStorage.getItem('settings'))).toEqual({
      theme: 'dark',
    })
    settings.destroy()
  })

  it('discards in-memory edits when first rehydrate loads a missing key', () => {
    const settings = store({ theme: 'dark' }).local('settings', { defer: true })
    settings.set({ theme: 'sepia' })

    settings.rehydrate()
    expect(settings.get()).toEqual({ theme: 'dark' })
    expect(JSON.parse(localStorage.getItem('settings'))).toEqual({
      theme: 'dark',
    })
    settings.destroy()
  })

  it('persists after rehydrate', async () => {
    const settings = store({ theme: 'dark' }).local('settings', { defer: true })
    settings.rehydrate()
    settings.set({ theme: 'light' })
    await waitForStorage()
    expect(JSON.parse(localStorage.getItem('settings'))).toEqual({
      theme: 'light',
    })
    settings.destroy()
  })

  it('defers sessionStorage the same way', async () => {
    sessionStorage.setItem('temp', JSON.stringify({ n: 1 }))
    const temp = store({ n: 0 }).session('temp', { defer: true })

    expect(temp.get()).toEqual({ n: 0 })
    expect(sessionStorage.getItem('temp')).toBe(JSON.stringify({ n: 1 }))

    temp.rehydrate()
    expect(temp.get()).toEqual({ n: 1 })
    temp.destroy()
  })
})

describe('rehydrate key retargeting', () => {
  it('loads a different key and does not copy RAM onto a missing key', async () => {
    localStorage.setItem('v1', JSON.stringify({ n: 1 }))
    const s = store({ n: 0 }).local('v1')
    expect(s.get()).toEqual({ n: 1 })

    s.set({ n: 99 })
    await waitForStorage()

    s.rehydrate({ key: 'v2' })
    expect(s.get()).toEqual({ n: 0 })
    expect(JSON.parse(localStorage.getItem('v1'))).toEqual({ n: 99 })
    expect(JSON.parse(localStorage.getItem('v2'))).toEqual({ n: 0 })
    s.destroy()
  })

  it('loads existing data at the new key', () => {
    localStorage.setItem('a', JSON.stringify({ n: 1 }))
    localStorage.setItem('b', JSON.stringify({ n: 2 }))
    const s = store({ n: 0 }).local('a')

    s.rehydrate({ key: 'b' })
    expect(s.get()).toEqual({ n: 2 })
    expect(JSON.parse(localStorage.getItem('a'))).toEqual({ n: 1 })
    s.destroy()
  })

  it('writes subsequent updates to the new key only', async () => {
    localStorage.setItem('a', JSON.stringify({ n: 1 }))
    const s = store({ n: 0 }).local('a')

    s.rehydrate({ key: 'b' })
    s.set({ n: 3 })
    await waitForStorage()

    expect(JSON.parse(localStorage.getItem('a'))).toEqual({ n: 1 })
    expect(JSON.parse(localStorage.getItem('b'))).toEqual({ n: 3 })
    s.destroy()
  })

  it('flushes a pending write to the old key before switching', async () => {
    const s = store({ n: 0 }).local('a', { debounce: 5000 })
    await waitForStorage()

    s.set({ n: 7 })
    s.rehydrate({ key: 'b' })

    expect(JSON.parse(localStorage.getItem('a'))).toEqual({ n: 7 })
    expect(JSON.parse(localStorage.getItem('b'))).toEqual({ n: 0 })
    s.destroy()
  })

  it('rehydrate() without options re-reads the current key', () => {
    const s = store({ n: 0 }).local('a')
    localStorage.setItem('a', JSON.stringify({ n: 5 }))

    s.rehydrate()
    expect(s.get()).toEqual({ n: 5 })
    s.destroy()
  })

  it('ignores storage events for the previous key after retargeting', async () => {
    const s = store({ n: 0 }).local('a')
    s.rehydrate({ key: 'b' })

    const otherTab = JSON.stringify({ n: 8 })
    localStorage.setItem('a', otherTab)
    dispatchStorageEvent('a', otherTab, JSON.stringify({ n: 0 }), localStorage)
    await waitForStorage()

    expect(s.get()).toEqual({ n: 0 })
    s.destroy()
  })

  it('listens for storage events on the new key', async () => {
    const s = store({ n: 0 }).local('a')
    s.rehydrate({ key: 'b' })

    const otherTab = JSON.stringify({ n: 4 })
    localStorage.setItem('b', otherTab)
    dispatchStorageEvent('b', otherTab, JSON.stringify({ n: 0 }), localStorage)
    await waitForStorage()

    expect(s.get()).toEqual({ n: 4 })
    s.destroy()
  })

  it('can bind again after destroy', async () => {
    const s = store({ n: 0 }).local('a')
    s.set({ n: 1 })
    await waitForStorage()
    s.destroy()

    localStorage.setItem('b', JSON.stringify({ n: 2 }))
    s.rehydrate({ key: 'b' })
    expect(s.get()).toEqual({ n: 2 })
    s.set({ n: 3 })
    await waitForStorage()
    expect(JSON.parse(localStorage.getItem('b'))).toEqual({ n: 3 })
    s.destroy()
  })

  it('logs an error on in-memory stores', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const s = store({ n: 0 })
    s.rehydrate()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
