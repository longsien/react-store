
import React from 'react';
import { store, useStore } from '../src/index'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

// Test component
function Counter() {
  const [count, setCount] = useStore(counterStore)

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => setCount(count + 1)}>+</button>
      <button onClick={() => setCount(prev => prev - 1)}>-</button>
    </div>
  )
}

// Create a store
const counterStore = store(0)

describe('useStore', () => {
  it('should read and update the count', () => {
    render(<Counter />)

    // Initial count
    expect(screen.getByText('Count: 0')).toBeInTheDocument()

    // Increment
    fireEvent.click(screen.getByText('+'))
    expect(screen.getByText('Count: 1')).toBeInTheDocument()

    // Decrement
    fireEvent.click(screen.getByText('-'))
    expect(screen.getByText('Count: 0')).toBeInTheDocument()
  })
})
