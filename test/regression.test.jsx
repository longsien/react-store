import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { store, useStore, useStoreSetter } from '../src/index'

const wait = (ms = 100) => new Promise(resolve => setTimeout(resolve, ms))

describe('preserveReferences: non-plain values are leaves', () => {
  it('applies a changed Date loaded from IndexedDB', async () => {
    const s1 = store({ d: new Date(1000) }).index('regress-date')
    await wait()
    s1.set({ d: new Date(999999) })
    await wait()
    s1.destroy()

    const s2 = store({ d: new Date(1000) }).index('regress-date')
    await wait()
    expect(s2.get().d).toBeInstanceOf(Date)
    expect(s2.get().d.getTime()).toBe(999999)
    s2.destroy()
  })

  it('applies a changed Map loaded from IndexedDB', async () => {
    const s1 = store({ m: new Map([['k', 1]]) }).index('regress-map')
    await wait()
    s1.set({ m: new Map([['k', 2]]) })
    await wait()
    s1.destroy()

    const s2 = store({ m: new Map([['k', 1]]) }).index('regress-map')
    await wait()
    expect(s2.get().m).toBeInstanceOf(Map)
    expect(s2.get().m.get('k')).toBe(2)
    s2.destroy()
  })

  it('applies a changed Set and keeps an unchanged Date by reference', async () => {
    const sharedDate = new Date(500)
    const s1 = store({ s: new Set([1]), d: sharedDate }).index('regress-set')
    await wait()
    s1.set({ s: new Set([1, 2]), d: new Date(500) })
    await wait()
    s1.destroy()

    const s2 = store({ s: new Set([1]), d: sharedDate }).index('regress-set')
    await wait()
    expect([...s2.get().s]).toEqual([1, 2])
    // The date is deep-equal across the reload, so the original ref is kept
    expect(s2.get().d).toBe(sharedDate)
    s2.destroy()
  })

  it('does not recurse forever through circular values', async () => {
    const older = { name: 'stored' }
    older.self = older
    const s1 = store(older).index('regress-cyclic')
    await wait()
    s1.destroy()

    const newer = { name: 'local' }
    newer.self = newer
    const s2 = store(newer).index('regress-cyclic')
    await wait()
    expect(s2.get().name).toBe('stored')
    expect(s2.get().self).toBeTruthy()
    s2.destroy()
  })
})

describe('derived store writes', () => {
  it('routes the useStore setter to the base store', async () => {
    const base = store({ n: 1 })
    const derived = base.derive(value => ({ n: value.n * 2 }))

    let setter
    const Component = () => {
      const [value, setValue] = useStore(derived)
      setter = setValue
      return <div>derived:{value.n}</div>
    }
    render(<Component />)
    expect(screen.getByText('derived:2')).toBeTruthy()

    await act(async () => setter({ n: 100 }))

    expect(base.get()).toEqual({ n: 100 })
    expect(derived.get()).toEqual({ n: 200 })
    expect(screen.getByText('derived:200')).toBeTruthy()
  })

  it('routes the useStoreSetter hook to the base store', async () => {
    const base = store({ n: 1 })
    const derived = base.derive(value => ({ n: value.n * 2 }))

    let setter
    const Component = () => {
      setter = useStoreSetter(derived)
      return null
    }
    render(<Component />)

    await act(async () => setter({ n: 7 }))
    expect(base.get()).toEqual({ n: 7 })
  })

  it('throws from the hook setter when there is no base store', async () => {
    const source = store({ n: 1 })
    const derived = store(get => get(source).n * 2)

    let setter
    const Component = () => {
      setter = useStoreSetter(derived)
      return null
    }
    render(<Component />)

    expect(() => setter(5)).toThrow(/read-only/)
  })
})

describe('IndexedDB write ordering', () => {
  it('persists updates made before the database opens', async () => {
    const s = store({ n: 0 }).index('regress-early')
    s.set({ n: 7 })
    await wait()
    s.destroy()

    const verify = store({}).index('regress-early')
    await wait()
    expect(verify.get()).toEqual({ n: 7 })
    verify.destroy()
  })

  it('does not let the initial load clobber a pre-open update', async () => {
    const seed = store({ n: 1 }).index('regress-clobber')
    await wait()
    seed.destroy()

    const s = store({ n: 0 }).index('regress-clobber')
    s.set({ n: 42 })
    await wait()
    expect(s.get()).toEqual({ n: 42 })
    s.destroy()

    const verify = store({}).index('regress-clobber')
    await wait()
    expect(verify.get()).toEqual({ n: 42 })
    verify.destroy()
  })

  it('flushes a pending write on destroy', async () => {
    const s = store({ n: 0 }).index('regress-idb-destroy')
    await wait()
    s.set({ n: 5 })
    s.destroy()

    const verify = store({}).index('regress-idb-destroy')
    await wait()
    expect(verify.get()).toEqual({ n: 5 })
    verify.destroy()
  })

  it('updates derived stores when a value loads from IndexedDB', async () => {
    const seed = store({ n: 3 }).index('regress-idb-derived')
    await wait()
    seed.destroy()

    const s = store({ n: 0 }).index('regress-idb-derived')
    const doubled = s.derive(value => value.n * 2)
    await wait()
    expect(doubled._obj.value).toBe(6)
    s.destroy()
  })
})

describe('storage store teardown', () => {
  beforeEach(() => localStorage.clear())

  it('flushes a pending write on destroy', async () => {
    const s = store({ v: 0 }).local('regress-flush')
    s.v.set(99)
    s.destroy()
    await wait(10)
    expect(JSON.parse(localStorage.getItem('regress-flush'))).toEqual({ v: 99 })
  })

  it('stops persisting after destroy', async () => {
    const s = store({ n: 0 }).local('regress-stop')
    await wait(10)
    s.destroy()
    s.set({ n: 777 })
    await wait(10)
    expect(JSON.parse(localStorage.getItem('regress-stop'))).toEqual({ n: 0 })
  })
})

describe('derived store dependency tracking', () => {
  it('tracks dependencies discovered on a later branch', () => {
    const flag = store(false)
    const a = store('A')
    const b = store('B')
    const derived = store(get => (get(flag) ? get(b) : get(a)))

    const seen = []
    derived._obj.listeners.add(() => seen.push(derived._obj.value))

    flag.set(true)
    expect(derived._obj.value).toBe('B')

    b.set('B2')
    expect(derived._obj.value).toBe('B2')
    expect(seen).toEqual(['B', 'B2'])
  })

  it('stops recomputing for a branch it no longer reads', () => {
    const flag = store(true)
    const a = store('A')
    const b = store('B')
    let computes = 0
    const derived = store(get => {
      computes++
      return get(flag) ? get(b) : get(a)
    })

    flag.set(false)
    const afterSwitch = computes
    b.set('B2') // no longer a dependency
    expect(computes).toBe(afterSwitch)
    expect(derived._obj.value).toBe('A')
  })

  it('notifies subscribed components through a late-tracked dependency', async () => {
    const flag = store(false)
    const a = store('A')
    const b = store('B')
    const derived = store(get => (get(flag) ? get(b) : get(a)))

    const Component = () => <div>value:{useStore(derived)[0]}</div>
    render(<Component />)

    await act(async () => flag.set(true))
    expect(screen.getByText('value:B')).toBeTruthy()

    await act(async () => b.set('B2'))
    expect(screen.getByText('value:B2')).toBeTruthy()
  })
})

describe('setValueAtPath container creation', () => {
  it('creates an object when the root state is null', () => {
    const s = store(null)
    s.a.set(1)
    expect(s.get()).toEqual({ a: 1 })
  })

  it('creates an object when the root state is a primitive', () => {
    const s = store(5)
    s.a.b.set(2)
    expect(s.get()).toEqual({ a: { b: 2 } })
  })

  it('creates an array for a numeric root key', () => {
    const s = store(undefined)
    s[0].set('first')
    expect(s.get()).toEqual(['first'])
  })

  it('does not collapse a parent when writing under a primitive', () => {
    const s = store({ a: 5 })
    s.a.b.set(1)
    expect(s.get()).toEqual({ a: { b: 1 } })
  })
})

describe('async derived store input queueing', () => {
  it('does not drop a queued undefined input', async () => {
    const source = store(1)
    const seen = []
    const derived = source.derive(async value => {
      seen.push(value)
      await wait(20)
      return `r:${value}`
    })
    await wait(5)

    source.set(2)
    source.set(undefined) // queued while the first run is in flight
    await wait(150)

    expect(seen).toContain(undefined)
    expect(derived.get()).toBe('r:undefined')
  })

  it('still coalesces to the latest queued input', async () => {
    const source = store(1)
    const seen = []
    const derived = source.derive(async value => {
      seen.push(value)
      await wait(20)
      return `r:${value}`
    })
    await wait(5)

    source.set(2)
    source.set(3)
    await wait(150)

    expect(seen).toEqual([1, 3]) // 2 is superseded before it ever runs
    expect(derived.get()).toBe('r:3')
  })

  it('skips a re-run when the queued input matches the running one', async () => {
    const source = store(1)
    const seen = []
    source.derive(async value => {
      seen.push(value)
      await wait(20)
      return value
    })
    await wait(5)

    source.set(2)
    source.set(1) // back to the in-flight input
    await wait(150)

    expect(seen).toEqual([1])
  })
})

describe('IndexedDB databases shared by several stores', () => {
  it('lets a second store join a database that is already open', async () => {
    const a = store({ a: 1 }).index('share-a', 'share-db')
    await wait()
    // `a` holds an open connection; adding `share-b` needs a version bump,
    // which that connection would block.
    const b = store({ b: 2 }).index('share-b', 'share-db')
    await wait()

    b.set({ b: 22 })
    await wait()
    a.destroy()
    b.destroy()

    const verify = store({}).index('share-b', 'share-db')
    await wait()
    expect(verify.get()).toEqual({ b: 22 })
    verify.destroy()
  })

  it('persists every store when they are created concurrently', async () => {
    const p = store({ p: 1 }).index('con-p', 'concurrent-db')
    const q = store({ q: 1 }).index('con-q', 'concurrent-db')
    const r = store({ r: 1 }).index('con-r', 'concurrent-db')
    await wait(200)

    p.set({ p: 9 })
    q.set({ q: 9 })
    r.set({ r: 9 })
    await wait(200)
    p.destroy()
    q.destroy()
    r.destroy()

    const vp = store({}).index('con-p', 'concurrent-db')
    const vq = store({}).index('con-q', 'concurrent-db')
    const vr = store({}).index('con-r', 'concurrent-db')
    await wait(200)
    expect(vp.get()).toEqual({ p: 9 })
    expect(vq.get()).toEqual({ q: 9 })
    expect(vr.get()).toEqual({ r: 9 })
    vp.destroy()
    vq.destroy()
    vr.destroy()
  })

  it('reopens a database after every store using it is destroyed', async () => {
    const first = store({ n: 1 }).index('reopen', 'reopen-db')
    await wait()
    first.set({ n: 2 })
    await wait()
    first.destroy()
    await wait()

    const second = store({}).index('reopen', 'reopen-db')
    await wait()
    expect(second.get()).toEqual({ n: 2 })
    second.destroy()
  })
})

describe('storage availability', () => {
  it('degrades to an in-memory store when the storage global is absent', () => {
    const saved = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    delete globalThis.localStorage
    try {
      // Throwing here would break SSR: this same call runs on the server.
      const s = store({ a: 1 }).local('ssr-key')
      expect(s.get()).toEqual({ a: 1 })

      s.a.set(2)
      expect(s.get()).toEqual({ a: 2 })

      // A browser reaching this path has a real problem, so it is surfaced.
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/will not persist/))
    } finally {
      warn.mockRestore()
      if (saved) Object.defineProperty(globalThis, 'localStorage', saved)
    }
  })

  it('falls back to the initial value when reading throws', () => {
    const saved = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => {
          throw new Error('access denied')
        },
        setItem: () => {},
      },
    })
    try {
      const s = store({ a: 1 }).local('blocked-key')
      expect(s.get()).toEqual({ a: 1 })
    } finally {
      if (saved) Object.defineProperty(globalThis, 'localStorage', saved)
    }
  })
})

describe('proxy path cache', () => {
  it('keeps a dotted key distinct from a nested path', () => {
    const s = store({ 'a.b': 'dotted', a: { b: 'nested' } })
    expect(s['a.b'].get()).toBe('dotted')
    expect(s.a.b.get()).toBe('nested')
  })

  it('keeps distinct nested paths distinct after a write', () => {
    const s = store({ 'x.y': 1, x: { y: 2 } })
    s.x.y.set(20)
    s['x.y'].set(10)
    expect(s.get()).toEqual({ 'x.y': 10, x: { y: 20 } })
  })
})

describe('derive async detection', () => {
  it('treats a plain function returning a promise as async', async () => {
    const s = store(1)
    const d = s.derive(value => Promise.resolve(value * 2))
    await wait(30)
    expect(d.get()).toBe(2)

    s.set(5)
    await wait(30)
    expect(d.get()).toBe(10)
  })

  it('does not invoke the derive function twice on creation', async () => {
    const s = store(1)
    let calls = 0
    s.derive(value => {
      calls++
      return Promise.resolve(value)
    })
    await wait(30)
    expect(calls).toBe(1)
  })

  it('still runs a synchronous derive function once on creation', () => {
    const s = store(2)
    let calls = 0
    const d = s.derive(value => {
      calls++
      return value * 3
    })
    // Creation computes exactly once — the thenable check must not re-invoke.
    // (`.get()` recomputes by design, so it is asserted after this count.)
    expect(calls).toBe(1)
    expect(d.get()).toBe(6)
  })
})

describe('derive on a nested path', () => {
  it('receives the value at that path, not the root', () => {
    const s = store({ user: { name: 'ada' }, other: 1 })
    let received
    const d = s.user.derive(value => {
      received = value
      return value.name
    })
    expect(received).toEqual({ name: 'ada' })
    expect(d.get()).toBe('ada')
  })

  it('recomputes from the nested value when it changes', () => {
    const s = store({ count: { n: 2 }, unrelated: 0 })
    const doubled = s.count.derive(value => value.n * 2)
    expect(doubled._obj.value).toBe(4)

    s.count.n.set(5)
    expect(doubled._obj.value).toBe(10)
  })

  it('feeds an async derive from the nested value', async () => {
    const s = store({ id: { value: 3 } })
    const d = s.id.derive(async value => `id-${value.value}`)
    await wait(30)
    expect(d.get()).toBe('id-3')
  })
})
