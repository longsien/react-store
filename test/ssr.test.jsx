import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { hydrateRoot } from 'react-dom/client'
import { act } from '@testing-library/react'
import { store, useStore, useStoreValue, isLoading } from '../src/index'

const wait = (ms = 50) => new Promise(resolve => setTimeout(resolve, ms))

describe('server rendering', () => {
  beforeEach(() => localStorage.clear())

  it('renders a plain store without a getServerSnapshot error', () => {
    const s = store({ n: 3 })
    const Component = () => <div>{`n:${useStoreValue(s).n}`}</div>

    expect(renderToString(<Component />)).toContain('n:3')
  })

  it('renders the initial value for a storage store, not the stored one', () => {
    localStorage.setItem('ssr-render', JSON.stringify({ n: 99 }))
    const s = store({ n: 1 }).local('ssr-render')

    // The client store has already read localStorage...
    expect(s.get()).toEqual({ n: 99 })

    // ...but a server render has no storage, so it must emit the initial value
    // or the markup will not match what the client hydrates with.
    const Component = () => <div>{`n:${useStoreValue(s).n}`}</div>
    expect(renderToString(<Component />)).toContain('n:1')
    s.destroy()
  })

  it('renders the initial value for an IndexedDB store', async () => {
    const s = store({ n: 7 }).index('ssr-idb')
    await wait(120)

    const Component = () => <div>{`n:${useStoreValue(s).n}`}</div>
    expect(renderToString(<Component />)).toContain('n:7')
    s.destroy()
  })

  it('renders a nested path from a storage store', () => {
    localStorage.setItem('ssr-nested', JSON.stringify({ user: { name: 'bo' } }))
    const s = store({ user: { name: 'ada' } }).local('ssr-nested')

    const Component = () => <div>{`name:${useStoreValue(s.user.name)}`}</div>
    expect(renderToString(<Component />)).toContain('name:ada')
    s.destroy()
  })

  it('derives the server value from its sources server values', () => {
    localStorage.setItem('ssr-derived', JSON.stringify({ n: 50 }))
    const base = store({ n: 2 }).local('ssr-derived')
    const doubled = base.derive(value => value.n * 2)

    // Client-side the derived value already reflects storage
    expect(doubled.get()).toBe(100)

    const Component = () => <div>{`d:${useStoreValue(doubled)}`}</div>
    expect(renderToString(<Component />)).toContain('d:4')
    base.destroy()
  })

  it('renders the loading state for an async store', () => {
    const s = store(1)
    const d = s.derive(async value => value * 2)

    const Component = () => <div>{isLoading(useStoreValue(d)) ? 'busy' : 'done'}</div>
    expect(renderToString(<Component />)).toContain('busy')
  })

  it('returns a reference-stable server snapshot across calls', () => {
    localStorage.setItem('ssr-stable', JSON.stringify({ n: 5 }))
    const s = store({ n: 1 }).local('ssr-stable')
    const derived = s.derive(value => ({ doubled: value.n * 2 }))

    const seen = []
    const Component = () => {
      seen.push(useStoreValue(derived))
      return null
    }
    renderToString(<Component />)
    renderToString(<Component />)

    // React errors if getServerSnapshot is not cached; the derived server value
    // must be the same object each time.
    expect(seen[0]).toBe(seen[1])
    s.destroy()
  })

  it('renders without storage globals present', () => {
    const saved = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    delete globalThis.localStorage
    try {
      const s = store({ n: 4 }).local('ssr-no-storage')
      const Component = () => <div>{`n:${useStoreValue(s).n}`}</div>
      expect(renderToString(<Component />)).toContain('n:4')
    } finally {
      warn.mockRestore()
      if (saved) Object.defineProperty(globalThis, 'localStorage', saved)
    }
  })
})

describe('hydration', () => {
  beforeEach(() => localStorage.clear())

  it('hydrates server markup then converges to the stored value', async () => {
    localStorage.setItem('hydrate-key', JSON.stringify({ n: 42 }))
    const s = store({ n: 1 }).local('hydrate-key')

    const Component = () => <div>{`n:${useStore(s)[0].n}`}</div>

    const html = renderToString(<Component />)
    expect(html).toContain('n:1')

    const container = document.createElement('div')
    container.innerHTML = html
    document.body.appendChild(container)

    const errors = []
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation((...args) => errors.push(String(args[0])))

    let root
    await act(async () => {
      root = hydrateRoot(container, <Component />)
    })

    error.mockRestore()

    // No hydration mismatch: the server snapshot matched the markup...
    expect(errors.filter(e => /hydrat/i.test(e))).toEqual([])
    // ...and the client then moved on to the persisted value.
    expect(container.textContent).toBe('n:42')

    root.unmount()
    container.remove()
    s.destroy()
  })

  it('hydrates a plain store with no mismatch', async () => {
    const s = store({ label: 'hello' })
    const Component = () => <span>{useStoreValue(s.label)}</span>

    const html = renderToString(<Component />)
    const container = document.createElement('div')
    container.innerHTML = html
    document.body.appendChild(container)

    const errors = []
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation((...args) => errors.push(String(args[0])))

    let root
    await act(async () => {
      root = hydrateRoot(container, <Component />)
    })
    error.mockRestore()

    expect(errors.filter(e => /hydrat/i.test(e))).toEqual([])
    expect(container.textContent).toBe('hello')

    root.unmount()
    container.remove()
  })
})
