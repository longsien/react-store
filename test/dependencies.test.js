import { describe, it, expect } from 'vitest'
import { store } from '../src/index'

describe('dependency notification', () => {
  it('recomputes on every write to the same source', () => {
    const base = store({ meta: { hits: 0 } })
    let computes = 0
    const derived = store(get => {
      computes++
      return get(base).meta.hits
    })

    const start = computes
    base.meta.hits.set(1)
    base.meta.hits.set(2)
    base.meta.hits.set(3)

    // Recomputing re-registers the dependency; the reverse mapping must survive
    // that, or only the first write would ever reach this store.
    expect(computes - start).toBe(3)
    expect(derived._obj.value).toBe(3)
  })

  it('keeps notifying after a source loses and regains its only dependent', () => {
    const base = store({ n: 0 })
    const derived = base.derive(value => value.n * 2)

    for (let i = 1; i <= 4; i++) base.n.set(i)
    expect(derived._obj.value).toBe(8)
  })
})

describe('get() on nested paths', () => {
  it('returns the value at the path, not the root', () => {
    const base = store({ items: [1, 2], meta: { hits: 0 } })
    const derived = store(get => get(base.items))
    expect(derived._obj.value).toEqual([1, 2])
  })

  it('reads a deeply nested path', () => {
    const base = store({ a: { b: { c: 'deep' } } })
    const derived = store(get => get(base.a.b.c))
    expect(derived._obj.value).toBe('deep')
  })

  it('combines nested reads from several stores', () => {
    const user = store({ profile: { name: 'ada' } })
    const app = store({ config: { theme: 'dark' } })
    const derived = store(
      get => `${get(user.profile.name)}:${get(app.config.theme)}`,
    )

    expect(derived._obj.value).toBe('ada:dark')
    user.profile.name.set('bo')
    expect(derived._obj.value).toBe('bo:dark')
    app.config.theme.set('light')
    expect(derived._obj.value).toBe('bo:light')
  })
})

describe('path-level dependency tracking', () => {
  it('skips recomputing for a branch the store never read', () => {
    const base = store({ items: [1, 2], meta: { hits: 0 } })
    let computes = 0
    store(get => {
      computes++
      return get(base.items).length
    })

    const start = computes
    base.meta.hits.set(1)
    base.meta.hits.set(2)
    expect(computes - start).toBe(0)
  })

  it('still recomputes when the branch it read changes', () => {
    const base = store({ items: [1, 2], meta: { hits: 0 } })
    let computes = 0
    const derived = store(get => {
      computes++
      return get(base.items).length
    })

    const start = computes
    base.items.set([1, 2, 3])
    expect(computes - start).toBe(1)
    expect(derived._obj.value).toBe(3)
  })

  it('propagates a parent write to a child reader', () => {
    const base = store({ a: { b: 1 } })
    const derived = store(get => get(base.a.b))

    base.set({ a: { b: 9 } }) // write at the root
    expect(derived._obj.value).toBe(9)
  })

  it('propagates a child write to a parent reader', () => {
    const base = store({ a: { b: 1 } })
    const derived = store(get => JSON.stringify(get(base.a)))

    base.a.b.set(7) // write below what was read
    expect(derived._obj.value).toBe('{"b":7}')
  })

  it('treats sibling branches as independent', () => {
    const base = store({ left: { n: 1 }, right: { n: 1 } })
    let leftComputes = 0
    let rightComputes = 0
    store(get => {
      leftComputes++
      return get(base.left.n)
    })
    store(get => {
      rightComputes++
      return get(base.right.n)
    })

    const l = leftComputes
    const r = rightComputes
    base.left.n.set(2)
    expect(leftComputes - l).toBe(1)
    expect(rightComputes - r).toBe(0)
  })

  it('tracks a branch discovered on a later conditional pass', () => {
    const flag = store(false)
    const base = store({ a: 'A', b: 'B' })
    const derived = store(get => (get(flag) ? get(base.b) : get(base.a)))

    expect(derived._obj.value).toBe('A')
    base.b.set('B2') // not yet read
    expect(derived._obj.value).toBe('A')

    flag.set(true)
    expect(derived._obj.value).toBe('B2')

    base.b.set('B3') // now a tracked dependency
    expect(derived._obj.value).toBe('B3')
  })

  it('notifies a whole-store reader for any nested write', () => {
    const base = store({ x: 1, y: 2 })
    let computes = 0
    store(get => {
      computes++
      return Object.keys(get(base)).length
    })

    const start = computes
    base.x.set(10)
    base.y.set(20)
    expect(computes - start).toBe(2)
  })
})

describe('IndexedDB cross-tab sync', () => {
  const wait = (ms = 250) => new Promise(resolve => setTimeout(resolve, ms))

  it('propagates a write to another store on the same key', async () => {
    // A channel never receives its own messages, so two instances stand in for
    // two tabs exactly as far as this code path is concerned.
    const tabA = store({ n: 0 }).index('sync-basic', 'sync-db')
    const tabB = store({ n: 0 }).index('sync-basic', 'sync-db')
    await wait()

    tabA.set({ n: 99 })
    await wait()

    expect(tabB.get()).toEqual({ n: 99 })
    tabA.destroy()
    tabB.destroy()
  })

  it('does not echo back into a write loop', async () => {
    const tabA = store({ n: 0 }).index('sync-loop', 'sync-db')
    const tabB = store({ n: 0 }).index('sync-loop', 'sync-db')
    await wait()

    let notificationsB = 0
    tabB._obj.listeners.add(() => notificationsB++)

    tabA.set({ n: 1 })
    await wait(400)

    // One sync, not an endless ping-pong between the two channels.
    expect(notificationsB).toBe(1)
    expect(tabB.get()).toEqual({ n: 1 })
    tabA.destroy()
    tabB.destroy()
  })

  it('updates derived stores of the receiving store', async () => {
    const tabA = store({ n: 1 }).index('sync-derived', 'sync-db')
    const tabB = store({ n: 1 }).index('sync-derived', 'sync-db')
    const doubled = tabB.derive(value => value.n * 2)
    await wait()

    tabA.set({ n: 21 })
    await wait()

    expect(doubled._obj.value).toBe(42)
    tabA.destroy()
    tabB.destroy()
  })

  it('stops syncing after destroy', async () => {
    const tabA = store({ n: 0 }).index('sync-destroy', 'sync-db')
    const tabB = store({ n: 0 }).index('sync-destroy', 'sync-db')
    await wait()

    tabB.destroy()
    tabA.set({ n: 5 })
    await wait()

    expect(tabB.get()).toEqual({ n: 0 })
    tabA.destroy()
  })
})
