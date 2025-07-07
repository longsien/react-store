
import React from 'react'
import { store, useStoreSetter } from '../src/index'
import { render, fireEvent, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

describe('useStoreSetter', () => {
  it('should only provide the setter', () => {
    const countStore = store(0)

    function CounterButtons() {
      const setCount = useStoreSetter(countStore)
      return (
        <button onClick={() => setCount(c => c + 1)}>Increment</button>
      )
    }

    render(<CounterButtons />)
    fireEvent.click(screen.getByText('Increment'))

    // Check the value directly
    expect(countStore.get()).toBe(1)
  })
})
