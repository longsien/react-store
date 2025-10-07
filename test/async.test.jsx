import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { store, useStore, useStoreValue, useStoreSetter } from '../src/index.js'

describe('Async Store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should create an async store with initial value', () => {
    const asyncStore = store('initial').async(async () => {
      return 'async result'
    })

    expect(asyncStore.status).toBe('idle')
    expect(asyncStore.data).toBe('initial')
    expect(asyncStore.error).toBe(null)
  })

  it('should execute async function and update state', async () => {
    const asyncStore = store('loading').async(async () => {
      await new Promise(resolve => setTimeout(resolve, 10))
      return 'success'
    })

    // Initially should be idle
    expect(asyncStore.status).toBe('idle')

    // Wait for async execution
    await new Promise(resolve => setTimeout(resolve, 20))

    expect(asyncStore.status).toBe('success')
    expect(asyncStore.data).toBe('success')
    expect(asyncStore.error).toBe(null)
  })

  it('should handle async errors', async () => {
    const error = new Error('Async error')
    const asyncStore = store('loading').async(async () => {
      throw error
    })

    // Wait for async execution
    await new Promise(resolve => setTimeout(resolve, 10))

    expect(asyncStore.status).toBe('error')
    expect(asyncStore.error).toBe(error)
  })

  it('should provide getter function to access other stores', async () => {
    const otherStore = store('test-value')
    const asyncStore = store('loading').async(async get => {
      const value = get(otherStore)
      return `result: ${value}`
    })

    // Wait for async execution
    await new Promise(resolve => setTimeout(resolve, 10))

    expect(asyncStore.status).toBe('success')
    expect(asyncStore.data).toBe('result: test-value')
  })

  it('should allow manual execution', async () => {
    let executionCount = 0
    const asyncStore = store('loading').async(async () => {
      executionCount++
      return `execution-${executionCount}`
    })

    // Wait for initial execution
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(executionCount).toBe(1)

    // Manual execution
    await asyncStore.execute()
    expect(executionCount).toBe(2)
    expect(asyncStore.data).toBe('execution-2')
  })

  it('should allow resetting to initial state', async () => {
    const asyncStore = store('initial').async(async () => {
      return 'success'
    })

    // Wait for async execution
    await new Promise(resolve => setTimeout(resolve, 10))

    expect(asyncStore.status).toBe('success')
    expect(asyncStore.data).toBe('success')

    // Reset
    asyncStore.reset()
    expect(asyncStore.status).toBe('idle')
    expect(asyncStore.data).toBe('initial')
    expect(asyncStore.error).toBe(null)
  })

  it('should work with useStore hook', async () => {
    const asyncStore = store('loading').async(async () => {
      await new Promise(resolve => setTimeout(resolve, 10))
      return 'success'
    })

    const { result } = renderHook(() => useStore(asyncStore))

    // Initially should be idle
    expect(result.current[0].status).toBe('idle')
    expect(result.current[0].data).toBe('loading')

    // Wait for async execution
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20))
    })

    expect(result.current[0].status).toBe('success')
    expect(result.current[0].data).toBe('success')
    expect(result.current[0].error).toBe(null)
  })

  it('should work with useStoreValue hook', async () => {
    const asyncStore = store('loading').async(async () => {
      await new Promise(resolve => setTimeout(resolve, 10))
      return 'success'
    })

    const { result } = renderHook(() => useStoreValue(asyncStore))

    // Initially should be idle
    expect(result.current.status).toBe('idle')
    expect(result.current.data).toBe('loading')

    // Wait for async execution
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20))
    })

    expect(result.current.status).toBe('success')
    expect(result.current.data).toBe('success')
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

    expect(asyncStore.data).toBe('new data')
  })

  it('should prevent concurrent executions', async () => {
    let executionCount = 0
    const asyncStore = store('loading').async(async () => {
      executionCount++
      await new Promise(resolve => setTimeout(resolve, 50))
      return 'success'
    })

    // Start multiple executions
    const promise1 = asyncStore.execute()
    const promise2 = asyncStore.execute()
    const promise3 = asyncStore.execute()

    await Promise.all([promise1, promise2, promise3])

    // Should only execute once due to concurrent execution prevention
    expect(executionCount).toBe(1)
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

    expect(objectStore.status).toBe('success')
    expect(objectStore.data).toEqual({ name: 'John', age: 30 })

    expect(arrayStore.status).toBe('success')
    expect(arrayStore.data).toEqual([1, 2, 3])

    expect(numberStore.status).toBe('success')
    expect(numberStore.data).toBe(42)
  })
})
