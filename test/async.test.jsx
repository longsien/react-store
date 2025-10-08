import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  store,
  useStore,
  useStoreValue,
  useStoreSetter,
  isError,
  isSuccess,
  isLoading,
  getErrorMessage,
  getErrorStatus,
} from '../src/index.js'

describe('Async Store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should create an async store with initial value', () => {
    const asyncStore = store('initial').async(async () => {
      return 'async result'
    })

    // Store should be created and return the proxy
    expect(asyncStore).toBeDefined()
    expect(asyncStore.get).toBeDefined()
    expect(asyncStore.set).toBeDefined()
  })

  it('should execute async function and update state', async () => {
    const asyncStore = store('loading').async(async () => {
      await new Promise(resolve => setTimeout(resolve, 10))
      return 'success'
    })

    // Initially should have the initial value
    expect(asyncStore.get()).toBe('loading')

    // Wait for async execution
    await new Promise(resolve => setTimeout(resolve, 20))

    // Should now have the async result
    expect(asyncStore.get()).toBe('success')
  })

  it('should handle async errors and set error state', async () => {
    const error = new Error('Async error')
    const asyncStore = store('loading').async(async () => {
      throw error
    })

    // Wait for async execution
    await new Promise(resolve => setTimeout(resolve, 10))

    const result = asyncStore.get()
    expect(isError(result)).toBe(true)
    expect(getErrorMessage(result)).toBe('Async error')
    expect(getErrorStatus(result)).toBe('error')
  })

  it('should work with useStore hook', async () => {
    const asyncStore = store('loading').async(async () => {
      await new Promise(resolve => setTimeout(resolve, 10))
      return 'success'
    })

    const { result } = renderHook(() => useStore(asyncStore))

    // Initially should have loading value
    expect(result.current[0]).toBe('loading')

    // Wait for async execution
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20))
    })

    // Should now have the success result
    expect(result.current[0]).toBe('success')
  })

  it('should work with useStoreValue hook', async () => {
    const asyncStore = store('loading').async(async () => {
      await new Promise(resolve => setTimeout(resolve, 10))
      return 'success'
    })

    const { result } = renderHook(() => useStoreValue(asyncStore))

    // Initially should have loading value
    expect(result.current).toBe('loading')

    // Wait for async execution
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20))
    })

    // Should now have the success result
    expect(result.current).toBe('success')
  })

  it('should work with useStoreSetter hook', async () => {
    const asyncStore = store('loading').async(async () => {
      await new Promise(resolve => setTimeout(resolve, 10))
      return 'success'
    })

    const { result } = renderHook(() => useStoreSetter(asyncStore))

    // Wait for async execution
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20))
    })

    // Test setter
    act(() => {
      result.current('new data')
    })

    expect(asyncStore.get()).toBe('new data')
  })

  it('should handle async function that returns different data types', async () => {
    const objectStore = store({}).async(async () => {
      return { name: 'John', age: 30 }
    })

    const arrayStore = store([]).async(async () => {
      return [1, 2, 3]
    })

    const numberStore = store(0).async(async () => {
      return 42
    })

    // Wait for all async executions
    await new Promise(resolve => setTimeout(resolve, 20))

    expect(objectStore.get()).toEqual({ name: 'John', age: 30 })
    expect(arrayStore.get()).toEqual([1, 2, 3])
    expect(numberStore.get()).toBe(42)
  })

  it('should handle network errors properly', async () => {
    const asyncStore = store('loading').async(async () => {
      // Simulate network error
      const error = new Error('Network Error')
      error.status = 'network_error'
      throw error
    })

    // Wait for async execution
    await new Promise(resolve => setTimeout(resolve, 10))

    const result = asyncStore.get()
    expect(isError(result)).toBe(true)
    expect(getErrorMessage(result)).toBe('Network Error')
    expect(getErrorStatus(result)).toBe('network_error')
  })

  it('should handle successful async operations', async () => {
    const asyncStore = store('loading').async(async () => {
      return { name: 'Pikachu', id: 25 }
    })

    // Wait for async execution
    await new Promise(resolve => setTimeout(resolve, 10))

    const result = asyncStore.get()
    expect(isSuccess(result)).toBe(true)
    expect(result.name).toBe('Pikachu')
    expect(result.id).toBe(25)
  })

  it('should handle loading states correctly', async () => {
    const asyncStore = store('initial').async(async () => {
      await new Promise(resolve => setTimeout(resolve, 10))
      return 'success'
    })

    // Wait for async execution to complete
    await new Promise(resolve => setTimeout(resolve, 20))

    // Should no longer be loading
    expect(isLoading(asyncStore.get())).toBe(false)
    expect(asyncStore.get()).toBe('success')
  })

  it('should work with chained methods', async () => {
    // Correct pattern: async first, then local
    const asyncStore = store('loading')
      .async(async () => {
        return 'success'
      })
      .local('test-key')

    // Wait for async execution
    await new Promise(resolve => setTimeout(resolve, 10))

    // The local store should have the initial value, not the async result
    // because the async operation was executed on the original store
    expect(asyncStore.get()).toBe('loading')
  })

  it('should work with local storage first, then async', async () => {
    // Alternative pattern: local first, then async
    const localStore = store('loading').local('test-key')
    const asyncStore = localStore.async(async () => {
      return 'success'
    })

    // Wait for async execution
    await new Promise(resolve => setTimeout(resolve, 10))

    // This should work because async is called on the local store
    expect(asyncStore.get()).toBe('success')
  })

  it('should handle multiple async stores independently', async () => {
    const store1 = store('loading1').async(async () => {
      await new Promise(resolve => setTimeout(resolve, 10))
      return 'result1'
    })

    const store2 = store('loading2').async(async () => {
      await new Promise(resolve => setTimeout(resolve, 5))
      return 'result2'
    })

    // Wait for both to complete
    await new Promise(resolve => setTimeout(resolve, 20))

    expect(store1.get()).toBe('result1')
    expect(store2.get()).toBe('result2')
  })

  describe('async derived stores', () => {
    it('should create async derived store using derive method', async () => {
      const pokemonIdStore = store(1)
      const pokemonDetailsStore = pokemonIdStore.derive(async id => {
        await new Promise(resolve => setTimeout(resolve, 10))
        return { name: `Pokemon ${id}`, id, type: 'electric' }
      })

      // Initially should be loading
      expect(isLoading(pokemonDetailsStore.get())).toBe(true)

      // Wait for async execution
      await new Promise(resolve => setTimeout(resolve, 20))

      // Should now have the result
      const result = pokemonDetailsStore.get()
      expect(isSuccess(result)).toBe(true)
      expect(result.name).toBe('Pokemon 1')
      expect(result.id).toBe(1)
      expect(result.type).toBe('electric')
    })

    it('should handle async derived store errors', async () => {
      const pokemonIdStore = store(1)
      const pokemonDetailsStore = pokemonIdStore.derive(async id => {
        await new Promise(resolve => setTimeout(resolve, 10))
        throw new Error('Pokemon not found')
      })

      // Wait for async execution
      await new Promise(resolve => setTimeout(resolve, 20))

      const result = pokemonDetailsStore.get()
      expect(isError(result)).toBe(true)
      expect(getErrorMessage(result)).toBe('Pokemon not found')
    })

    it('should update async derived store when dependency changes', async () => {
      const pokemonIdStore = store(1)
      const pokemonDetailsStore = pokemonIdStore.derive(async id => {
        await new Promise(resolve => setTimeout(resolve, 10))
        return { name: `Pokemon ${id}`, id }
      })

      // Wait for initial load
      await new Promise(resolve => setTimeout(resolve, 20))
      expect(pokemonDetailsStore.get().name).toBe('Pokemon 1')

      // Change the ID
      pokemonIdStore.set(2)

      // Should be loading again
      expect(isLoading(pokemonDetailsStore.get())).toBe(true)

      // Wait for new async execution
      await new Promise(resolve => setTimeout(resolve, 20))

      // Should have new result
      const result = pokemonDetailsStore.get()
      expect(isSuccess(result)).toBe(true)
      expect(result.name).toBe('Pokemon 2')
      expect(result.id).toBe(2)
    })

    it('should work with React hooks for async derived stores', async () => {
      const pokemonIdStore = store(1)
      const pokemonDetailsStore = pokemonIdStore.derive(async id => {
        await new Promise(resolve => setTimeout(resolve, 10))
        return { name: `Pokemon ${id}`, id }
      })

      const { result } = renderHook(() => useStore(pokemonDetailsStore))

      // Initially should be loading
      expect(isLoading(result.current[0])).toBe(true)

      // Wait for async execution
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 20))
      })

      // Should now have the result
      expect(isSuccess(result.current[0])).toBe(true)
      expect(result.current[0].name).toBe('Pokemon 1')
    })

    it('should handle network-like errors in async derived stores', async () => {
      const pokemonIdStore = store(1)
      const pokemonDetailsStore = pokemonIdStore.derive(async id => {
        await new Promise(resolve => setTimeout(resolve, 10))
        const error = new Error('Network Error')
        error.status = 404
        throw error
      })

      // Wait for async execution
      await new Promise(resolve => setTimeout(resolve, 20))

      const result = pokemonDetailsStore.get()
      expect(isError(result)).toBe(true)
      expect(getErrorMessage(result)).toBe('Network Error')
      expect(getErrorStatus(result)).toBe(404)
    })

    it('should handle chained async derived stores', async () => {
      const pokemonIdStore = store(1)
      const pokemonDetailsStore = pokemonIdStore.derive(async id => {
        await new Promise(resolve => setTimeout(resolve, 10))
        return { name: `Pokemon ${id}`, id }
      })

      const pokemonSummaryStore = pokemonDetailsStore.derive(pokemon => ({
        summary: `${pokemon.name} (ID: ${pokemon.id})`,
      }))

      // Wait for async execution
      await new Promise(resolve => setTimeout(resolve, 20))

      const result = pokemonSummaryStore.get()
      expect(result.summary).toBe('Pokemon 1 (ID: 1)')
    })
  })
})
