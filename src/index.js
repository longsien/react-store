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

      // Parse the new value from storage
      let newValue
      try {
        if (event.newValue === null) {
          // If the key was removed, fall back to initial value
          newValue = initialValue
        } else {
          newValue = JSON.parse(event.newValue)
        }
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
        isUpdatingFromStorage = false
      }
    }

    window.addEventListener('storage', handleStorageChange)
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
  newObj[key] = setValueAtPath(obj?.[key] || {}, remaining, value)
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
    if (oldValue.length !== newValue.length) {
      return newValue
    }
    let hasChanges = false
    const preserved = newValue.map((item, index) => {
      const preservedItem = preserveReferences(oldValue[index], item)
      if (preservedItem !== oldValue[index]) hasChanges = true
      return preservedItem
    })
    // If nothing changed, return old array to preserve reference
    return hasChanges ? preserved : oldValue
  }

  // For objects, preserve references for unchanged properties
  const oldKeys = Object.keys(oldValue)
  const newKeys = Object.keys(newValue)
  const allKeys = new Set([...oldKeys, ...newKeys])

  // Check if structure changed (keys added/removed)
  const structureChanged = oldKeys.length !== newKeys.length

  let hasChanges = false
  const preserved = {}
  for (const key of allKeys) {
    if (!(key in newValue)) {
      // Key was removed
      hasChanges = true
      continue
    }
    if (!(key in oldValue)) {
      // Key was added
      preserved[key] = newValue[key]
      hasChanges = true
      continue
    }
    // Key exists in both - preserve reference if unchanged
    const preservedValue = preserveReferences(oldValue[key], newValue[key])
    preserved[key] = preservedValue
    if (preservedValue !== oldValue[key]) {
      hasChanges = true
    }
  }

  // If structure changed or values changed, return new object (but with preserved nested references)
  // If nothing changed at all, return old object to preserve root reference
  if (structureChanged || hasChanges) {
    return preserved
  }
  return oldValue
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
            const simpleGet = createSimpleGet()
            derivedStoreObj.getter(simpleGet)
          } else {
            const simpleGet = createSimpleGet()
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

  return createStoreProxy(storeObj)
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

  // Start the initial async operation
  const initialInputValue = target.getter(createSimpleGet())
  asyncStoreObj.lastInputValue = initialInputValue
  runAsyncOperation(initialInputValue)

  return createStoreProxy(asyncStoreObj)
}

// Create a simple get function for store access
const createSimpleGet = () => store => {
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
})

// Create async operation runner
const createAsyncOperationRunner = (asyncStoreObj, derivedFn) => {
  return inputValue => {
    if (asyncStoreObj.isRunning) return

    asyncStoreObj.isRunning = true
    asyncStoreObj.value = { loading: true }
    asyncStoreObj.listeners.forEach(listener => listener())

    derivedFn(inputValue)
      .then(result => {
        asyncStoreObj.value = result
        asyncStoreObj.lastComputedValue = result
        asyncStoreObj.isRunning = false
        asyncStoreObj.listeners.forEach(listener => listener())
        notifyDependentStores(asyncStoreObj, createSimpleGet())
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
        notifyDependentStores(asyncStoreObj, createSimpleGet())
      })
  }
}

// Notify dependent derived stores of a store update
function notifyDependentStores(storeObj, get) {
  if (dependencyMap.has(storeObj)) {
    dependencyMap.get(storeObj).forEach(dependentStore => {
      if (derivedStoreMap.has(dependentStore)) {
        const dependentStoreObj = derivedStoreMap.get(dependentStore)
        // Only notify non-async derived stores to avoid circular dependencies
        if (!dependentStoreObj.isAsync) {
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

      // Notify other derived stores that depend on this one
      const simpleGet = store => {
        const storeObj = getState(store)
        return storeObj.value
      }
      notifyDependentStores(derivedStoreObj, simpleGet)
    }

    return newValue
  } catch (error) {
    console.error('Error computing derived store value:', error)
    return derivedStoreObj.lastComputedValue
  }
}

// Create store proxy with nested property access
function createStoreProxy(storeObj, path = []) {
  const pathKey = path.join('.')

  let pathCache = proxyCache.get(storeObj)
  if (!pathCache) {
    pathCache = new Map()
    proxyCache.set(storeObj, pathCache)
  }

  if (pathCache.has(pathKey)) {
    return pathCache.get(pathKey)
  }

  const proxy = new Proxy(storeObj, {
    get(target, prop) {
      if (prop === '_path') return path
      if (prop === '_obj') return storeObj
      if (prop === 'value' || prop === 'listeners') return target[prop]
      if (prop === 'isDerived') return target.isDerived || false

      if (prop === 'get') {
        return () => {
          if (target.isDerived) {
            const newValue = computeDerivedValue(target, store => {
              const storeObj = getState(store)
              return storeObj.value
            })
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

      if (prop === 'derive') {
        return derivedFn => {
          // Check if the derived function is async by testing it
          const testGet = store => {
            const storeObj = getState(store)
            return storeObj.value
          }

          let testValue
          try {
            testValue = derivedFn(testGet(proxy))
          } catch (error) {
            // If synchronous error, it's not async - create regular derived store
            // Create a regular derived store that depends on this store
            const derivedStore = store(get => {
              const currentValue = get(proxy)
              return derivedFn(currentValue)
            })

            // Set up dependency tracking
            const derivedStoreObj = getState(derivedStore)
            derivedStoreObj.baseStore = proxy // Store reference to the base store
            setupDependencyTracking(storeObj, derivedStoreObj)

            return derivedStore
          }

          // If the derived function returns a Promise, create async store directly
          if (testValue instanceof Promise) {
            // Catch any promise rejections from the test call to prevent unhandled rejections
            testValue.catch(() => {
              // Ignore test promise rejections - they'll be handled by the actual async store
            })

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
          derivedStoreObj.baseStore = proxy // Store reference to the base store
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
          prop === 'derive' ||
          prop === 'async' ||
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
  return useMemo(() => {
    return nextValueOrUpdater => {
      const setStateFn = createSetState(state, path)
      setStateFn(nextValueOrUpdater)
    }
  }, [state, path])
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
  return typeof data === 'object' && data.error === true
}

export const isSuccess = data => {
  return data && !isError(data) && !isLoading(data)
}

export const isLoading = data => {
  return typeof data === 'object' && data.loading === true
}

export const getErrorMessage = data => {
  return isError(data) ? data.message : null
}

export const getErrorStatus = data => {
  return isError(data) ? data.status : null
}
