import { store } from '../src/index'
import { describe, it, expect } from 'vitest'

const waitForIDB = () => new Promise(resolve => setTimeout(resolve, 100))

describe('IndexedDB Persistence', () => {
  it('should write to IndexedDB on update', async () => {
    const s = store({ persisted: false }).index('idb-write')
    await waitForIDB()

    s.set({ persisted: true })
    await waitForIDB()

    // Create a fresh store to verify IDB has the value
    s.destroy()
    const verify = store({}).index('idb-write')
    await waitForIDB()

    expect(verify.get()).toEqual({ persisted: true })
    verify.destroy()
  })

  it('should save initial value to IndexedDB when key does not exist', async () => {
    const s = store({ count: 42 }).index('idb-initial')
    await waitForIDB()

    s.destroy()
    const verify = store({}).index('idb-initial')
    await waitForIDB()

    expect(verify.get()).toEqual({ count: 42 })
    verify.destroy()
  })

  it('should load existing value from IndexedDB on creation', async () => {
    const s1 = store({ count: 0 }).index('idb-reload')
    s1.set({ count: 99 })
    await waitForIDB()

    s1.destroy()

    const s2 = store({ count: 0 }).index('idb-reload')
    await waitForIDB()

    expect(s2.get()).toEqual({ count: 99 })
    s2.destroy()
  })

  it('should handle nested property stores', async () => {
    const appStore = store({
      app: { data: { count: 0 } },
    })
    const countStore = appStore.app.data.count.index('idb-nested')
    countStore.set(42)
    await waitForIDB()

    countStore.destroy()
    const verify = store(0).index('idb-nested')
    await waitForIDB()

    expect(verify.get()).toBe(42)
    verify.destroy()
  })

  it('should handle null values', async () => {
    const s = store(null).index('idb-null')
    await waitForIDB()

    s.destroy()
    const verify = store('not-null').index('idb-null')
    await waitForIDB()

    expect(verify.get()).toBeNull()
    verify.destroy()
  })

  it('should handle array values', async () => {
    const s = store([1, 2, 3]).index('idb-array')
    await waitForIDB()

    s.destroy()
    const verify = store([]).index('idb-array')
    await waitForIDB()

    expect(verify.get()).toEqual([1, 2, 3])
    verify.destroy()
  })

  it('should use custom database name', async () => {
    const s = store({ custom: true }).index('idb-custom-store', 'custom-db')
    await waitForIDB()

    s.destroy()
    const verify = store({}).index('idb-custom-store', 'custom-db')
    await waitForIDB()

    expect(verify.get()).toEqual({ custom: true })
    verify.destroy()
  })

  it('should chain with .local() and .session()', async () => {
    // local → index: value flows from local store to IDB store
    const s1 = store({ theme: 'dark' }).local('chain-ls').index('idb-from-local')
    await waitForIDB()
    expect(s1.get()).toEqual({ theme: 'dark' })
    s1.destroy()

    // session → index
    const s2 = store([1, 2]).session('chain-ss').index('idb-from-session')
    await waitForIDB()
    expect(s2.get()).toEqual([1, 2])
    s2.destroy()

    // index → local
    const s3 = store('hello').index('idb-chain', 'chain-db').local('chain-from-idb')
    await waitForIDB()
    expect(s3.get()).toBe('hello')
    s3.destroy()
  })

  it('should clean up on destroy', async () => {
    const s = store({ temp: true }).index('idb-destroy')
    await waitForIDB()

    expect(() => s.destroy()).not.toThrow()
  })
})
