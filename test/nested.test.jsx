import React from 'react'
import { store, useStore } from '../src/index'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

describe('Nested Updates', () => {
  it('should handle nested object updates', () => {
    const settingsStore = store({ profile: { theme: 'dark' } })

    function ThemeSwitcher() {
      const [theme, setTheme] = useStore(settingsStore.profile.theme)
      return <button onClick={() => setTheme('light')}>Switch Theme</button>
    }

    render(<ThemeSwitcher />)
    fireEvent.click(screen.getByText('Switch Theme'))

    expect(settingsStore.profile.theme.get()).toBe('light')
  })

  it('should handle nested array updates', () => {
    const dataStore = store({ items: ['item1'] })

    function ItemList() {
      const [items, setItems] = useStore(dataStore.items)
      return (
        <button onClick={() => setItems(i => [...i, 'item2'])}>Add Item</button>
      )
    }

    render(<ItemList />)
    fireEvent.click(screen.getByText('Add Item'))

    expect(dataStore.items.get()).toEqual(['item1', 'item2'])
  })
})
