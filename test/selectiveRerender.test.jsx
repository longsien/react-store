import React from 'react'
import { store, useStore } from '../src/index'
import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

describe('Selective Re-renders', () => {
  it('should only re-render components subscribed to changed state', () => {
    const dataStore = store({
      user: { name: 'Irene', age: 30 },
      settings: { theme: 'dark', notifications: true },
    })

    // Mock render functions to track calls
    const UserDisplayRender = vi.fn()
    const SettingsDisplayRender = vi.fn()

    function UserDisplay() {
      UserDisplayRender()
      const [state] = useStore(dataStore)
      return (
        <p>
          User: {state.user.name}, {state.user.age}
        </p>
      )
    }

    // Memoize SettingsDisplay to ensure it only re-renders if its props/subscribed state changes
    const SettingsDisplay = React.memo(function SettingsDisplay() {
      SettingsDisplayRender()
      const [state] = useStore(dataStore)
      return (
        <p>
          Theme: {state.settings.theme}, Notifications:{' '}
          {state.settings.notifications ? 'On' : 'Off'}
        </p>
      )
    })

    render(
      <>
        <UserDisplay />
        <SettingsDisplay />
      </>
    )

    // Initial renders
    expect(UserDisplayRender).toHaveBeenCalledTimes(1)
    expect(SettingsDisplayRender).toHaveBeenCalledTimes(1)

    // Update only the user's name
    act(() => {
      const currentState = dataStore.get()
      dataStore.set({
        ...currentState,
        user: { ...currentState.user, name: 'Seulgi' },
      })
    })

    // Both components should re-render since they subscribe to the same store
    expect(UserDisplayRender).toHaveBeenCalledTimes(2)
    expect(SettingsDisplayRender).toHaveBeenCalledTimes(2)

    expect(screen.getByText('User: Seulgi, 30')).toBeInTheDocument()

    // Update only the settings theme
    act(() => {
      const currentState = dataStore.get()
      dataStore.set({
        ...currentState,
        settings: { ...currentState.settings, theme: 'light' },
      })
    })

    // Both components should re-render since they subscribe to the same store
    expect(UserDisplayRender).toHaveBeenCalledTimes(3)
    expect(SettingsDisplayRender).toHaveBeenCalledTimes(3)

    expect(screen.getByText('User: Seulgi, 30')).toBeInTheDocument()
  })
})
