import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { circularDeepEqual } from 'fast-equals'

// WeakMaps for state management and derived store tracking
const stateMap = new WeakMap()
const proxyCache = new WeakMap()
const dependencyMap = new WeakMap()
const derivedStoreMap = new WeakMap()

// Main store creation function
export const store = initialValue => {
  if (typeof initialValue === 'function') {
    return createDerivedStore(initialValue)
  }

  const storeObj = { value: initialValue, listeners: new Set() }
  stateMap.set(storeObj, storeObj)
  return createStoreProxy(storeObj)
}

// Create storage-backed stores (localStorage/sessionStorage)
const createStorageStore = (storageType, key, initialValue) => {
  const storage = storageType === 'local' ? localStorage : sessionStorage

  // Ensure storage APIs are available
  if (
    !storage ||
    typeof storage.getItem !== 'function' ||
    typeof storage.setItem !== 'function'
  ) {
    throw new Error(
      `${storageType}Storage is not available. Make sure you're running in an environment that supports storage APIs (e.g., browser).`,
    )
  }

  // Check if key exists in storage (regardless of its value)
  const storedItem = storage.getItem(key)
  const keyExists = storedItem !== null

  const getStoredValue = () => {
    try {
      if (keyExists) {
        // If key exists, parse and return the stored value (even if it's null)
        return JSON.parse(storedItem)
      }
      // Only use initialValue if key doesn't exist
      return initialValue
    } catch {
      return initialValue
    }
  }

  const storeObj = { value: getStoredValue(), listeners: new Set() }
  stateMap.set(storeObj, storeObj)
  const storeProxy = createStoreProxy(storeObj)

  // If key didn't exist, save the initial value to storage
  if (!keyExists) {
    try {
      const stringifiedValue = JSON.stringify(storeObj.value)
      storage.setItem(key, stringifiedValue)
    } catch (error) {
      console.error(
        `Failed to save initial value to storage with key "${key}":`,
        error,
      )
    }
  }

  // Track if we're currently updating from storage to prevent circular updates
  let isUpdatingFromStorage = false

  let saveTimeout
  storeObj.listeners.add(() => {
    // Don't save to storage if we're updating from a storage event
    if (isUpdatingFromStorage) return

    clearTimeout(saveTimeout)
    saveTimeout = setTimeout(() => {
      try {
        const stringifiedValue = JSON.stringify(storeObj.value)
        storage.setItem(key, stringifiedValue)
      } catch (error) {
        console.error(`Failed to save to storage with key "${key}":`, error)
      }
    }, 0)
  })

  // Listen for storage changes from other tabs/windows (localStorage)
  if (
    storageType === 'local' &&
    typeof window !== 'undefined' &&
    window.addEventListener
  ) {
    const handleStorageChange = event => {
      // Only handle events for key
      if (event.key !== key) return

      // Verify the storage area matches localStorage
      if (event.storageArea && event.storageArea !== localStorage) {
        return
      }

      // Key removed: keep in-memory state
      if (event.newValue === null) return

      // Parse the new value from storage
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

      // Only update if the value has actually changed
      if (!circularDeepEqual(newValue, storeObj.value)) {
        isUpdatingFromStorage = true
        // Preserve object references for unchanged nested paths to prevent
        // unnecessary re-renders for components listening to nested properties
        storeObj.value = preserveReferences(storeObj.value, newValue)
        storeObj.listeners.forEach(listener => listener())

        // Notify derived stores that depend on this store
        if (dependencyMap.has(storeObj)) {
          dependencyMap.get(storeObj).forEach(derivedStore => {
            if (derivedStoreMap.has(derivedStore)) {
              const derivedStoreObj = derivedStoreMap.get(derivedStore)

              // Handle async derived stores differently
              if (derivedStoreObj.isAsync) {
                derivedStoreObj.getter(simpleGet)
              } else {
                computeDerivedValue(derivedStoreObj, simpleGet)
              }
            }
          })
        }

        isUpdatingFromStorage = false
      }
    }

    window.addEventListener('storage', handleStorageChange)

    storeObj._cleanup = () => {
      window.removeEventListener('storage', handleStorageChange)
      clearTimeout(saveTimeout)
    }
  } else {
    storeObj._cleanup = () => {
      clearTimeout(saveTimeout)
    }
  }

  return storeProxy
}

const INDEX_DB_STORE_KEY = 'value'

const openDB = (dbName, storeName) => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName)

    request.onupgradeneeded = event => {
      const db = event.target.result
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName)
      }
    }

    request.onerror = () => reject(request.error)

    request.onsuccess = () => {
      const db = request.result
      if (db.objectStoreNames.contains(storeName)) {
        resolve(db)
      } else {
        const newVersion = db.version + 1
        db.close()
        const upgradeRequest = indexedDB.open(dbName, newVersion)
        upgradeRequest.onupgradeneeded = event => {
          event.target.result.createObjectStore(storeName)
        }
        upgradeRequest.onerror = () => reject(upgradeRequest.error)
        upgradeRequest.onsuccess = () => resolve(upgradeRequest.result)
      }
    }
  })
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

const createIndexStore = (storeName, dbName, initialValue) => {
  if (typeof indexedDB === 'undefined') {
    throw new Error(
      "IndexedDB is not available. Make sure you're running in an environment that supports IndexedDB (e.g., browser).",
    )
  }

  const storeObj = { value: initialValue, listeners: new Set() }
  stateMap.set(storeObj, storeObj)
  const storeProxy = createStoreProxy(storeObj)

  let db = null
  let saveTimeout

  storeObj.listeners.add(() => {
    if (!db) return
    clearTimeout(saveTimeout)
    saveTimeout = setTimeout(() => {
      idbPut(db, storeName, storeObj.value).catch(error => {
        console.error(
          `Failed to save to IndexedDB store "${storeName}":`,
          error,
        )
      })
    }, 0)
  })

  openDB(dbName, storeName)
    .then(database => {
      db = database
      return idbGet(database, storeName)
    })
    .then(existingValue => {
      if (existingValue !== undefined) {
        if (!circularDeepEqual(existingValue, storeObj.value)) {
          storeObj.value = preserveReferences(storeObj.value, existingValue)
          storeObj.listeners.forEach(listener => listener())
        }
      } else {
        idbPut(db, storeName, storeObj.value).catch(error => {
          console.error(
            `Failed to save initial value to IndexedDB store "${storeName}":`,
            error,
          )
        })
      }
    })
    .catch(error => {
      console.error(
        `Failed to initialize IndexedDB store "${storeName}":`,
        error,
      )
    })

  storeObj._cleanup = () => {
    clearTimeout(saveTimeout)
    if (db) {
      db.close()
      db = null
    }
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

const setValueAtPath = (obj, path, value) => {
  if (!obj || typeof obj !== 'object') return value

  const newObj = Array.isArray(obj) ? [...obj] : { ...obj }

  if (path.length === 1) {
    newObj[path[0]] = value
    return newObj
  }

  const [key, ...remaining] = path
  // When the intermediate value is missing, create an array if the next path
  // segment is a numeric index, otherwise an object.
  const existing = obj[key]
  const child =
    existing == null ?
      /^\d+$/.test(String(remaining[0])) ?
        []
      : {}
    : existing
  newObj[key] = setValueAtPath(child, remaining, value)
  return newObj
}

// Preserve object references when nested values haven't changed
// This prevents unnecessary re-renders for components listening to nested paths
const preserveReferences = (oldValue, newValue) => {
  // If values are equal by reference, return old value
  if (oldValue === newValue) return oldValue

  // If either is null/undefined or not an object, return new value
  if (
    oldValue == null ||
    newValue == null ||
    typeof oldValue !== 'object' ||
    typeof newValue !== 'object'
  ) {
    return newValue
  }

  // If types don't match, return new value
  if (Array.isArray(oldValue) !== Array.isArray(newValue)) {
    return newValue
  }

  // For arrays, preserve references for unchanged items
  if (Array.isArray(newValue)) {
    const minLength = Math.min(oldValue.length, newValue.length)
    let hasChanges = oldValue.length !== newValue.length
    const preserved = newValue.map((item, index) => {
      if (index < minLength) {
        const preservedItem = preserveReferences(oldValue[index], item)
        if (preservedItem !== oldValue[index]) hasChanges = true
        return preservedItem
      }
      return item
    })
    return hasChanges ? preserved : oldValue
  }

  // For objects, preserve references for unchanged properties
  const newKeys = Object.keys(newValue)

  let hasChanges = false
  const preserved = {}
  for (const key of newKeys) {
    if (key in oldValue) {
      const preservedValue = preserveReferences(oldValue[key], newValue[key])
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

// Create setState function
const createSetState = (state, path) => {
  return nextValueOrUpdater => {
    const currentValue =
      path.length === 0 ? state.value : getValueAtPath(state.value, path)

    const nextValue =
      typeof nextValueOrUpdater === 'function' ?
        nextValueOrUpdater(currentValue)
      : nextValueOrUpdater

    if (circularDeepEqual(nextValue, currentValue)) return

    if (path.length === 0) {
      state.value = nextValue
    } else {
      state.value = setValueAtPath(state.value, path, nextValue)
    }

    state.listeners.forEach(listener => listener())

    // Notify derived stores that depend on this store
    if (dependencyMap.has(state)) {
      dependencyMap.get(state).forEach(derivedStore => {
        if (derivedStoreMap.has(derivedStore)) {
          const derivedStoreObj = derivedStoreMap.get(derivedStore)

          // Handle async derived stores differently
          if (derivedStoreObj.isAsync) {
            // For async derived stores, trigger the getter to check for changes
            derivedStoreObj.getter(simpleGet)
          } else {
            computeDerivedValue(derivedStoreObj, simpleGet)
          }
        }
      })
    }
  }
}

// Create derived store from getter function
const createDerivedStore = getter => {
  const storeObj = {
    value: undefined,
    listeners: new Set(),
    isDerived: true,
    getter,
    dependencies: new Set(),
    lastComputedValue: undefined,
    baseStore: null, // Store reference to the base store proxy
  }

  stateMap.set(storeObj, storeObj)
  derivedStoreMap.set(storeObj, storeObj)

  const get = store => {
    const targetStoreObj = getState(store)
    if (!targetStoreObj) {
      throw new Error('Store not found')
    }

    storeObj.dependencies.add(targetStoreObj)

    if (!dependencyMap.has(targetStoreObj)) {
      dependencyMap.set(targetStoreObj, new Set())
    }
    dependencyMap.get(targetStoreObj).add(storeObj)

    return targetStoreObj.value
  }

  const computeValue = () => {
    try {
      // Remove stale dependency reverse-mappings before rebuilding
      for (const dep of storeObj.dependencies) {
        const depSet = dependencyMap.get(dep)
        if (depSet) {
          depSet.delete(storeObj)
          if (depSet.size === 0) dependencyMap.delete(dep)
        }
      }
      storeObj.dependencies.clear()
      const newValue = getter(get)
      storeObj.lastComputedValue = newValue
      return newValue
    } catch (error) {
      console.error('Error computing derived store value:', error)
      return storeObj.lastComputedValue
    }
  }

  storeObj.value = computeValue()

  // Unregister this derived store from its dependencies' reverse-mappings
  // so it can be garbage collected once destroyed.
  storeObj._cleanup = () => {
    for (const dep of storeObj.dependencies) {
      const depSet = dependencyMap.get(dep)
      if (depSet) {
        depSet.delete(storeObj)
        if (depSet.size === 0) dependencyMap.delete(dep)
      }
    }
    storeObj.dependencies.clear()
  }

  return createStoreProxy(storeObj)
}

// Remove an async/derived store from a single source's reverse-mapping
const unregisterDependent = (sourceStoreObj, dependentStoreObj) => {
  const depSet = dependencyMap.get(sourceStoreObj)
  if (depSet) {
    depSet.delete(dependentStoreObj)
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

    if (!circularDeepEqual(currentInputValue, asyncStoreObj.lastInputValue)) {
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

// Shared get function for store access (stateless, no allocation needed)
const simpleGet = store => {
  const storeObj = getState(store)
  return storeObj.value
}

// Set up dependency tracking between stores
const setupDependencyTracking = (sourceStore, targetStore) => {
  if (!dependencyMap.has(sourceStore)) {
    dependencyMap.set(sourceStore, new Set())
  }
  dependencyMap.get(sourceStore).add(targetStore)
}

// Create an async store object with common properties
const createAsyncStoreObject = asyncFn => ({
  value: { loading: true },
  listeners: new Set(),
  isDerived: true,
  isAsync: true,
  getter: get => ({ loading: true }),
  dependencies: new Set(),
  lastComputedValue: undefined,
  asyncFn,
  isRunning: false,
  lastInputValue: undefined,
  pendingInputValue: undefined,
})

// Create async operation runner
const createAsyncOperationRunner = (asyncStoreObj, derivedFn) => {
  const run = inputValue => {
    asyncStoreObj.isRunning = true
    asyncStoreObj.value = { loading: true }
    asyncStoreObj.listeners.forEach(listener => listener())

    derivedFn(inputValue)
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
    if (asyncStoreObj.pendingInputValue !== undefined) {
      const pending = asyncStoreObj.pendingInputValue
      asyncStoreObj.pendingInputValue = undefined
      if (!circularDeepEqual(pending, asyncStoreObj.lastInputValue)) {
        asyncStoreObj.lastInputValue = pending
        run(pending)
      }
    }
  }

  return inputValue => {
    if (asyncStoreObj.isRunning) {
      asyncStoreObj.pendingInputValue = inputValue
      return
    }
    run(inputValue)
  }
}

// Notify dependent derived stores of a store update
function notifyDependentStores(storeObj, get) {
  if (dependencyMap.has(storeObj)) {
    dependencyMap.get(storeObj).forEach(dependentStore => {
      if (derivedStoreMap.has(dependentStore)) {
        const dependentStoreObj = derivedStoreMap.get(dependentStore)
        if (dependentStoreObj.isAsync) {
          // Re-run the async getter; it no-ops unless its input changed,
          // so this is safe against cycles and propagates async-of-async chains.
          dependentStoreObj.getter(simpleGet)
        } else {
          computeDerivedValue(dependentStoreObj, get)
        }
      }
    })
  }
}

// Compute derived store value and handle dependency updates
function computeDerivedValue(derivedStoreObj, get) {
  try {
    const newValue = derivedStoreObj.getter(get)

    if (!circularDeepEqual(newValue, derivedStoreObj.lastComputedValue)) {
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
  const pathKey = path.join('.')

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
          if (storeObj._cleanup) {
            storeObj._cleanup()
            storeObj._cleanup = null
          }
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
        return data => {
          if (target.isDerived) {
            // For derived stores, we need to find the base store and update it
            // We need to update the base store that this derived store depends on
            const baseStore = findBaseStore(target)
            if (baseStore) {
              const baseState = getState(baseStore)
              const setStateFn = createSetState(baseState, path)
              setStateFn(data)
            } else {
              throw new Error(
                'Cannot set value on derived store. Derived stores are read-only.',
              )
            }
          } else {
            const state = getState(storeObj)
            const setStateFn = createSetState(state, path)
            setStateFn(data)
          }
        }
      }

      if (prop === 'local') {
        return key => {
          const currentValue =
            path.length > 0 ?
              getValueAtPath(storeObj.value, path)
            : storeObj.value
          return createStorageStore('local', key, currentValue)
        }
      }

      if (prop === 'session') {
        return key => {
          const currentValue =
            path.length > 0 ?
              getValueAtPath(storeObj.value, path)
            : storeObj.value
          return createStorageStore('session', key, currentValue)
        }
      }

      if (prop === 'index') {
        return (storeName, dbName = 'react-store') => {
          const currentValue =
            path.length > 0 ?
              getValueAtPath(storeObj.value, path)
            : storeObj.value
          return createIndexStore(storeName, dbName, currentValue)
        }
      }

      if (prop === 'derive') {
        return derivedFn => {
          const isAsync = derivedFn.constructor?.name === 'AsyncFunction'

          if (isAsync) {
            const asyncStoreObj = createAsyncStoreObject(derivedFn)
            const runAsyncOperation = createAsyncOperationRunner(
              asyncStoreObj,
              derivedFn,
            )

            stateMap.set(asyncStoreObj, asyncStoreObj)
            derivedStoreMap.set(asyncStoreObj, asyncStoreObj)

            // Override the getter to re-run async operation when dependencies change
            asyncStoreObj.getter = get => {
              const currentInputValue = get(proxy)

              if (
                !circularDeepEqual(
                  currentInputValue,
                  asyncStoreObj.lastInputValue,
                )
              ) {
                asyncStoreObj.lastInputValue = currentInputValue
                runAsyncOperation(currentInputValue)
              }

              return asyncStoreObj.value
            }

            // Set up dependency tracking
            setupDependencyTracking(storeObj, asyncStoreObj)

            asyncStoreObj._cleanup = () =>
              unregisterDependent(storeObj, asyncStoreObj)

            // Start the initial async operation
            const initialInputValue = getState(proxy).value
            asyncStoreObj.lastInputValue = initialInputValue
            runAsyncOperation(initialInputValue)

            return createStoreProxy(asyncStoreObj)
          }

          // Create a regular derived store that depends on this store
          const derivedStore = store(get => {
            const currentValue = get(proxy)
            return derivedFn(currentValue)
          })

          // Set up dependency tracking
          const derivedStoreObj = getState(derivedStore)
          derivedStoreObj.baseStore = proxy
          setupDependencyTracking(storeObj, derivedStoreObj)

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

const useSetState = (state, path) => {
  return useMemo(() => createSetState(state, path), [state, path])
}

// Main React hook for using stores
export const useStore = store => {
  const subscribe = useSubscribe(store)
  const getSnapshot = useCallback(() => {
    const state = getState(store)
    const path = store._path || []
    return path.length > 0 ? getValueAtPath(state.value, path) : state.value
  }, [store])

  const value = useSyncExternalStore(subscribe, getSnapshot)
  const setValue = useSetState(getState(store), store._path || [])

  return [value, setValue]
}

// Individual hooks for getting just the value or setter
export const useStoreValue = store => {
  const subscribe = useSubscribe(store)
  const getSnapshot = useCallback(() => {
    const state = getState(store)
    const path = store._path || []
    return path.length > 0 ? getValueAtPath(state.value, path) : state.value
  }, [store])

  return useSyncExternalStore(subscribe, getSnapshot)
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
