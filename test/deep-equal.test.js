import { describe, it, expect } from 'vitest'
import deepEqual from '../src/utilities/deep-equal.js'

describe('deepEqual', () => {
  it('should handle circular references without infinite loops', () => {
    // Create objects with circular references
    const obj1 = { name: 'test', data: {} }
    obj1.self = obj1
    obj1.data.parent = obj1

    const obj2 = { name: 'test', data: {} }
    obj2.self = obj2
    obj2.data.parent = obj2

    // Should not throw or hang
    expect(() => deepEqual(obj1, obj2)).not.toThrow()
    expect(deepEqual(obj1, obj2)).toBe(true)
  })

  it('should detect different objects with circular references', () => {
    const obj1 = { name: 'test1', self: null }
    obj1.self = obj1

    const obj2 = { name: 'test2', self: null }
    obj2.self = obj2

    expect(deepEqual(obj1, obj2)).toBe(false)
  })

  it('should handle arrays with circular references', () => {
    const arr1 = [{ name: 'item' }]
    arr1[0].parent = arr1

    const arr2 = [{ name: 'item' }]
    arr2[0].parent = arr2

    expect(deepEqual(arr1, arr2)).toBe(true)
  })

  it('should handle nested circular references', () => {
    const obj1 = { a: { b: {} } }
    obj1.a.b.c = obj1.a
    obj1.a.b.d = obj1

    const obj2 = { a: { b: {} } }
    obj2.a.b.c = obj2.a
    obj2.a.b.d = obj2

    expect(deepEqual(obj1, obj2)).toBe(true)
  })

  it('should still work correctly for non-circular objects', () => {
    expect(deepEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true)
    expect(deepEqual({ a: 1, b: 2 }, { a: 1, b: 3 })).toBe(false)
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true)
    expect(deepEqual([1, 2, 3], [1, 2, 4])).toBe(false)
  })
})
