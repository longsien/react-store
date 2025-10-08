import React from 'react'
import { store, useStore } from '../src/index'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

describe('Nested Updates', () => {
  it('should handle nested object updates', () => {
    const settingsStore = store({ profile: { theme: 'dark' } })

    function ThemeSwitcher() {
      const [state, setState] = useStore(settingsStore)
      return (
        <button
          onClick={() =>
            setState({
              ...state,
              profile: { ...state.profile, theme: 'light' },
            })
          }>
          Switch Theme
        </button>
      )
    }

    render(<ThemeSwitcher />)
    fireEvent.click(screen.getByText('Switch Theme'))

    expect(settingsStore.get().profile.theme).toBe('light')
  })

  it('should handle nested array updates', () => {
    const dataStore = store({ items: ['item1'] })

    function ItemList() {
      const [state, setState] = useStore(dataStore)
      return (
        <button
          onClick={() =>
            setState({ ...state, items: [...state.items, 'item2'] })
          }>
          Add Item
        </button>
      )
    }

    render(<ItemList />)
    fireEvent.click(screen.getByText('Add Item'))

    expect(dataStore.get().items).toEqual(['item1', 'item2'])
  })
})
