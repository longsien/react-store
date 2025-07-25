import { useCallback, useMemo, useSyncExternalStore } from 'react'

// Create store with initial value
export const store = initialValue => {
  const storeObj = { value: initialValue, listeners: new Set() }
  stateMap.set(storeObj, storeObj)
  return createStoreProxy(storeObj)
}

// Base function to create storage-backed stores
const createStorageStore = (storageType, key, initialValue) => {
  const storage = storageType === 'local' ? localStorage : sessionStorage

  // Get from storage or use initial value
  const getStoredValue = () => {
    try {
      const item = storage.getItem(key)
      return item ? JSON.parse(item) : initialValue
    } catch {
      return initialValue
    }
  }

  const storeObj = { value: getStoredValue(), listeners: new Set() }
  stateMap.set(storeObj, storeObj)
  const storeProxy = createStoreProxy(storeObj)

  // Subscribe to changes and save to storage
  let saveTimeout
  storeObj.listeners.add(() => {
    // Cancel previous scheduled save
    clearTimeout(saveTimeout)

    // Schedule new save for next frame
    saveTimeout = setTimeout(() => {
      try {
        const stringifiedValue = JSON.stringify(storeObj.value)
        storage.setItem(key, stringifiedValue) // Only happens once per frame
      } catch (error) {
        console.error(`Failed to save to storage with key "${key}":`, error)
      }
    }, 16) // ~60fps debounce
  })

  return storeProxy
}

// Create a proxy that tracks the path to a nested value
const proxyCache = new WeakMap()

function createStoreProxy(storeObj, path = []) {
  const pathKey = path.join('.')

  // Check if proxy for this path exists
  let pathCache = proxyCache.get(storeObj)
  if (!pathCache) {
    pathCache = new Map()
    proxyCache.set(storeObj, pathCache)
  }

  // Return cached proxy if it exists
  if (pathCache.has(pathKey)) {
    return pathCache.get(pathKey)
  }

  const proxy = new Proxy(storeObj, {
    get(target, prop) {
      if (prop === '_path') return path
      if (prop === '_obj') return storeObj
      if (prop === 'value' || prop === 'listeners') return target[prop]

      // Built-in getter method
      if (prop === 'get') {
        return () => {
          const state = getState(storeObj)
          return path.length > 0
            ? getValueAtPath(state.value, path)
            : state.value
        }
      }

      // Built-in setter method
      if (prop === 'set') {
        return data => {
          const state = getState(storeObj)
          const setStateFn = createSetState(state, path)
          setStateFn(data)
        }
      }

      // Chainable local storage method
      if (prop === 'local') {
        return key => {
          // Only allow on root store (no path)
          if (path.length > 0) {
            throw new Error('Storage methods can only be called on root store')
          }
          return createStorageStore('local', key, storeObj.value)
        }
      }

      // Chainable session storage method
      if (prop === 'session') {
        return key => {
          // Only allow on root store (no path)
          if (path.length > 0) {
            throw new Error('Storage methods can only be called on root store')
          }
          return createStorageStore('session', key, storeObj.value)
        }
      }

      // Create a nested proxy for property access
      return createStoreProxy(storeObj, [...path, prop])
    },
  })

  // Cache the proxy before returning
  pathCache.set(pathKey, proxy)
  return proxy
}

// WeakMap to track store states
const stateMap = new WeakMap()

// Get store state
const getState = store => {
  return stateMap.get(store._obj) || stateMap.get(store)
}

// Get value from nested path
const getValueAtPath = (obj, path) => {
  return path.reduce((acc, key) => {
    return acc && typeof acc === 'object' ? acc[key] : undefined
  }, obj)
}

// Set value at nested path immutably
const setValueAtPath = (obj, path, value) => {
  if (!path.length) return value

  const newObj = Array.isArray(obj) ? [...obj] : { ...obj }

  if (path.length === 1) {
    newObj[path[0]] = value
    return newObj
  }

  const [key, ...remaining] = path
  newObj[key] = setValueAtPath(obj?.[key] || {}, remaining, value)
  return newObj
}

// Subscribe hook
const useSubscribe = store => {
  const state = getState(store)

  return useCallback(
    callback => {
      state.listeners.add(callback)
      return () => state.listeners.delete(callback)
    },
    [state]
  )
}

// Create setState function
const createSetState = (state, path) => {
  return nextValueOrUpdater => {
    const currentValue =
      path.length === 0 ? state.value : getValueAtPath(state.value, path)

    const nextValue =
      typeof nextValueOrUpdater === 'function'
        ? nextValueOrUpdater(currentValue)
        : nextValueOrUpdater

    if (Object.is(nextValue, currentValue)) return

    if (path.length === 0) {
      state.value = nextValue
    } else {
      state.value = setValueAtPath(state.value, path, nextValue)
    }

    state.listeners.forEach(listener => listener())
  }
}

// setState hook
const useSetState = (state, path) => {
  return useMemo(() => {
    return nextValueOrUpdater => {
      const setStateFn = createSetState(state, path)
      setStateFn(nextValueOrUpdater)
    }
  }, [state, path]) // Only recreate if state or path actually changes
}

// Main hook - returns [value, setState]
export const useStore = store => {
  const storeObj = store._obj
  const path = store._path
  const state = getState(storeObj)
  const setState = useSetState(state, path)
  const subscribe = useSubscribe(storeObj)

  const value = useSyncExternalStore(subscribe, () =>
    path.length > 0 ? getValueAtPath(state.value, path) : state.value
  )

  return [value, setState]
}

// Value-only hook
export const useStoreValue = store => {
  const storeObj = store._obj
  const path = store._path
  const state = getState(storeObj)
  const subscribe = useSubscribe(storeObj)

  return useSyncExternalStore(subscribe, () =>
    path.length > 0 ? getValueAtPath(state.value, path) : state.value
  )
}

// Setter-only hook
export const useStoreSetter = store => {
  const state = getState(store._obj)
  return useSetState(state, store._path)
}

// Legacy methods
// TODO: Remove in v2

// Legacy non-hook getter (kept for backward compatibility)
export const getStore = store => {
  const storeObj = store._obj
  const path = store._path
  const state = getState(storeObj)

  return path.length > 0 ? getValueAtPath(state.value, path) : state.value
}

// Legacy non-hook setter (kept for backward compatibility)
export const setStore = (store, data) => {
  const state = getState(store._obj)
  const setStateFn = createSetState(state, store._path)
  setStateFn(data)
}

// Legacy create store with session storage
export const storeSession = (key, initialValue) => {
  return createStorageStore('session', key, initialValue)
}

// Legacy create store with local storage
export const storeLocal = (key, initialValue) => {
  return createStorageStore('local', key, initialValue)
}
