import { describe, it, expect, beforeEach, vi } from 'vitest'
import { store } from '../src/index'

const wait = (ms = 30) => new Promise(resolve => setTimeout(resolve, ms))

describe('equality options', () => {
  it('defaults to deep equality', () => {
    const s = store({ nested: { n: 1 } })
    let notifications = 0
    s._obj.listeners.add(() => notifications++)

    s.set({ nested: { n: 1 } }) // deep-equal, different reference
    expect(notifications).toBe(0)

    s.set({ nested: { n: 2 } })
    expect(notifications).toBe(1)
  })

  it('reference equality notifies for any new object', () => {
    const s = store({ nested: { n: 1 } }, { equals: 'reference' })
    let notifications = 0
    s._obj.listeners.add(() => notifications++)

    s.set({ nested: { n: 1 } }) // deep-equal but not the same object
    expect(notifications).toBe(1)

    const same = s.get()
    s.set(same) // identical reference
    expect(notifications).toBe(1)
  })

  it('shallow equality compares one level by identity', () => {
    const nested = { n: 1 }
    const s = store({ nested, other: 1 }, { equals: 'shallow' })
    let notifications = 0
    s._obj.listeners.add(() => notifications++)

    s.set({ nested, other: 1 }) // same keys, same value identities
    expect(notifications).toBe(0)

    s.set({ nested: { n: 1 }, other: 1 }) // deep-equal but new inner reference
    expect(notifications).toBe(1)

    s.set({ nested, other: 1, extra: true }) // key count differs
    expect(notifications).toBe(2)
  })

  it('accepts a custom comparison function', () => {
    const s = store(
      { id: 1, label: 'a' },
      { equals: (a, b) => a.id === b.id },
    )
    let notifications = 0
    s._obj.listeners.add(() => notifications++)

    s.set({ id: 1, label: 'totally different' }) // same id, treated as equal
    expect(notifications).toBe(0)

    s.set({ id: 2, label: 'a' })
    expect(notifications).toBe(1)
  })

  it('rejects an unknown preset', () => {
    expect(() => store({ a: 1 }, { equals: 'loose' })).toThrow(/Unknown equality/)
  })

  it('applies to nested path writes', () => {
    const s = store({ user: { name: 'ada' } }, { equals: 'reference' })
    let notifications = 0
    s._obj.listeners.add(() => notifications++)

    s.user.set({ name: 'ada' }) // deep-equal at the path
    expect(notifications).toBe(1)
  })

  it('applies to derived store recomputation', () => {
    const base = store({ n: 1 })
    const derived = base.derive(value => ({ doubled: value.n * 2 }), {
      equals: 'reference',
    })

    let notifications = 0
    derived._obj.listeners.add(() => notifications++)

    // The derived result is deep-equal each time but a fresh object, so
    // reference equality treats every recompute as a change.
    base.set({ n: 1, unrelated: true })
    expect(notifications).toBe(1)
  })

  it('leaves derived stores on deep equality by default', () => {
    const base = store({ n: 1 })
    const derived = base.derive(value => ({ doubled: value.n * 2 }))

    let notifications = 0
    derived._obj.listeners.add(() => notifications++)

    base.set({ n: 1, unrelated: true }) // recomputes to a deep-equal result
    expect(notifications).toBe(0)
  })

  it('passes equality through to a storage store', () => {
    localStorage.clear()
    const s = store({ n: 1 }).local('equals-local', { equals: 'reference' })
    let notifications = 0
    s._obj.listeners.add(() => notifications++)

    s.set({ n: 1 })
    expect(notifications).toBe(1)
    s.destroy()
  })
})

describe('persistence debounce', () => {
  beforeEach(() => localStorage.clear())

  it('writes once per tick by default', async () => {
    const s = store({ n: 0 }).local('debounce-default')
    await wait()
    const spy = vi.spyOn(globalThis.localStorage, 'setItem')
    spy.mockClear() // the harness mocks setItem already, so drop prior calls

    s.n.set(1)
    s.n.set(2)
    s.n.set(3)
    await wait()

    expect(spy).toHaveBeenCalledTimes(1)
    expect(JSON.parse(localStorage.getItem('debounce-default'))).toEqual({ n: 3 })
    spy.mockRestore()
    s.destroy()
  })

  it('coalesces updates spread across ticks into one write', async () => {
    const s = store({ n: 0 }).local('debounce-slow', { debounce: 80 })
    await wait()
    const spy = vi.spyOn(globalThis.localStorage, 'setItem')
    spy.mockClear() // the harness mocks setItem already, so drop prior calls

    for (let i = 1; i <= 5; i++) {
      s.n.set(i)
      await wait(10) // separate ticks: the default would write five times
    }
    await wait(150)

    expect(spy).toHaveBeenCalledTimes(1)
    expect(JSON.parse(localStorage.getItem('debounce-slow'))).toEqual({ n: 5 })
    spy.mockRestore()
    s.destroy()
  })

  it('still flushes a debounced write on destroy', async () => {
    const s = store({ n: 0 }).local('debounce-destroy', { debounce: 5000 })
    await wait()

    s.n.set(42)
    s.destroy() // must not wait out the interval, and must not lose the write

    expect(JSON.parse(localStorage.getItem('debounce-destroy'))).toEqual({ n: 42 })
  })

  it('debounces IndexedDB writes too', async () => {
    const s = store({ n: 0 }).index('debounce-idb', 'debounce-db', {
      debounce: 60,
    })
    await wait(150)

    for (let i = 1; i <= 4; i++) {
      s.n.set(i)
      await wait(10)
    }
    await wait(200)
    s.destroy()

    const verify = store({}).index('debounce-idb', 'debounce-db')
    await wait(200)
    expect(verify.get()).toEqual({ n: 4 })
    verify.destroy()
  })
})
