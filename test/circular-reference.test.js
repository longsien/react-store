import { describe, it, expect } from 'vitest'
import { store } from '../src/index'

describe('Store with Circular References', () => {
  it('should handle objects with circular references without infinite loops', () => {
    // Create an object with circular reference
    const obj = { name: 'test', data: {} }
    obj.self = obj
    obj.data.parent = obj

    const myStore = store(obj)

    // Should not throw or hang when getting
    expect(() => myStore.get()).not.toThrow()
    const value = myStore.get()
    expect(value.name).toBe('test')
    expect(value.self).toBe(value)
    expect(value.data.parent).toBe(value)

    // Should not throw or hang when setting the same object
    expect(() => myStore.set(obj)).not.toThrow()

    // Should not throw or hang when setting a different object with circular ref
    const obj2 = { name: 'test', data: {} }
    obj2.self = obj2
    obj2.data.parent = obj2
    expect(() => myStore.set(obj2)).not.toThrow()
  })

  it('should handle arrays with circular references', () => {
    const arr = [{ name: 'item' }]
    arr[0].parent = arr

    const myStore = store(arr)

    expect(() => myStore.get()).not.toThrow()
    const value = myStore.get()
    expect(value[0].name).toBe('item')
    expect(value[0].parent).toBe(value)
  })

  it('should update store with circular references correctly', () => {
    const obj1 = { count: 1, self: null }
    obj1.self = obj1

    const myStore = store(obj1)

    // Update the count
    myStore.set(prev => {
      prev.count = 2
      return prev
    })

    const value = myStore.get()
    expect(value.count).toBe(2)
    expect(value.self).toBe(value)
  })
})
