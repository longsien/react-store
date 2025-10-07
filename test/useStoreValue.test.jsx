import React from 'react'
import { store, useStoreValue } from '../src/index'
import { render, screen, act } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

describe('useStoreValue', () => {
  it('should only read the value', () => {
    const nameStore = store('Winter')

    function NameDisplay() {
      const name = useStoreValue(nameStore)
      return <p>Name: {name}</p>
    }

    render(<NameDisplay />)
    expect(screen.getByText('Name: Winter')).toBeInTheDocument()

    // Update the store from outside
    act(() => {
      nameStore.set('Karina')
    })
    expect(screen.getByText('Name: Karina')).toBeInTheDocument()
  })
})
