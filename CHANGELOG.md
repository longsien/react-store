# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.5.0] - 2026-08-21

### Added

- `store.hydrate({ storage, key, debounce? })` to attach or retarget localStorage/sessionStorage persistence on an existing store. An existing key hydrates the store; a missing key is created from the store's current value. Default `.local(key)` / `.session(key)` behaviour is unchanged.

## [1.4.2] - 2026-08-20

### Added

- IndexedDB-backed stores via `store(initialValue).index(storeName, dbName?)`.
- `store.destroy()` now also unregisters derived stores from their dependencies.
- Cross-tab synchronisation for IndexedDB stores, via `BroadcastChannel` where available. Previously only `localStorage` stores synchronised. A write publishes a notification rather than the value, so receivers re-read from the database and it stays the single source of truth. This also keeps two stores on the same key in sync within one tab.
- Derived stores now track dependencies **per path**. `store(get => get(base.items))` no longer recomputes when `base.meta` changes, while writes to a parent or a child of what was read still propagate correctly.
- Configurable equality via `store(value, { equals })`, also accepted by `.derive()`, `.local()`, `.session()` and `.index()`. Takes `'deep'` (the default), `'shallow'`, `'reference'`, or a comparison function. Deep comparison costs O(size) on every write; opting down took 20 root writes to a 20,000-item state from ~160ms to ~0.1ms.
- Configurable persistence debounce via `.local(key, { debounce })`, and the same for `.session()` and `.index()`. Each write re-serializes the whole state, so coalescing bursts matters: 20 updates spread over ~100ms went from 21 writes to 2. A pending write is still flushed by `destroy()`, so raising the interval does not risk losing data.
- Server-side rendering support. `useStore` and `useStoreValue` now supply the `getServerSnapshot` that `useSyncExternalStore` requires; without it React threw `Missing getServerSnapshot` on any server render, making the library unusable with Next.js, Remix and friends.
- Persisted stores render hydration-safely. A server render has no storage to read, so `.local()`, `.session()` and `.index()` stores report their initial value as the server snapshot, matching the server HTML during hydration; React then moves to the persisted value on the first client render. Derived stores compute their server value from their sources' server values, and async stores report the loading state.

### Fixed

- Clearing a `localStorage` key in another tab now keeps the store's current in-memory value instead of reverting to its initial value.
- `isError`, `isLoading`, and `isSuccess` no longer throw on `null` and return proper booleans for falsy values.
- Derived and async derived stores are now released from the dependency map on `destroy()`, preventing a memory leak and needless recomputation.
- Async-derived stores that depend on other async-derived stores now update correctly (async-of-async propagation).
- `setValueAtPath` preserves array types when creating missing intermediate paths with numeric indices.
- `Date`, `Map`, `Set`, `RegExp` and class instances loaded from IndexedDB are no longer silently reverted to their previous value. They are compared and adopted as a unit instead of being recursed into as plain objects, which also stops their prototype from being dropped.
- Reference preservation no longer recurses forever through circular values, which IndexedDB's structured clone can round-trip.
- The `useStore` and `useStoreSetter` setters now write through to the base store for derived stores, matching `.set()`. Previously they overwrote the derived store's own value, which was silently discarded on the next recompute.
- Updates made before an IndexedDB store finishes opening are no longer dropped, and are no longer clobbered by the value being loaded.
- `destroy()` flushes the pending debounced write instead of discarding it, so `set()` immediately followed by `destroy()` no longer loses data (both storage- and IndexedDB-backed stores).
- `destroy()` now unsubscribes the save listener, so a destroyed storage-backed store stops persisting later updates.
- Derived stores re-track their dependencies on every recompute, so a getter with conditional branches (`get(flag) ? get(a) : get(b)`) picks up stores it only starts reading later. Subscribed components previously went permanently stale.
- Writing to a nested path no longer collapses the parent when the container is missing or a primitive: `store(null).a.set(1)` now yields `{ a: 1 }` instead of `1`.
- `undefined` queued as an async derived store's input is no longer lost, leaving the store stuck on a stale result.
- Derived stores now update when a value loads from IndexedDB, matching the existing behaviour for storage events.
- Derived stores no longer leak. A source store now holds its dependents weakly, so a derived store the application has dropped — one created inside a component that has since unmounted, for instance — is garbage collected and stops recomputing, instead of living and recomputing on every source update for as long as its source did. This was the only strong reference to a dependent; every other internal registry is keyed by the store itself. No API change: `destroy()` still works and simply makes the cleanup immediate.
- Two or more `.index()` stores can now share a database. Because `dbName` defaults to `react-store` this was the normal case, and it previously hung forever or silently dropped one store's writes: the second store's object store needs a version upgrade, which the first store's open connection blocks. Connections are now shared and ref-counted per database, and opens are serialized so two stores never race the same version bump.
- A blocked IndexedDB upgrade now rejects with an explanatory error instead of leaving the store hanging with no success or error event.
- `.local()` and `.session()` no longer throw a bare `ReferenceError` where the storage global is absent, and reading from blocked storage falls back to the initial value rather than failing store creation.
- `store['a.b']` and `store.a.b` no longer collide in the proxy cache and return each other's values.
- `.derive()` now detects a plain function that returns a promise, not just one declared `async` — which also makes detection survive consumer builds that transpile `async` away. The promise from the initial compute is adopted, so the function is not invoked twice.
- `.derive()` on a nested path now receives the value at that path instead of the whole root value.
- `get()` inside a derived store now returns the value at the path it was given. `store(get => get(base.items))` previously returned the whole of `base`, silently ignoring the path.
- An IndexedDB connection now closes when another connection needs to upgrade the database, instead of blocking it indefinitely; the next read or write reopens. Previously a store in one tab could stall an upgrade in another forever.

### Changed

- **Breaking:** `.local()`, `.session()` and `.index()` no longer throw when their storage backend is unavailable. They fall back to an ordinary in-memory store, warning only in a browser, where a missing backend is a real problem rather than the expected state on a server. Throwing made server-side rendering impossible, since the same module-level `store(x).local(key)` runs on both sides.
- Proxy cache now evicts least-recently-used entries instead of clearing wholesale, keeping hot proxies (e.g. the root) stable.
- `useStoreSetter`/`useStore` memoize the setter closure directly for fewer allocations.
- Removed type-only declarations for the long-removed legacy API (`getStore`, `setStore`, `storeLocal`, `storeSession`) so the `.d.ts` matches the runtime exports.

## [1.3.2] - 2026-02-03

### Fixed

- Derived stores now update when a storage event occurs (e.g. when another tab changes the value). Works with both `store(get => ...)` and `store().derive(...)` syntax.

## [1.3.1] - 2026-01-28

### Fixed

- Now preserves object references for unchanged nested paths to prevent unnecessary re-renders when updating from localStorage

## [1.3.0] - 2026-01-27

### Added

- Added a listener to update stores from localStorage (useful for cross-tab synchronization)

## [1.2.3] - 2026-01-06

### Fixed

- Updated `deepEqual` utility function to handle circular references efficiently

## [1.2.2] - 2025-11-07

### Fixed

- Updated `deepEqual` utility function to handle circular references efficiently

## [1.2.1] - 2025-10-09

### Added

- Added `deepEqual` utility function for improved object comparison
- Enhanced performance by using deep equality checks to prevent unnecessary re-renders
- Added support for more efficient state updates with deep comparison

### Changed

- Updated internal state comparison logic to use the new `deepEqual` utility
- Improved performance for complex nested state objects
- Enhanced demo application with better examples showcasing async functionality

### Fixed

- Fixed potential unnecessary re-renders when state objects have the same content but different references
- Improved memory efficiency by preventing redundant state updates

## [1.2.0] - 2025-10-08

### Added

- Async store support with `.async()` method
- Async derived stores with automatic dependency tracking
- Error handling utilities: `isError`, `isSuccess`, `isLoading`, `getErrorMessage`, `getErrorStatus`
- Storage-backed stores with `.local()` and `.session()` methods
- Derived stores with `.derive()` method for computed values
- Nested property access for stores
- Individual hooks: `useStoreValue` and `useStoreSetter`

### Changed

- Complete rewrite of the core state management system
- Improved performance with proxy-based state management
- Enhanced TypeScript support

### Removed

- Legacy state management approach
- Old API methods

## [1.1.0] - 2025-06-16

### Added

- Basic store creation and management
- React hooks integration
- TypeScript definitions

## [1.0.0] - 2025-06-12

### Added

- Initial release of the react-store library
