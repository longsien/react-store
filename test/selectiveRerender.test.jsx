
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
      const [user] = useStore(dataStore.user)
      return <p>User: {user.name}, {user.age}</p>
    }

    // Memoize SettingsDisplay to ensure it only re-renders if its props/subscribed state changes
    const SettingsDisplay = React.memo(function SettingsDisplay() {
      SettingsDisplayRender()
      const [settings] = useStore(dataStore.settings)
      return <p>Theme: {settings.theme}, Notifications: {settings.notifications ? 'On' : 'Off'}</p>
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
      dataStore.user.name.set('Seulgi')
    })

    // UserDisplay should re-render (initial + update)
    expect(UserDisplayRender).toHaveBeenCalledTimes(2)
    // SettingsDisplay should NOT re-render (only initial)
    expect(SettingsDisplayRender).toHaveBeenCalledTimes(1)

    expect(screen.getByText('User: Seulgi, 30')).toBeInTheDocument()

    // Update only the settings theme
    act(() => {
      dataStore.settings.theme.set('light')
    })

    // UserDisplay should NOT re-render
    expect(UserDisplayRender).toHaveBeenCalledTimes(2)
    // SettingsDisplay should re-render
    expect(SettingsDisplayRender).toHaveBeenCalledTimes(2)

    expect(screen.getByText('User: Seulgi, 30')).toBeInTheDocument()
  })
})
