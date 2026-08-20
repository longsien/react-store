# React Store

A lightweight, proxy-based global state management library for React.

## Features

- **Lightweight**: Minimal footprint with only one dependency beyond React (`fast-equals`)
- **Proxy-based**: JavaScript Proxy enables nested property access with path tracking
- **Dynamic Scoping**: Components automatically subscribe only to the specific array indices or object properties they access, so unrelated updates never re-render them
- **Derived stores**: Compute values from one or more stores; subscribers only re-render when the derived value actually changes
- **Async stores**: First-class loading / error / success handling for data fetching, including async derived stores that re-run when their inputs change
- **Persistence**: Back any store with `localStorage`, `sessionStorage`, or IndexedDB, with automatic serialization and cross-tab synchronization for both `localStorage` and IndexedDB
- **Server-rendering ready**: Works with Next.js, Remix and any other SSR setup, with hydration-safe snapshots for persisted stores — see [Server-Side Rendering](#server-side-rendering)
- **No provider, no boilerplate**: Stores are plain module-level values usable from any component or from outside React entirely

## Live Demo

The [`examples/demo`](examples/demo) directory contains a small window manager (draggable / resizable windows, a taskbar, and virtual "spaces") built entirely on this library. It is the clearest demonstration of why derived stores matter — see [Why Derived Stores?](#why-derived-stores) below. Run it with:

```bash
npm install
npm run demo
```

## Installation

```bash
npm install @longsien/react-store
```

## Quick Start

```jsx
import { store, useStore } from '@longsien/react-store'

// Create a store with initial value
const counterStore = store(0)

function Counter() {
  // Get current value and setter function
  const [count, setCount] = useStore(counterStore)

  return (
    <div>
      <p>Count: {count}</p>
      {/* Direct value update */}
      <button onClick={() => setCount(count + 1)}>+</button>
      {/* Function-based update */}
      <button onClick={() => setCount(prev => prev - 1)}>-</button>
    </div>
  )
}
```

## As Global Store

You can treat a store as a global store and use it in any component without prop passing and unnecessary re-renders.

```jsx
import { store, useStore, useStoreValue } from '@longsien/react-store'

// Global store accessible from any component
const personStore = store({ name: 'Hanni', origin: 'Australia' })

// Component that updates store values
function Updater() {
  // Subscribe to specific nested properties
  const [name, setName] = useStore(personStore.name)
  const [origin, setOrigin] = useStore(personStore.origin)

  return (
    <div>
      <input type='text' value={name} onChange={e => setName(e.target.value)} />
      <input
        type='text'
        value={origin}
        onChange={e => setOrigin(e.target.value)}
      />
    </div>
  )
}

// Read-only component for name
function DisplayName() {
  // Only re-renders when name changes
  const name = useStoreValue(personStore.name)

  return <div>Name: {name}</div>
}

// Read-only component for origin
function DisplayOrigin() {
  // Only re-renders when origin changes
  const origin = useStoreValue(personStore.origin)

  return <div>Origin: {origin}</div>
}
```

## API Reference

### Store Creation

#### `store(initialValue)`

Creates a basic in-memory store that persists for the lifetime of the application session.

```jsx
// Basic in-memory store
const userStore = store({ name: 'Winter', origin: 'South Korea' })
```

#### `store(initialValue).local(key)`

Creates a store backed by localStorage with automatic persistence. Data is automatically serialized to JSON when saving and deserialized when loading. If the key already exists in storage, the stored value is used and the initial value is ignored.

localStorage-backed stores also **synchronize across tabs**: when another tab writes to the same key, the store updates and re-renders subscribers. Object references for unchanged nested paths are preserved during the sync so only the components reading changed paths re-render.

```jsx
// Store with localStorage persistence (and cross-tab sync)
const settingsStore = store({ theme: 'dark' }).local('settings')
```

Pass `{ defer: true }` to skip the initial read/write. The store stays at its initial value in memory until you call `rehydrate()` — useful when the storage key is not known yet, or persistence should wait for a later signal:

```jsx
const settingsStore = store({ theme: 'dark' }).local('settings', { defer: true })
settingsStore.rehydrate()
settingsStore.rehydrate({ key: 'settings.v2' })
```

`.session()` accepts the same `defer` option and `rehydrate()` method.

#### `store(initialValue).session(key)`

Creates a store backed by sessionStorage with automatic persistence. Data is automatically serialized to JSON when saving and deserialized when loading.

```jsx
// Store with sessionStorage persistence
const tempStore = store({ items: [] }).session('temp-data')
```

#### `store(initialValue).index(storeName, dbName?)`

Creates a store backed by IndexedDB. The initial value is used synchronously until the asynchronous read completes, after which the persisted value (if any) is loaded in. `dbName` defaults to `'react-store'`.

IndexedDB stores also **synchronize across tabs**, via `BroadcastChannel` where available. Every store sharing a `dbName` shares a single connection, so any number of them can live in one database. If another tab needs to upgrade that database, this one releases its connection so the upgrade isn't blocked, and reopens on the next read or write.

Unlike `.local()` and `.session()`, values are stored via structured clone rather than JSON, so `Date`, `Map`, `Set` and binary values (`Blob`, `File`, `ArrayBuffer`, typed arrays) round-trip intact.

```jsx
// Store with IndexedDB persistence
const docsStore = store({ drafts: [] }).index('documents')
// Custom database name
const usersStore = store({ name: 'Winter' }).index('users', 'my-app')
```

### Hooks

#### `useStore(store)`

Returns `[value, setState]` tuple for reading and updating state. Use exactly the same as React's built-in `useState` hook.

```jsx
// Returns [value, setter] tuple like useState
const [user, setUser] = useStore(userStore)
const [userName, setUserName] = useStore(userStore.name)
const [userOrigin, setUserOrigin] = useStore(userStore.origin)
```

#### `useStoreValue(store)`

Returns only the current value (read-only).

```jsx
// Read-only access, no setter returned
const user = useStoreValue(userStore)
const userName = useStoreValue(userStore.name)
const userOrigin = useStoreValue(userStore.origin)
```

#### `useStoreSetter(store)`

Returns only the setter function, avoiding unnecessary re-renders when the value changes.

```jsx
// Only get setter function, avoids re-renders
const setUser = useStoreSetter(userStore)
const setUserName = useStoreSetter(userStore.name)
const setUserOrigin = useStoreSetter(userStore.origin)
```

### Non-Hook Functions

#### `store.get()`

Get current value outside React components. Useful for utility functions, event handlers, or any code that runs outside the React render cycle.

```jsx
// Get values outside React components
const currentUser = userStore.get()
const userName = userStore.name.get()
const userOrigin = userStore.origin.get()
```

#### `store.set(value)`

Update value outside React components. Triggers all subscribed components to re-render if their specific data has changed. Accepts the same value types as the hook-based setters.

```jsx
// Update values outside React components
userStore.set({ name: 'Karina', origin: 'South Korea' })
userStore.name.set('Ningning')
userStore.origin.set('China')
```

#### `store.destroy()`

Cleans up resources held by a store. Any debounced write still pending is **flushed first**, so a `set()` immediately followed by `destroy()` is never lost. It then stops persisting, removes the cross-tab `storage` listener for `localStorage` stores, releases the IndexedDB connection, and unregisters derived stores from their dependencies.

```jsx
const settingsStore = store({ theme: 'dark' }).local('app-settings')
settingsStore.set({ theme: 'light' })
// The pending write is flushed, then the store stops persisting:
settingsStore.destroy()
```

Call it when a persisted store is no longer needed, so it releases its storage listener or database connection promptly. Module-level stores that live for the lifetime of the app don't need it.

Derived stores don't require `destroy()` to avoid leaking. A source store holds its dependents weakly, so a derived store that the application has dropped — one created inside a component that has since unmounted, say — becomes eligible for garbage collection and stops recomputing on its own. Calling `destroy()` on it simply makes that immediate and deterministic.

#### `store.rehydrate({ key }?)`

Binds (or rebinds) a `.local()` / `.session()` store to a storage key. The in-memory value is replaced with whatever is stored at that key. If the key is missing, the store resets to its **original initial value** and that value is written to the key — it does not copy whatever currently sits in memory onto the new key.

`rehydrate()` with no argument uses the key passed to `.local()` / `.session()`, or the key from the last `rehydrate({ key })`.

```jsx
const settings = store({ theme: 'dark' }).local('settings', { defer: true })
// Nothing is read or written yet
settings.rehydrate() // bind 'settings'
settings.rehydrate({ key: 'settings.v2' }) // load v2 (or initial value if empty)
```

Calling `rehydrate()` on an in-memory store logs an error and does nothing. After `destroy()`, `rehydrate()` can bind again.

## Derived Stores

Derived stores automatically compute values based on other stores and update when their dependencies change. A derived store re-runs its getter when a dependency changes, but only notifies its own subscribers when the **computed value** actually changes (by deep equality). This makes them the primary tool for minimizing re-renders.

### Why Derived Stores?

Dynamic scoping already lets a component subscribe to a single nested path. Derived stores go further: they let a component subscribe to a **computed projection** of state — a list of keys, a boolean, a sum — and re-render only when that projection changes, no matter how often the underlying store churns.

The [window manager demo](examples/demo) shows two cases where this is the difference between a smooth UI and one that re-renders everything on every mouse move.

**1. Subscribing to the _shape_ of a store, not its contents.**

All open windows live in one store, keyed by id. Each window's `position`, `size`, and `zIndex` update many times per second while dragging or resizing. The component that renders the list of windows only cares about _which_ windows exist — not their contents. A derived store projects the store down to its keys, returning the **same array reference** when the set of keys hasn't changed:

```jsx
export const windowsStore = store({}).local('wm-windows')

let cachedIds = []
export const windowIdsStore = windowsStore.derive(windows => {
  const keys = Object.keys(windows)
  // Return the cached reference when the id set is unchanged so subscribers
  // don't re-render on every position/size update inside a window.
  if (keys.length === cachedIds.length && keys.every((id, i) => id === cachedIds[i]))
    return cachedIds
  cachedIds = keys
  return keys
})

const WindowManager = () => {
  // Re-renders only when a window is opened or closed — never while dragging.
  const windowIds = useStoreValue(windowIdsStore)
  return windowIds.map(id => <Window key={id} id={id} />)
}
```

Without the derived store, `WindowManager` would subscribe to `windowsStore` directly and re-render the entire window list on every drag frame.

**2. Fanning a shared value out into per-item slices.**

There is a single `focusedWindowStore` holding the id of the focused window. If every window subscribed to it directly, focusing one window would re-render _all_ of them. Instead, each window derives its own boolean. When focus moves from A to B, only A's and B's derived values flip from/to `true` — every other window's derived value stays `false`, so it doesn't re-render:

```jsx
export const focusedWindowStore = store(null)

const focusCache = new Map()
export const getWindowFocusStore = id => {
  if (!focusCache.has(id)) {
    focusCache.set(id, focusedWindowStore.derive(focusedId => focusedId === id))
  }
  return focusCache.get(id)
}

const Window = ({ id }) => {
  // Only the two windows whose focus actually changed re-render.
  const isFocused = useStoreValue(getWindowFocusStore(id))
  // ...
}
```

The takeaway: **reach for a derived store whenever a component depends on a function of state rather than the raw state.** Deep-equality gating on the computed result is what keeps re-renders proportional to meaningful changes instead of to write frequency.

### Basic Derived Stores

```jsx
import { store, useStore } from '@longsien/react-store'

// Base store
const counterStore = store(0)
// Derived from counterStore
const doubledStore = counterStore.derive(count => count * 2)
// Derived from doubledStore (chained derivation)
const doubledAgainStore = doubledStore.derive(count => count * 2)

function Counter() {
  const [count, setCount] = useStore(counterStore)
  const [doubled] = useStore(doubledStore)
  const [doubledAgain] = useStore(doubledAgainStore)

  return (
    <div>
      <p>Count: {count}</p>
      <p>Doubled: {doubled}</p>
      <p>Doubled Again: {doubledAgain}</p>
      <button onClick={() => setCount(count + 1)}>Increment</button>
    </div>
  )
}
```

### Multi-Dependency Derived Stores

```jsx
import { store, useStore } from '@longsien/react-store'

// Multiple independent stores
const nameStore = store('Winter')
const originStore = store('South Korea')
const isActiveStore = store(true)

// Derived store combining multiple dependencies
const userProfileStore = store(get => ({
  name: get(nameStore),
  origin: get(originStore),
  isActive: get(isActiveStore),
  // Computed values based on dependencies
  displayName: `${get(nameStore)} (${get(originStore)})`,
  status: get(isActiveStore) ? 'Online' : 'Offline',
  canPerformActions: get(isActiveStore) && get(originStore) !== 'Unknown',
}))

function UserProfile() {
  // Automatically updates when any dependency changes
  const [userProfile] = useStore(userProfileStore)

  return (
    <div>
      <h3>{userProfile.displayName}</h3>
      <p>Status: {userProfile.status}</p>
      <p>Can perform actions: {userProfile.canPerformActions ? 'Yes' : 'No'}</p>
    </div>
  )
}
```

## Async Stores

Async stores handle asynchronous operations with built-in loading, error, and success states.

### Basic Async Store

```jsx
import { store, useStoreValue, isSuccess } from '@longsien/react-store'

// Async store that fetches data on creation
const pokemonStore = store().async(() =>
  fetch(`https://pokeapi.co/api/v2/pokemon/pikachu`).then(res => res.json())
)

function Pokemon() {
  const pokemon = useStoreValue(pokemonStore)

  // Check if data is successfully loaded
  return <div>Pokemon: {isSuccess(pokemon) && pokemon.name}</div>
}
```

### Async Derived Store

```jsx
import {
  store,
  useStore,
  isLoading,
  isError,
  isSuccess,
  getErrorMessage,
} from '@longsien/react-store'

// Store for Pokemon ID
const pokemonIdStore = store(1)
// Async derived store that fetches when ID changes
const pokemonDetailsStore = pokemonIdStore.derive(async id => {
  const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`)
  return response.json()
})

function PokemonDetails() {
  const [pokemonId, setPokemonId] = useStore(pokemonIdStore)
  const [pokemonDetails] = useStore(pokemonDetailsStore)

  return (
    <div>
      <button onClick={() => setPokemonId(pokemonId + 1)}>Next Pokemon</button>

      {/* Show loading state */}
      {isLoading(pokemonDetails) && <p>Loading Pokemon details...</p>}
      {/* Show error state */}
      {isError(pokemonDetails) && (
        <p>Error: {getErrorMessage(pokemonDetails)}</p>
      )}
      {/* Show success state */}
      {isSuccess(pokemonDetails) && (
        <div>
          <h3>{pokemonDetails.name}</h3>
          <p>
            <img
              src={pokemonDetails.sprites.front_default}
              alt={pokemonDetails.name}
            />
          </p>
          <p>Height: {pokemonDetails.height}</p>
          <p>Weight: {pokemonDetails.weight}</p>
        </div>
      )}
    </div>
  )
}
```

### Async Utility Functions

#### `isLoading(data)`

Returns `true` if the async store is currently loading.

```jsx
// Check if async operation is in progress
{
  isLoading(pokemonDetails) && <p>Loading Pokemon...</p>
}
```

#### `isError(data)`

Returns `true` if the async operation failed.

```jsx
import { isError, getErrorMessage } from '@longsien/react-store'

{
  isError(pokemonDetails) && <p>Error: {getErrorMessage(pokemonDetails)}</p>
}
```

#### `isSuccess(data)`

Returns `true` if the async operation completed successfully.

```jsx
// Check if async operation succeeded
{
  isSuccess(pokemonDetails) && <div>{/* Render success content */}</div>
}
```

#### `getErrorMessage(data)`

Returns the error message from a failed async operation.

```jsx
// Extract error message from failed async operation
const errorMessage = getErrorMessage(pokemonDetails)
```

#### `getErrorStatus(data)`

Returns the HTTP status code from a failed async operation.

```jsx
// Extract HTTP status code from failed async operation
const statusCode = getErrorStatus(pokemonDetails)
```

## Nested Property Access

The library uses JavaScript Proxies to enable nested property access. This allows components to subscribe to deeply nested values without re-rendering when unrelated parts of the state change.

```jsx
import { store, useStore } from '@longsien/react-store'

// Nested object structure
const userStore = store({
  profile: {
    name: 'Winter',
    origin: 'South Korea',
    settings: { theme: 'dark' },
  },
  posts: [],
})

// Subscribe to specific nested properties
const [theme, setTheme] = useStore(userStore.profile.settings.theme)
const [origin, setOrigin] = useStore(userStore.profile.origin)
const [posts, setPosts] = useStore(userStore.posts)

// Updates only affect components using those specific paths
setTheme('light') // Only theme subscribers re-render
setOrigin('Australia') // Only origin subscribers re-render
setPosts(prev => [...prev, newPost]) // Only posts subscribers re-render
```

## Dynamic Scoping

Nested property access works with dynamic scoping, allowing dynamic path path subscription based on component props.

### Array Index Subscriptions

```jsx
import { useStore, useStoreValue } from '@longsien/react-store'

// Dynamic array index subscription
const [comment, setComment] = useStore(commentsStore[index])
const author = useStoreValue(commentsStore[index].author)
```

### Dynamic Object Property Subscriptions

```jsx
import { useStore, useStoreSetter } from '@longsien/react-store'

// Dynamic object property subscription
const [user, setUser] = useStore(usersStore[userId])
const setStatus = useStoreSetter(usersStore[userId].status)
```

### Reading Part of a Store

`get()` returns the value at whatever path you hand it, and the derived store depends on **only that path**. A write elsewhere in the same source doesn't recompute it:

```jsx
const appStore = store({ items: [1, 2], meta: { hits: 0 } })

const itemCount = store(get => get(appStore.items).length)

appStore.meta.hits.set(1) // itemCount does not recompute
appStore.items.set([1, 2, 3]) // itemCount recomputes
```

Paths interact when one contains the other, so correctness never depends on reading at exactly the right depth. Writing `appStore` as a whole reaches a store that read `appStore.items`, and writing `appStore.items[0]` reaches one that read `appStore.items`. Only genuinely disjoint branches — `items` against `meta` — are treated as independent.

This makes narrow reads worth preferring in a large store: `get(appStore.items)` says exactly what the derived store cares about, and everything else stops waking it up.

## Performance Tuning

The defaults suit most applications. These two options matter once a store holds a large amount of data.

### Equality

Every write is compared against the current value, and subscribers are notified only if it actually changed. The default comparison is **deep**, which is what stops a re-render when an immutable update produces a new object holding identical data. That comparison costs O(size) per write, so for a large state replaced wholesale it can dominate:

```jsx
// 20,000 items, replaced 20 times
store(bigState)                             // ~160ms
store(bigState, { equals: 'shallow' })      //  ~0.1ms
store(bigState, { equals: 'reference' })    //  ~0.0ms
```

| Option | Comparison | Use when |
| --- | --- | --- |
| `'deep'` *(default)* | Full structural | Values are rebuilt from equal data and you want to suppress those updates |
| `'shallow'` | Same keys, values by identity | Immutable updates — unchanged branches keep their references anyway |
| `'reference'` | `Object.is` | You always create a new object when something genuinely changed |
| function | Yours | A version field or id is enough to decide |

```jsx
// Shallow is usually the right upgrade for immutably-updated state
const boardStore = store(largeBoard, { equals: 'shallow' })

// Or compare on whatever actually identifies a change
const docStore = store(document, { equals: (a, b) => a.revision === b.revision })
```

The option applies to nested writes as well, and `.derive()` accepts it for the comparison of its computed result:

```jsx
const summaryStore = itemsStore.derive(computeSummary, { equals: 'shallow' })
```

### Persistence debounce

Persisted stores debounce their writes. The default of `0` coalesces every change within a tick, but changes spread across ticks — dragging, typing, animating — each trigger a write, and every write re-serializes the entire state:

```jsx
// 20 updates spread over ~100ms, 20,000 items
store(bigState).local('board')                     // 21 writes
store(bigState).local('board', { debounce: 100 })  //  2 writes
```

```jsx
const boardStore = store(largeBoard).local('board', {
  debounce: 250,
  equals: 'shallow',
})
```

Raising `debounce` never risks losing data: `destroy()` flushes a pending write rather than dropping it. It does mean a hard tab close within the interval can lose the most recent change, so keep the interval short for data you cannot afford to lose. `.session()` and `.index()` take the same option.

### Deferred persistence

`.local(key, { defer: true })` and `.session(key, { defer: true })` create the store without touching storage. `set()` updates memory only. `rehydrate()` (or `rehydrate({ key })`) is the first read/write, and can later point the same store at a different key. A pending write to the previous key is flushed first, matching `destroy()`.

## Server-Side Rendering

Stores work on the server with no configuration. `useStore` and `useStoreValue` supply the server snapshot that React's `useSyncExternalStore` requires, so components render on the server and hydrate on the client without special-casing.

### Persisted stores render their initial value

A server has no `localStorage` and no IndexedDB, so it cannot know what a returning visitor has stored. A persisted store therefore renders its **initial value** on the server, and React swaps in the stored value on the first client render after hydration:

```jsx
// localStorage holds { count: 42 } from a previous visit
const counter = store({ count: 0 }).local('counter')

const Counter = () => {
  const [{ count }] = useStore(counter)
  return <span>{count}</span>
}

// Server renders:      <span>0</span>   ← the initial value
// After hydration:     <span>42</span>  ← the stored value
```

This is deliberate. Rendering the stored value during hydration would not match the server's HTML, and React would report a hydration mismatch. Outside of rendering, `counter.get()` returns the stored value immediately as always — only the hydration snapshot is pinned.

If the brief flash of the initial value matters, gate the persisted part of your UI on having mounted:

```jsx
const Counter = () => {
  const [{ count }] = useStore(counter)
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => setHydrated(true), [])

  return <span>{hydrated ? count : '—'}</span>
}
```

Derived stores follow the same rule: a store derived from a persisted store computes its server value from its source's server value, so the whole chain stays consistent. Async stores render their loading state on the server, since a server render cannot await the promise — use `isLoading` to render a skeleton.

### Missing storage degrades instead of throwing

`.local()`, `.session()` and `.index()` fall back to an ordinary in-memory store when their backend is unavailable, so the same module-level store definition can be imported on the server. In a browser — where a missing backend is a real problem, such as blocked storage or private mode — a warning is logged. Nothing is logged on a server, where the fallback is expected.

### Stores are per-process, not per-request

Module-level stores are shared by every request the server handles, exactly as any module-level value is. Never put request-specific or user-specific data in a module-level store on the server — it will leak between requests. Keep server-rendered stores to genuinely global, non-sensitive state, and pass per-request data through props or your framework's own loader/context mechanism.

## Requirements

- React 18.0.0 or higher

## License

MIT

## Contributing

Issues and pull requests are welcome on [GitHub](https://github.com/longsien/react-store).

## Author

Long Sien
