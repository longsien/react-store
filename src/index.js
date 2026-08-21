import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { createCustomEqual } from 'fast-equals'

// Opaque binary values (Blob/File, ArrayBuffer, typed arrays, DataView) are
// persisted as-is by IndexedDB's structured clone, but they can't be
// meaningfully deep-compared (a Blob has no enumerable keys, and any deep-equal
// result is environment-dependent) or recursed into. Treat them as
// identity-compared leaves wherever values are compared or reference-preserved.
const isOpaqueValue = value => {
  if (value == null || typeof value !== 'object') return false
  if (typeof Blob !== 'undefined' && value instanceof Blob) return true
  if (typeof ArrayBuffer !== 'undefined') {
    if (value instanceof ArrayBuffer) return true
    if (ArrayBuffer.isView(value)) return true
  }
  return false
}

// Deep equality that matches circularDeepEqual for plain data, but compares
// opaque binary values by reference identity at any nesting depth.
const customDeepEqual = createCustomEqual({
  circular: true,
  createInternalComparator: compare => (a, b, _ka, _kb, _pa, _pb, state) =>
    isOpaqueValue(a) || isOpaqueValue(b) ? a === b : compare(a, b, state),
})

const valuesEqual = (a, b) =>
  isOpaqueValue(a) || isOpaqueValue(b) ? a === b : customDeepEqual(a, b)

// One level deep: identical keys, each value compared by identity.
const shallowEqual = (a, b) => {
  if (Object.is(a, b)) return true
  if (
    a == null ||
    b == null ||
    typeof a !== 'object' ||
    typeof b !== 'object'
  ) {
    return false
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false

  const keysA = Object.keys(a)
  if (keysA.length !== Object.keys(b).length) return false

  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false
    if (!Object.is(a[key], b[key])) return false
  }
  return true
}

// Deep equality is the default: it stops a re-render when a freshly built object
// holds identical data, which is the common case with immutable updates. But it
// costs O(size) on every write, so a large state that is replaced wholesale can
// opt down to a cheaper comparison.
const EQUALITY_PRESETS = {
  deep: valuesEqual,
  shallow: shallowEqual,
  reference: (a, b) => Object.is(a, b),
}

const resolveEquals = equals => {
  if (equals == null) return valuesEqual
  if (typeof equals === 'function') return equals

  const preset = EQUALITY_PRESETS[equals]
  if (!preset) {
    throw new Error(
      `Unknown equality option "${equals}". Use 'deep', 'shallow', 'reference', or a comparison function.`,
    )
  }
  return preset
}

// Stores created before equality was configurable, and internal bookkeeping
// objects, fall back to the default.
const equalsFor = storeObj => storeObj.equals || valuesEqual

// Serialize a value for localStorage/sessionStorage, which can only hold JSON.
// Binary values can't survive JSON.stringify (a Blob becomes {}, a typed array
// becomes an index map), so fail loudly and point users at .index() instead of
// silently dropping their data.
const stringifyForStorage = (value, storageType, key) =>
  JSON.stringify(value, (_k, v) => {
    if (isOpaqueValue(v)) {
      throw new Error(
        `Cannot persist binary values (Blob/File/ArrayBuffer/typed array) to ${storageType}Storage for key "${key}". Use .index() (IndexedDB) for binary data.`,
      )
    }
    return v
  })

// WeakMaps for state management and derived store tracking
const stateMap = new WeakMap()
const proxyCache = new WeakMap()
const dependencyMap = new WeakMap()
const derivedStoreMap = new WeakMap()

// Main store creation function
export const store = (initialValue, options = {}) => {
  if (typeof initialValue === 'function') {
    return createDerivedStore(initialValue, options)
  }

  const storeObj = {
    value: initialValue,
    listeners: new Set(),
    equals: resolveEquals(options.equals),
  }
  stateMap.set(storeObj, storeObj)
  return createStoreProxy(storeObj)
}

// Reading a bare `localStorage`/`sessionStorage` identifier throws a
// ReferenceError where the global is absent (any server-side render), which
// would escape before the availability check below could report anything
// useful. Going through globalThis yields undefined instead, and the property
// read itself can throw in sandboxed iframes or with storage access blocked.
const getStorage = storageType => {
  const globalName =
    storageType === 'local' ? 'localStorage' : 'sessionStorage'
  try {
    return typeof globalThis === 'undefined' ? null : globalThis[globalName]
  } catch {
    return null
  }
}

// Fall back to a plain in-memory store when a persistence backend is missing.
// Throwing instead would make the library unusable with server-side rendering,
// where the very same module-level `store(x).local(key)` runs with no storage
// at all. Degrading lets the server render the initial value and the client
// hydrate to the persisted one. The warning is browser-only: there, missing
// storage is a real problem worth surfacing, whereas on a server it is expected
// and would just spam the logs on every render.
const createUnpersistedStore = (initialValue, reason) => {
  if (typeof window !== 'undefined') {
    console.warn(reason)
  }

  const storeObj = { value: initialValue, listeners: new Set() }
  stateMap.set(storeObj, storeObj)
  return createStoreProxy(storeObj)
}

const readStoredValue = (storage, key, fallback) => {
  // Check if key exists in storage (regardless of its value). Reading can throw
  // when storage access is blocked, which should degrade to the initial value
  // rather than take down store creation.
  let storedItem = null
  try {
    storedItem = storage.getItem(key)
  } catch (error) {
    console.error(`Failed to read from storage with key "${key}":`, error)
    return { keyExists: false, value: fallback }
  }

  if (storedItem === null) {
    // Only use initialValue if key doesn't exist
    return { keyExists: false, value: fallback }
  }

  try {
    // If key exists, parse and return the stored value (even if it's null)
    return { keyExists: true, value: JSON.parse(storedItem) }
  } catch {
    return { keyExists: true, value: fallback }
  }
}

const writeStoredValue = (storage, storageType, key, value) => {
  // Serialize outside the try so an opaque-value error surfaces synchronously
  // rather than being swallowed as a generic save failure.
  const stringifiedValue = stringifyForStorage(value, storageType, key)
  try {
    storage.setItem(key, stringifiedValue)
  } catch (error) {
    console.error(`Failed to save value to storage with key "${key}":`, error)
  }
}

const storageUnavailableReason = (storageType, key) =>
  `${storageType}Storage is not available, so "${key}" will not persist. This store will keep its value in memory only.`

// Attach localStorage/sessionStorage persistence to an existing store. This is
// shared by the immediate `.local()` / `.session()` factories and the explicit
// `hydrate()` API, which keeps the original store identity and its subscribers.
const hydrateStorageStore = (storeObj, storageType, key, options = {}) => {
  const storage = getStorage(storageType)

  if (
    !storage ||
    typeof storage.getItem !== 'function' ||
    typeof storage.setItem !== 'function'
  ) {
    if (typeof window !== 'undefined') {
      console.warn(storageUnavailableReason(storageType, key))
    }
    return false
  }

  // Resolve the new backend before disturbing the existing binding. Once it is
  // usable, detach the old binding without updating its key; the new target is
  // authoritative from this point forward.
  if (storeObj._storageBinding) {
    storeObj._storageBinding.unbind({ flush: false })
  }

  // React also calls getServerSnapshot during client hydration. Pin the value
  // from before the browser-only storage read so it can still match server HTML.
  if (!('serverValue' in storeObj)) storeObj.serverValue = storeObj.value

  // Writes are debounced. The default of 0 coalesces everything within a tick;
  // a larger interval coalesces bursts (dragging, typing) into a single write,
  // which matters because each one re-serializes the whole state.
  const saveDelay = options.debounce ?? 0

  // Track if we're currently updating from storage to prevent circular updates
  let isUpdatingFromStorage = false
  let saveTimeout = null
  let active = true

  const saveNow = () => {
    clearTimeout(saveTimeout)
    saveTimeout = null
    if (!active) return
    try {
      const stringifiedValue = stringifyForStorage(
        storeObj.value,
        storageType,
        key,
      )
      storage.setItem(key, stringifiedValue)
    } catch (error) {
      console.error(`Failed to save to storage with key "${key}":`, error)
    }
  }

  const applyLoadedValue = nextValue => {
    if (equalsFor(storeObj)(nextValue, storeObj.value)) return
    isUpdatingFromStorage = true
    // Preserve object references for unchanged nested paths to prevent
    // unnecessary re-renders for components listening to nested properties
    storeObj.value = preserveReferences(storeObj.value, nextValue)
    storeObj.listeners.forEach(listener => listener())
    notifyDependentStores(storeObj, simpleGet)
    isUpdatingFromStorage = false
  }

  // A missing key is initialized from the store's current value. An existing
  // key wins and hydrates the store instead.
  const valueBeforeHydration = storeObj.value
  const { keyExists, value: loadedValue } = readStoredValue(
    storage,
    key,
    valueBeforeHydration,
  )
  if (keyExists) {
    applyLoadedValue(loadedValue)
  } else {
    writeStoredValue(storage, storageType, key, valueBeforeHydration)
  }

  const saveListener = () => {
    // Don't save to storage if we're applying a storage read/event.
    if (isUpdatingFromStorage) return
    clearTimeout(saveTimeout)
    saveTimeout = setTimeout(saveNow, saveDelay)
  }
  storeObj.listeners.add(saveListener)

  let handleStorageChange = null
  if (
    storageType === 'local' &&
    typeof window !== 'undefined' &&
    window.addEventListener
  ) {
    handleStorageChange = event => {
      if (event.key !== key) return
      if (event.storageArea && event.storageArea !== storage) return

      // Removing a key in another tab leaves the current in-memory state alone.
      if (event.newValue === null) return

      let newValue
      try {
        newValue = JSON.parse(event.newValue)
      } catch (error) {
        console.error(
          `Failed to parse storage value for key "${key}" from storage event:`,
          error,
        )
        return
      }

      applyLoadedValue(newValue)
    }
    window.addEventListener('storage', handleStorageChange)
  }

  // Destroy flushes the active binding. Retargeting passes `flush: false`, so
  // the previous key is intentionally left at its last persisted value.
  const binding = {
    storageType,
    key,
    unbind: ({ flush = true } = {}) => {
      if (!active) return
      if (saveTimeout !== null) {
        if (flush) saveNow()
        else {
          clearTimeout(saveTimeout)
          saveTimeout = null
        }
      }
      active = false
      storeObj.listeners.delete(saveListener)
      if (handleStorageChange && typeof window !== 'undefined') {
        window.removeEventListener('storage', handleStorageChange)
      }
      if (storeObj._storageBinding === binding) {
        storeObj._storageBinding = null
      }
    },
  }
  storeObj._storageBinding = binding
  return true
}

// Create immediately storage-backed stores while preserving the established
// `.local()` / `.session()` behavior.
const createStorageStore = (storageType, key, initialValue, options = {}) => {
  const storeObj = {
    value: initialValue,
    listeners: new Set(),
    serverValue: initialValue,
    equals: resolveEquals(options.equals),
  }
  stateMap.set(storeObj, storeObj)
  const storeProxy = createStoreProxy(storeObj)

  hydrateStorageStore(storeObj, storageType, key, options)

  return storeProxy
}

const INDEX_DB_STORE_KEY = 'value'

// Every store backed by the same database shares one connection, keyed by name.
// Because `dbName` defaults to 'react-store', two `.index()` calls normally land
// in the same database, and the second one needs a version bump to add its
// object store — which any other open connection blocks. Holding a second
// connection here would deadlock the library against itself, so connections are
// shared and every open is serialized behind the last.
const databases = new Map()

const openDatabase = (dbName, storeNames, version) =>
  new Promise((resolve, reject) => {
    const request =
      version === undefined ?
        indexedDB.open(dbName)
      : indexedDB.open(dbName, version)

    request.onupgradeneeded = () => {
      const db = request.result
      for (const name of storeNames) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name)
        }
      }
    }

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    // A blocked upgrade fires neither success nor error. Without this the
    // promise would never settle and the store would hang silently.
    request.onblocked = () =>
      reject(
        new Error(
          `Upgrading IndexedDB database "${dbName}" is blocked by another open connection to it (likely another tab).`,
        ),
      )
  })

// Adding an object store needs a version bump, and our own connection would
// block it, so close before reopening. Every store name this database is known
// to need is created in the same upgrade.
// Adopt a freshly opened connection, releasing it if another connection later
// needs to upgrade the database. Holding it open would block that upgrade —
// exactly the deadlock this registry exists to avoid, except across tabs, where
// closing is the only cooperative option. The next read or write reopens.
const adoptConnection = (entry, db) => {
  db.onversionchange = () => {
    db.close()
    if (entry.db === db) entry.db = null
  }
  entry.db = db
  return db
}

const upgradeForStore = (entry, dbName) => {
  const version = entry.db.version + 1
  entry.db.close()
  entry.db = null

  return openDatabase(dbName, entry.storeNames, version).then(db =>
    adoptConnection(entry, db),
  )
}

const ensureObjectStore = (dbName, storeName) => {
  const entry = databases.get(dbName)
  if (!entry) return Promise.resolve(null)

  entry.storeNames.add(storeName)

  if (entry.db) {
    return entry.db.objectStoreNames.contains(storeName) ?
        Promise.resolve(entry.db)
      : upgradeForStore(entry, dbName)
  }

  return openDatabase(dbName, entry.storeNames).then(db => {
    adoptConnection(entry, db)
    return db.objectStoreNames.contains(storeName) ?
        db
      : upgradeForStore(entry, dbName)
  })
}

// Queue work behind any in-flight open or upgrade for this database, so a write
// can never land on a connection that is being closed mid-upgrade. The chain
// itself always resolves to the live connection and never rejects.
const queueOnDatabase = (dbName, work) => {
  const entry = databases.get(dbName)
  if (!entry) return Promise.resolve(null)

  const result = entry.chain.then(() => work(entry.db))
  entry.chain = result.then(
    () => entry.db,
    () => entry.db,
  )
  return result
}

// Run work against a live connection, reopening first if ours was closed to let
// another tab upgrade.
const withDatabase = (dbName, storeName, work) =>
  queueOnDatabase(dbName, db =>
    db ? work(db) : (
      ensureObjectStore(dbName, storeName).then(reopened =>
        reopened ? work(reopened) : null,
      )
    ),
  )

const acquireDatabase = (dbName, storeName) => {
  let entry = databases.get(dbName)
  if (!entry) {
    entry = { db: null, refs: 0, storeNames: new Set(), chain: Promise.resolve() }
    databases.set(dbName, entry)
  }
  entry.refs++

  return queueOnDatabase(dbName, () => ensureObjectStore(dbName, storeName))
}

const releaseDatabase = dbName => {
  const entry = databases.get(dbName)
  if (!entry) return

  entry.refs--
  if (entry.refs > 0) return

  databases.delete(dbName)
  // Close only once queued work has drained, so a write flushed by destroy()
  // still lands before the connection goes away.
  entry.chain.then(
    () => {
      if (entry.db) {
        entry.db.close()
        entry.db = null
      }
    },
    () => {},
  )
}

const idbGet = (db, storeName) => {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const request = tx.objectStore(storeName).get(INDEX_DB_STORE_KEY)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

const idbPut = (db, storeName, value) => {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const request = tx.objectStore(storeName).put(value, INDEX_DB_STORE_KEY)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

const createIndexStore = (storeName, dbName, initialValue, options = {}) => {
  if (typeof indexedDB === 'undefined') {
    return createUnpersistedStore(
      initialValue,
      `IndexedDB is not available, so "${storeName}" will not persist. This store will keep its value in memory only.`,
    )
  }

  // The stored value arrives asynchronously, so a server render only ever sees
  // the initial value — pin that as the server snapshot so hydration matches.
  const storeObj = {
    value: initialValue,
    listeners: new Set(),
    serverValue: initialValue,
    equals: resolveEquals(options.equals),
    _persistenceBackend: 'index',
  }
  stateMap.set(storeObj, storeObj)
  const storeProxy = createStoreProxy(storeObj)

  // See createStorageStore: each write re-serializes the whole state, so a
  // larger interval collapses a burst of updates into a single one.
  const saveDelay = options.debounce ?? 0

  let saveTimeout = null
  let destroyed = false
  let isLoadingFromDB = false
  // Sticky: an update made before the database finishes opening must still be
  // persisted, and must win over whatever was already stored — it is newer.
  let hasLocalUpdate = false

  // IndexedDB has no equivalent of the `storage` event, so writes are announced
  // on a channel keyed by database and store name. Only a ping is sent, never
  // the value: receivers re-read, which keeps the database the single source of
  // truth and avoids serializing the state a second time. A channel does not
  // receive its own messages, so this also syncs two stores on the same key
  // within one tab.
  const channelName = `react-store:${dbName}:${storeName}`
  const channel =
    typeof BroadcastChannel !== 'undefined' ?
      new BroadcastChannel(channelName)
    : null

  const applyStoredValue = existingValue => {
    if (destroyed || existingValue === undefined) return
    if (equalsFor(storeObj)(existingValue, storeObj.value)) return

    isLoadingFromDB = true
    storeObj.value = preserveReferences(storeObj.value, existingValue)
    storeObj.listeners.forEach(listener => listener())
    notifyDependentStores(storeObj, simpleGet)
    isLoadingFromDB = false
  }

  const readFromDB = () =>
    withDatabase(dbName, storeName, db => idbGet(db, storeName))

  const saveNow = () => {
    clearTimeout(saveTimeout)
    saveTimeout = null
    if (destroyed) return

    // Queued, so a write issued before the database opens is not dropped.
    withDatabase(dbName, storeName, db =>
      idbPut(db, storeName, storeObj.value),
    )
      .then(() => {
        if (channel) channel.postMessage(1)
      })
      .catch(error => {
        console.error(`Failed to save to IndexedDB store "${storeName}":`, error)
      })
  }

  const saveListener = () => {
    if (isLoadingFromDB) return

    hasLocalUpdate = true
    clearTimeout(saveTimeout)
    saveTimeout = setTimeout(saveNow, saveDelay)
  }
  storeObj.listeners.add(saveListener)

  if (channel) {
    channel.onmessage = () => {
      readFromDB()
        .then(applyStoredValue)
        .catch(error => {
          console.error(
            `Failed to sync IndexedDB store "${storeName}":`,
            error,
          )
        })
    }
  }

  acquireDatabase(dbName, storeName).catch(error => {
    console.error(`Failed to initialize IndexedDB store "${storeName}":`, error)
  })

  readFromDB()
    .then(existingValue => {
      if (destroyed) return

      if (hasLocalUpdate || existingValue === undefined) {
        // Either the store was updated while we were opening, or nothing is
        // stored yet. Either way, persist what we currently hold.
        saveNow()
      } else {
        applyStoredValue(existingValue)
      }
    })
    .catch(error => {
      console.error(`Failed to load IndexedDB store "${storeName}":`, error)
    })

  storeObj._cleanup = () => {
    // Flush the debounced write before releasing, so `set()` immediately
    // followed by `destroy()` still persists, then stop listening so a
    // destroyed store no longer writes.
    if (saveTimeout !== null) saveNow()
    destroyed = true
    storeObj.listeners.delete(saveListener)
    if (channel) channel.close()
    releaseDatabase(dbName)
  }

  return storeProxy
}

// Get state object from store
const getState = store => {
  if (store._obj) return store._obj
  return stateMap.get(store)
}

// Find the base store that a derived store depends on
const findBaseStore = derivedStoreObj => {
  return derivedStoreObj.baseStore
}

// Utility functions for nested object manipulation
const getValueAtPath = (obj, path) => {
  if (path.length === 0) return obj
  if (path.length === 1) return obj?.[path[0]]
  return path.reduce((current, key) => current?.[key], obj)
}

// `get`/`simpleGet` always hand back the root store's value, so a proxy for a
// nested path has to walk down to the value it actually points at.
const valueAtPath = (rootValue, path) =>
  path.length > 0 ? getValueAtPath(rootValue, path) : rootValue

const isThenable = value =>
  value != null &&
  (typeof value === 'object' || typeof value === 'function') &&
  typeof value.then === 'function'

const setValueAtPath = (obj, path, value) => {
  // When the container is missing or isn't an object, create one — an array if
  // the key being written is a numeric index, otherwise an object. Replacing it
  // with the leaf value instead would collapse the parent, so that
  // `store(null).a.set(1)` yields `1` rather than `{ a: 1 }`.
  const base =
    obj != null && typeof obj === 'object' ? obj
    : /^\d+$/.test(String(path[0])) ? []
    : {}

  const newObj = Array.isArray(base) ? [...base] : { ...base }

  if (path.length === 1) {
    newObj[path[0]] = value
    return newObj
  }

  const [key, ...remaining] = path
  newObj[key] = setValueAtPath(base[key], remaining, value)
  return newObj
}

// Only arrays and plain objects can be structurally rebuilt. Anything else with
// a non-Object prototype (Date, Map, Set, RegExp, class instances) must be
// treated as a leaf: recursing would compare zero enumerable keys, wrongly
// conclude "unchanged" and hand back the stale old value, and rebuilding it
// would drop its prototype. Reachable via IndexedDB, whose structured clone
// preserves these types (unlike JSON).
const isPlainContainer = value => {
  if (Array.isArray(value)) return true
  if (value == null || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

const preserveArray = (oldValue, newValue, seen) => {
  const minLength = Math.min(oldValue.length, newValue.length)
  let hasChanges = oldValue.length !== newValue.length
  const preserved = newValue.map((item, index) => {
    if (index < minLength) {
      const preservedItem = preserveReferences(oldValue[index], item, seen)
      if (preservedItem !== oldValue[index]) hasChanges = true
      return preservedItem
    }
    return item
  })
  return hasChanges ? preserved : oldValue
}

const preserveObject = (oldValue, newValue, seen) => {
  const newKeys = Object.keys(newValue)

  let hasChanges = false
  const preserved = {}
  for (const key of newKeys) {
    if (key in oldValue) {
      const preservedValue = preserveReferences(
        oldValue[key],
        newValue[key],
        seen,
      )
      preserved[key] = preservedValue
      if (preservedValue !== oldValue[key]) hasChanges = true
    } else {
      preserved[key] = newValue[key]
      hasChanges = true
    }
  }

  // Check for removed keys (only if key count differs for early exit)
  if (Object.keys(oldValue).length !== newKeys.length) {
    hasChanges = true
  }

  return hasChanges ? preserved : oldValue
}

// Preserve object references when nested values haven't changed
// This prevents unnecessary re-renders for components listening to nested paths
const preserveReferences = (oldValue, newValue, seen) => {
  // If values are equal by reference, return old value
  if (oldValue === newValue) return oldValue

  // Opaque binary values are leaves: never recurse into them. A differing
  // reference means a different blob/buffer, so adopt the new value.
  if (isOpaqueValue(oldValue) || isOpaqueValue(newValue)) return newValue

  // If either is null/undefined or not an object, return new value
  if (
    oldValue == null ||
    newValue == null ||
    typeof oldValue !== 'object' ||
    typeof newValue !== 'object'
  ) {
    return newValue
  }

  // Non-plain containers are compared whole and adopted or kept as a unit.
  if (!isPlainContainer(oldValue) || !isPlainContainer(newValue)) {
    return valuesEqual(oldValue, newValue) ? oldValue : newValue
  }

  // If types don't match, return new value
  if (Array.isArray(oldValue) !== Array.isArray(newValue)) {
    return newValue
  }

  // Structured clone can round-trip circular values, so guard against
  // recursing forever through two distinct-but-circular trees. On re-entry we
  // adopt the new value: the data stays correct, we just skip reference
  // preservation across the cycle.
  const inProgress = seen || new Map()
  let visited = inProgress.get(oldValue)
  if (!visited) {
    visited = new Set()
    inProgress.set(oldValue, visited)
  } else if (visited.has(newValue)) {
    return newValue
  }
  visited.add(newValue)

  try {
    return Array.isArray(newValue) ?
        preserveArray(oldValue, newValue, inProgress)
      : preserveObject(oldValue, newValue, inProgress)
  } finally {
    visited.delete(newValue)
  }
}

// Create setState function
const createSetState = (state, path) => {
  return nextValueOrUpdater => {
    const currentValue =
      path.length === 0 ? state.value : getValueAtPath(state.value, path)

    const nextValue =
      typeof nextValueOrUpdater === 'function' ?
        nextValueOrUpdater(currentValue)
      : nextValueOrUpdater

    if (equalsFor(state)(nextValue, currentValue)) return

    if (path.length === 0) {
      state.value = nextValue
    } else {
      state.value = setValueAtPath(state.value, path, nextValue)
    }

    state.listeners.forEach(listener => listener())

    notifyDependentStores(state, simpleGet, path)
  }
}

// Build the setter used by both `.set()` and the `useStore`/`useStoreSetter`
// hooks. Writes to a derived store are forwarded to the base store it was
// derived from; routing them here means both paths behave identically, instead
// of the hooks quietly overwriting the derived value until the next recompute
// discarded it.
const createStoreSetter = (storeObj, path) => {
  if (!storeObj.isDerived) return createSetState(storeObj, path)

  const baseStore = findBaseStore(storeObj)
  if (!baseStore) {
    return () => {
      throw new Error(
        'Cannot set value on derived store. Derived stores are read-only.',
      )
    }
  }

  return createSetState(getState(baseStore), path)
}

// Create derived store from getter function
const createDerivedStore = (getter, options = {}) => {
  const storeObj = {
    value: undefined,
    listeners: new Set(),
    isDerived: true,
    getter,
    dependencies: new Set(),
    lastComputedValue: undefined,
    baseStore: null, // Store reference to the base store proxy
    equals: resolveEquals(options.equals),
  }

  stateMap.set(storeObj, storeObj)
  derivedStoreMap.set(storeObj, storeObj)

  const get = store => {
    const targetStoreObj = getState(store)
    if (!targetStoreObj) {
      throw new Error('Store not found')
    }

    // Record which part of the source was read, so a write elsewhere in that
    // source can skip recomputing this store entirely.
    const targetPath = store._path || []
    storeObj.dependencies.add(targetStoreObj)
    trackDependencyPath(storeObj, targetStoreObj, targetPath)
    registerDependent(targetStoreObj, storeObj)

    return valueAtPath(targetStoreObj.value, targetPath)
  }

  // Dependencies are re-tracked on *every* recompute, not just the first, so a
  // getter with conditional branches (`get(flag) ? get(a) : get(b)`) picks up
  // stores it only starts reading later. computeDerivedValue drives this.
  storeObj.trackedGet = get
  storeObj.beginTracking = () => {
    // Remove stale dependency reverse-mappings before rebuilding
    for (const dep of storeObj.dependencies) {
      unregisterDependent(dep, storeObj)
    }
    storeObj.dependencies.clear()
    storeObj.dependencyPaths?.clear()
  }

  storeObj.value = computeDerivedValue(storeObj, get)

  // Unregister this derived store from its dependencies' reverse-mappings
  // so it can be garbage collected once destroyed.
  storeObj._cleanup = storeObj.beginTracking

  return createStoreProxy(storeObj)
}

// Two paths interact when one is a prefix of the other: writing `a.b` affects a
// reader of `a`, and writing `a` affects a reader of `a.b`. Disjoint branches —
// `a.b` against `a.c` — do not interact at all.
const pathsIntersect = (a, b) => {
  const shared = Math.min(a.length, b.length)
  for (let i = 0; i < shared; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

// Record which path of a source a dependent actually read.
const trackDependencyPath = (dependentStoreObj, sourceStoreObj, path) => {
  let bySource = dependentStoreObj.dependencyPaths
  if (!bySource) {
    bySource = new Map()
    dependentStoreObj.dependencyPaths = bySource
  }

  let paths = bySource.get(sourceStoreObj)
  if (!paths) {
    paths = new Map()
    bySource.set(sourceStoreObj, paths)
  }
  paths.set(JSON.stringify(path), path)
}

// Whether a write at `changedPath` can affect what this dependent read. Stores
// that track manually (async derived stores) record no paths and are always
// considered affected.
const dependsOnChange = (dependentStoreObj, sourceStoreObj, changedPath) => {
  const paths = dependentStoreObj.dependencyPaths?.get(sourceStoreObj)
  if (!paths || paths.size === 0) return true

  for (const path of paths.values()) {
    if (pathsIntersect(path, changedPath)) return true
  }
  return false
}

// Dependents are held weakly. Every other registry here is a WeakMap keyed by
// the store itself, so this set is the only strong reference that would outlive
// a derived store the application has dropped — a derived store created per
// component instance used to survive its component, and keep recomputing on
// every source update, for as long as its source lived. Dead entries are pruned
// when the set is next walked.
const supportsWeakRef = typeof WeakRef !== 'undefined'

const dependentRef = storeObj => {
  if (!storeObj._weakRef) {
    // Cached on the store so a dependent can be looked up and removed by
    // identity. The ref is only reachable through the store it points at, so it
    // cannot keep that store alive.
    storeObj._weakRef =
      supportsWeakRef ? new WeakRef(storeObj) : { deref: () => storeObj }
  }
  return storeObj._weakRef
}

// Register a derived/async store as a dependent of a source store
const registerDependent = (sourceStoreObj, dependentStoreObj) => {
  let depSet = dependencyMap.get(sourceStoreObj)
  if (!depSet) {
    depSet = new Set()
    dependencyMap.set(sourceStoreObj, depSet)
  }
  depSet.add(dependentRef(dependentStoreObj))
}

// Remove an async/derived store from a single source's reverse-mapping
const unregisterDependent = (sourceStoreObj, dependentStoreObj) => {
  const depSet = dependencyMap.get(sourceStoreObj)
  if (depSet) {
    depSet.delete(dependentRef(dependentStoreObj))
    if (depSet.size === 0) dependencyMap.delete(sourceStoreObj)
  }
}

// Create async derived store that handles async operations
const createAsyncDerivedStore = (target, asyncFn) => {
  const asyncStoreObj = createAsyncStoreObject(asyncFn)
  const runAsyncOperation = createAsyncOperationRunner(asyncStoreObj, asyncFn)

  stateMap.set(asyncStoreObj, asyncStoreObj)
  derivedStoreMap.set(asyncStoreObj, asyncStoreObj)

  // Override the getter to re-run async operation when dependencies change
  asyncStoreObj.getter = get => {
    const currentInputValue = target.getter(get)

    if (!equalsFor(asyncStoreObj)(currentInputValue, asyncStoreObj.lastInputValue)) {
      asyncStoreObj.lastInputValue = currentInputValue
      runAsyncOperation(currentInputValue)
    }

    return asyncStoreObj.value
  }

  // Set up dependency tracking with the original derived store
  setupDependencyTracking(target, asyncStoreObj)

  asyncStoreObj._cleanup = () => unregisterDependent(target, asyncStoreObj)

  // Start the initial async operation
  const initialInputValue = target.getter(simpleGet)
  asyncStoreObj.lastInputValue = initialInputValue
  runAsyncOperation(initialInputValue)

  return createStoreProxy(asyncStoreObj)
}

// Build an async store driven by `derivedFn`, re-running it whenever the value
// `proxy` points at changes. `initialPromise`, when supplied, is a run that has
// already been started and should be adopted instead of calling derivedFn again.
const createAsyncDeriveStore = (
  storeObj,
  proxy,
  derivedFn,
  initialPromise,
  options = {},
) => {
  const asyncStoreObj = createAsyncStoreObject(derivedFn, options.equals)
  const runAsyncOperation = createAsyncOperationRunner(asyncStoreObj, derivedFn)

  stateMap.set(asyncStoreObj, asyncStoreObj)
  derivedStoreMap.set(asyncStoreObj, asyncStoreObj)

  // Override the getter to re-run async operation when dependencies change
  asyncStoreObj.getter = get => {
    const currentInputValue = get(proxy)

    if (!equalsFor(asyncStoreObj)(currentInputValue, asyncStoreObj.lastInputValue)) {
      asyncStoreObj.lastInputValue = currentInputValue
      runAsyncOperation(currentInputValue)
    }

    return asyncStoreObj.value
  }

  // Set up dependency tracking
  setupDependencyTracking(storeObj, asyncStoreObj)

  asyncStoreObj._cleanup = () => unregisterDependent(storeObj, asyncStoreObj)

  // Start the initial async operation
  const initialInputValue = simpleGet(proxy)
  asyncStoreObj.lastInputValue = initialInputValue
  runAsyncOperation(initialInputValue, initialPromise)

  return createStoreProxy(asyncStoreObj)
}

// Shared get function for store access (stateless, no allocation needed)
const simpleGet = store => {
  const storeObj = getState(store)
  return valueAtPath(storeObj.value, store._path || [])
}

// Set up dependency tracking between stores
const setupDependencyTracking = (sourceStore, targetStore) => {
  registerDependent(sourceStore, targetStore)
}

// Create an async store object with common properties
const createAsyncStoreObject = (asyncFn, equals) => {
  const loadingValue = { loading: true }

  return {
  value: loadingValue,
  // A server render can't await the promise, so it always emits the loading
  // state. Sharing the exact object keeps the server snapshot reference-stable,
  // which React requires, and stops serverValueOf from calling the getter —
  // which would kick off the async operation on the server.
  serverValue: loadingValue,
  listeners: new Set(),
  isDerived: true,
  isAsync: true,
  equals: resolveEquals(equals),
  getter: get => ({ loading: true }),
  dependencies: new Set(),
  lastComputedValue: undefined,
  asyncFn,
  isRunning: false,
  lastInputValue: undefined,
  // The input the most recent run actually started with. Distinct from
  // lastInputValue, which the getter advances before the run is queued.
  lastRunInputValue: undefined,
  pendingInputValue: undefined,
  // `undefined` is a legitimate input value, so pending-ness needs its own
  // flag rather than sentinel-checking pendingInputValue.
  hasPendingInput: false,
  }
}

// The value a store has before anything a server can't do — reading storage,
// awaiting a promise — has changed it. React calls getServerSnapshot during
// hydration as well as on the server, so this has to match the server HTML and
// be reference-stable across calls.
const serverValueOf = storeObj => {
  if ('serverValue' in storeObj) return storeObj.serverValue

  // A derived store recomputes from its sources' server values. Async stores
  // never reach here — they pin a serverValue above — so the getter is safe to
  // call. The result is cached because React requires a consistent snapshot.
  if (storeObj.isDerived) {
    try {
      storeObj.serverValue = storeObj.getter(serverGet)
    } catch (error) {
      console.error('Error computing derived store server value:', error)
      storeObj.serverValue = storeObj.lastComputedValue
    }
    return storeObj.serverValue
  }

  // A plain store holds the same value on both sides, having no browser-only
  // source to diverge from.
  return storeObj.value
}

const serverGet = store =>
  valueAtPath(serverValueOf(getState(store)), store._path || [])

// Create async operation runner
const createAsyncOperationRunner = (asyncStoreObj, derivedFn) => {
  const run = (inputValue, existingPromise) => {
    asyncStoreObj.lastRunInputValue = inputValue
    asyncStoreObj.isRunning = true
    asyncStoreObj.value = { loading: true }
    asyncStoreObj.listeners.forEach(listener => listener())

    // An adopted promise is a run derivedFn already started; calling it again
    // would duplicate the work, including any request it makes.
    Promise.resolve(existingPromise || derivedFn(inputValue))
      .then(result => {
        asyncStoreObj.value = result
        asyncStoreObj.lastComputedValue = result
        asyncStoreObj.isRunning = false
        asyncStoreObj.listeners.forEach(listener => listener())
        notifyDependentStores(asyncStoreObj, simpleGet)
        flushPending()
      })
      .catch(error => {
        asyncStoreObj.value = {
          error: true,
          message: error.message || 'An error occurred',
          status: error.status || 'error',
        }
        asyncStoreObj.lastComputedValue = asyncStoreObj.value
        asyncStoreObj.isRunning = false
        asyncStoreObj.listeners.forEach(listener => listener())
        notifyDependentStores(asyncStoreObj, simpleGet)
        flushPending()
      })
  }

  const flushPending = () => {
    if (!asyncStoreObj.hasPendingInput) return

    const pending = asyncStoreObj.pendingInputValue
    asyncStoreObj.hasPendingInput = false
    asyncStoreObj.pendingInputValue = undefined

    // Compare against the input the finished run used, not lastInputValue —
    // the getter already advanced that to `pending` before queueing it, so
    // comparing against it would always match and drop the update.
    if (!equalsFor(asyncStoreObj)(pending, asyncStoreObj.lastRunInputValue)) {
      asyncStoreObj.lastInputValue = pending
      run(pending)
    }
  }

  return (inputValue, existingPromise) => {
    if (asyncStoreObj.isRunning) {
      asyncStoreObj.pendingInputValue = inputValue
      asyncStoreObj.hasPendingInput = true
      return
    }
    run(inputValue, existingPromise)
  }
}

// Notify dependent derived stores of a store update
function notifyDependentStores(storeObj, get, changedPath = []) {
  const dependents = dependencyMap.get(storeObj)
  if (!dependents) return

  // Iterate a snapshot: recomputing a dependent re-registers its dependencies,
  // which mutates this very Set. A value deleted and re-added mid-iteration is
  // revisited by the live Set, which would loop forever.
  for (const ref of [...dependents]) {
    const dependentStore = ref.deref()

    // Collected since the last walk — drop the tombstone.
    if (!dependentStore) {
      dependents.delete(ref)
      continue
    }

    if (!derivedStoreMap.has(dependentStore)) continue

    const dependentStoreObj = derivedStoreMap.get(dependentStore)

    // Skip a dependent that only read a branch this write did not touch.
    if (!dependsOnChange(dependentStoreObj, storeObj, changedPath)) continue

    if (dependentStoreObj.isAsync) {
      // Re-run the async getter; it no-ops unless its input changed,
      // so this is safe against cycles and propagates async-of-async chains.
      dependentStoreObj.getter(simpleGet)
    } else {
      computeDerivedValue(dependentStoreObj, get)
    }
  }

  // Every dependent was collected; drop the empty set too. Recomputing a
  // dependent re-registers it, which can replace this set with a fresh one, so
  // only delete the entry if it is still the very set that was walked.
  if (dependents.size === 0 && dependencyMap.get(storeObj) === dependents) {
    dependencyMap.delete(storeObj)
  }
}

// Compute derived store value and handle dependency updates
function computeDerivedValue(derivedStoreObj, get) {
  try {
    // Re-register dependencies on each recompute so conditional dependencies
    // stay accurate. Async derived stores track manually and have no
    // trackedGet, so they keep using the caller's get.
    const trackedGet = derivedStoreObj.trackedGet
    if (trackedGet) derivedStoreObj.beginTracking()

    const newValue = derivedStoreObj.getter(trackedGet || get)

    if (!equalsFor(derivedStoreObj)(newValue, derivedStoreObj.lastComputedValue)) {
      derivedStoreObj.value = newValue
      derivedStoreObj.lastComputedValue = newValue

      derivedStoreObj.listeners.forEach(listener => listener())

      notifyDependentStores(derivedStoreObj, simpleGet)
    }

    return newValue
  } catch (error) {
    console.error('Error computing derived store value:', error)
    return derivedStoreObj.lastComputedValue
  }
}

// Create store proxy with nested property access
const MAX_PROXY_CACHE_SIZE = 500

function createStoreProxy(storeObj, path = []) {
  // Joining on '.' is ambiguous: `store['a.b']` and `store.a.b` produce the same
  // key, so one silently returns the other's proxy. JSON quotes and escapes each
  // segment, which keeps distinct paths distinct.
  const pathKey = JSON.stringify(path)

  let pathCache = proxyCache.get(storeObj)
  if (!pathCache) {
    pathCache = new Map()
    proxyCache.set(storeObj, pathCache)
  }

  if (pathCache.has(pathKey)) {
    // Refresh LRU recency: re-insert so hot paths (e.g. the root) survive eviction
    const cached = pathCache.get(pathKey)
    pathCache.delete(pathKey)
    pathCache.set(pathKey, cached)
    return cached
  }

  // Prevent unbounded cache growth for dynamic paths by evicting the
  // least-recently-used entry (Map preserves insertion/refresh order).
  if (pathCache.size >= MAX_PROXY_CACHE_SIZE) {
    const oldestKey = pathCache.keys().next().value
    pathCache.delete(oldestKey)
  }

  const proxy = new Proxy(storeObj, {
    get(target, prop) {
      if (typeof prop === 'symbol') return undefined
      if (prop === '_path') return path
      if (prop === '_obj') return storeObj
      if (prop === 'value' || prop === 'listeners') return target[prop]
      if (prop === 'isDerived') return target.isDerived || false

      if (prop === 'destroy') {
        return () => {
          if (storeObj._storageBinding) {
            storeObj._storageBinding.unbind()
          }
          if (storeObj._cleanup) {
            storeObj._cleanup()
            storeObj._cleanup = null
          }
        }
      }

      if (prop === 'hydrate') {
        return hydrateOptions => {
          if (path.length > 0) {
            throw new Error('hydrate() must be called on the root store.')
          }
          if (storeObj.isDerived || storeObj.isAsync) {
            throw new Error(
              'hydrate() cannot attach persistence to a derived or async store.',
            )
          }
          if (storeObj._persistenceBackend === 'index') {
            throw new Error(
              'hydrate() cannot attach localStorage/sessionStorage persistence to an IndexedDB store.',
            )
          }
          if (!hydrateOptions || typeof hydrateOptions !== 'object') {
            throw new TypeError(
              "hydrate() requires { storage: 'local' | 'session', key }.",
            )
          }

          const { storage, key, ...options } = hydrateOptions
          if (storage !== 'local' && storage !== 'session') {
            throw new TypeError(
              "hydrate() storage must be either 'local' or 'session'.",
            )
          }
          if (typeof key !== 'string') {
            throw new TypeError('hydrate() key must be a string.')
          }

          hydrateStorageStore(storeObj, storage, key, options)
          return proxy
        }
      }

      if (prop === 'get') {
        return () => {
          if (target.isDerived) {
            const newValue = computeDerivedValue(target, simpleGet)
            // For derived stores, we need to extract the nested value from the computed result
            return path.length > 0 ? getValueAtPath(newValue, path) : newValue
          }
          const state = getState(storeObj)
          return path.length > 0 ?
              getValueAtPath(state.value, path)
            : state.value
        }
      }

      if (prop === 'set') {
        return createStoreSetter(target, path)
      }

      if (prop === 'local') {
        return (key, options) =>
          createStorageStore(
            'local',
            key,
            valueAtPath(storeObj.value, path),
            options,
          )
      }

      if (prop === 'session') {
        return (key, options) =>
          createStorageStore(
            'session',
            key,
            valueAtPath(storeObj.value, path),
            options,
          )
      }

      if (prop === 'index') {
        return (storeName, dbName = 'react-store', options) =>
          createIndexStore(
            storeName,
            dbName,
            valueAtPath(storeObj.value, path),
            options,
          )
      }

      if (prop === 'derive') {
        return (derivedFn, options) => {
          if (derivedFn.constructor?.name === 'AsyncFunction') {
            return createAsyncDeriveStore(
              storeObj,
              proxy,
              derivedFn,
              undefined,
              options,
            )
          }

          // Create a regular derived store that depends on this store
          const derivedStore = store(
            get => derivedFn(get(proxy)),
            options,
          )

          // Set up dependency tracking
          const derivedStoreObj = getState(derivedStore)
          derivedStoreObj.baseStore = proxy
          setupDependencyTracking(storeObj, derivedStoreObj)

          // A plain function returning a promise is async in every way that
          // matters here, and a transpiled async function loses the
          // AsyncFunction constructor name, so the check above can't be trusted
          // on its own. The initial compute already produced the promise —
          // adopt it rather than invoking derivedFn a second time.
          if (isThenable(derivedStoreObj.value)) {
            const initialPromise = derivedStoreObj.value
            derivedStore.destroy()
            return createAsyncDeriveStore(
              storeObj,
              proxy,
              derivedFn,
              initialPromise,
              options,
            )
          }

          return derivedStore
        }
      }

      if (prop === 'async') {
        return asyncFn => {
          if (target.isDerived) {
            return createAsyncDerivedStore(target, asyncFn)
          }

          asyncFn()
            .then(result => {
              const state = getState(storeObj)
              const setStateFn = createSetState(state, path)
              setStateFn(result)
            })
            .catch(error => {
              console.error('Async store operation failed:', error)
              const state = getState(storeObj)
              const setStateFn = createSetState(state, path)
              setStateFn({
                error: true,
                message: error.message || 'An error occurred',
                status: error.status || 'error',
                originalError: error,
              })
            })

          return proxy
        }
      }

      // For derived and async stores, we still need to support nested property access
      // Only return target[prop] for special properties that should be handled directly
      if (
        (target.isDerived || target.isAsync) &&
        (prop === 'value' ||
          prop === 'listeners' ||
          prop === 'isDerived' ||
          prop === 'get' ||
          prop === 'set' ||
          prop === 'local' ||
          prop === 'session' ||
          prop === 'index' ||
          prop === 'derive' ||
          prop === 'async' ||
          prop === 'destroy' ||
          prop === 'hydrate' ||
          prop === '_path' ||
          prop === '_obj')
      ) {
        return target[prop]
      }
      return createStoreProxy(storeObj, [...path, prop])
    },
  })

  pathCache.set(pathKey, proxy)
  return proxy
}

// React hooks
const useSubscribe = store => {
  const state = getState(store)

  return useCallback(
    callback => {
      state.listeners.add(callback)
      return () => state.listeners.delete(callback)
    },
    [state],
  )
}

const useSetState = (storeObj, path) => {
  return useMemo(() => createStoreSetter(storeObj, path), [storeObj, path])
}

// Snapshot readers shared by the value hooks. Without a server snapshot,
// useSyncExternalStore throws outright during server rendering.
const useSnapshots = store => {
  const getSnapshot = useCallback(() => {
    const state = getState(store)
    return valueAtPath(state.value, store._path || [])
  }, [store])

  const getServerSnapshot = useCallback(() => {
    const state = getState(store)
    return valueAtPath(serverValueOf(state), store._path || [])
  }, [store])

  return [getSnapshot, getServerSnapshot]
}

// Main React hook for using stores
export const useStore = store => {
  const subscribe = useSubscribe(store)
  const [getSnapshot, getServerSnapshot] = useSnapshots(store)

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const setValue = useSetState(getState(store), store._path || [])

  return [value, setValue]
}

// Individual hooks for getting just the value or setter
export const useStoreValue = store => {
  const subscribe = useSubscribe(store)
  const [getSnapshot, getServerSnapshot] = useSnapshots(store)

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export const useStoreSetter = store => {
  return useSetState(getState(store), store._path || [])
}

// Utility functions for async state handling
export const isError = data => {
  return data != null && typeof data === 'object' && data.error === true
}

export const isSuccess = data => {
  return data != null && !isError(data) && !isLoading(data)
}

export const isLoading = data => {
  return data != null && typeof data === 'object' && data.loading === true
}

export const getErrorMessage = data => {
  return isError(data) ? data.message : null
}

export const getErrorStatus = data => {
  return isError(data) ? data.status : null
}
