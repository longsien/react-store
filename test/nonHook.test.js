import { store } from '../src/index'
import { describe, it, expect } from 'vitest'

describe('store.get() and store.set()', () => {
  it('should work outside of React', () => {
    const userStore = store({ name: 'Giselle' })

    expect(userStore.get()).toEqual({ name: 'Giselle' })

    userStore.set({ name: 'Ningning' })
    expect(userStore.get()).toEqual({ name: 'Ningning' })

    userStore.name.set('Winter')
    expect(userStore.name.get()).toBe('Winter')
  })
})
