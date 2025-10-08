import React from 'react'
import { store, useStore } from '../src/index'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

describe('Derived Stores', () => {
  describe('basic derived stores', () => {
    it('should create a derived store that derives from another store', () => {
      const countStore = store(0)
      const doubleCountStore = store(get => get(countStore) * 2)

      expect(doubleCountStore.get()).toBe(0)

      countStore.set(5)
      expect(doubleCountStore.get()).toBe(10)
    })

    it('should update when dependencies change', () => {
      const countStore = store(0)
      const doubleCountStore = store(get => get(countStore) * 2)

      function TestComponent() {
        const [count, setCount] = useStore(countStore)
        const [doubleCount] = useStore(doubleCountStore)

        return (
          <div>
            <p>Count: {count}</p>
            <p>Double: {doubleCount}</p>
            <button onClick={() => setCount(count + 1)}>Increment</button>
          </div>
        )
      }

      render(<TestComponent />)

      expect(screen.getByText('Count: 0')).toBeInTheDocument()
      expect(screen.getByText('Double: 0')).toBeInTheDocument()

      fireEvent.click(screen.getByText('Increment'))

      expect(screen.getByText('Count: 1')).toBeInTheDocument()
      expect(screen.getByText('Double: 2')).toBeInTheDocument()
    })
  })

  describe('multiple dependencies', () => {
    it('should handle multiple dependencies', () => {
      const countStore = store(0)
      const nameStore = store('John')

      const derivedStore = store(get => {
        const count = get(countStore)
        const name = get(nameStore)
        return `${name}: ${count}`
      })

      expect(derivedStore.get()).toBe('John: 0')

      countStore.set(5)
      expect(derivedStore.get()).toBe('John: 5')

      nameStore.set('Jane')
      expect(derivedStore.get()).toBe('Jane: 5')
    })

    it('should track dependencies automatically', () => {
      const countStore = store(0)
      const nameStore = store('John')

      const derivedStore = store(get => {
        const count = get(countStore)
        const name = get(nameStore)
        return `${name}: ${count}`
      })

      function TestComponent() {
        const [count, setCount] = useStore(countStore)
        const [name, setName] = useStore(nameStore)
        const [derived] = useStore(derivedStore)

        return (
          <div>
            <p>Count: {count}</p>
            <p>Name: {name}</p>
            <p>Derived: {derived}</p>
            <button onClick={() => setCount(count + 1)}>Increment</button>
            <button onClick={() => setName('Jane')}>Change Name</button>
          </div>
        )
      }

      render(<TestComponent />)

      expect(screen.getByText('Derived: John: 0')).toBeInTheDocument()

      fireEvent.click(screen.getByText('Increment'))
      expect(screen.getByText('Derived: John: 1')).toBeInTheDocument()

      fireEvent.click(screen.getByText('Change Name'))
      expect(screen.getByText('Derived: Jane: 1')).toBeInTheDocument()
    })
  })

  describe('complex derived store scenarios', () => {
    it('should handle nested derived stores', () => {
      const todosStore = store([
        { id: 1, text: 'Learn React', completed: false },
        { id: 2, text: 'Learn Derived Stores', completed: true },
      ])

      const todoStatsStore = store(get => {
        const todos = get(todosStore)
        return {
          total: todos.length,
          completed: todos.filter(t => t.completed).length,
          remaining: todos.filter(t => !t.completed).length,
        }
      })

      const completionRateStore = store(get => {
        const stats = get(todoStatsStore)
        return stats.total > 0 ? (stats.completed / stats.total) * 100 : 0
      })

      function TestComponent() {
        const [todos, setTodos] = useStore(todosStore)
        const [stats] = useStore(todoStatsStore)
        const [completionRate] = useStore(completionRateStore)

        const toggleTodo = id => {
          setTodos(
            todos.map(todo =>
              todo.id === id ? { ...todo, completed: !todo.completed } : todo
            )
          )
        }

        return (
          <div>
            <p>Total: {stats.total}</p>
            <p>Completed: {stats.completed}</p>
            <p>Remaining: {stats.remaining}</p>
            <p>Completion Rate: {completionRate.toFixed(1)}%</p>
            {todos.map(todo => (
              <div key={todo.id}>
                <button onClick={() => toggleTodo(todo.id)}>
                  {todo.completed ? '✓' : '○'}
                </button>
                {todo.text}
              </div>
            ))}
          </div>
        )
      }

      render(<TestComponent />)

      expect(screen.getByText('Total: 2')).toBeInTheDocument()
      expect(screen.getByText('Completed: 1')).toBeInTheDocument()
      expect(screen.getByText('Remaining: 1')).toBeInTheDocument()
      expect(screen.getByText('Completion Rate: 50.0%')).toBeInTheDocument()
    })

    it('should handle selective re-renders with derived stores', () => {
      const dataStore = store({
        user: { name: 'John', age: 30 },
        settings: { theme: 'dark', notifications: true },
      })

      const userNameStore = store(get => get(dataStore).user.name)
      const userAgeStore = store(get => get(dataStore).user.age)
      const themeStore = store(get => get(dataStore).settings.theme)

      const userDisplayStore = store(get => {
        const name = get(userNameStore)
        const age = get(userAgeStore)
        return `${name} (${age})`
      })

      const UserDisplayRender = vi.fn()
      const ThemeDisplayRender = vi.fn()

      function UserDisplay() {
        UserDisplayRender()
        const [userDisplay] = useStore(userDisplayStore)
        return <p>User: {userDisplay}</p>
      }

      const ThemeDisplay = React.memo(function ThemeDisplay() {
        ThemeDisplayRender()
        const [theme] = useStore(themeStore)
        return <p>Theme: {theme}</p>
      })

      render(
        <>
          <UserDisplay />
          <ThemeDisplay />
        </>
      )

      // Initial renders
      expect(UserDisplayRender).toHaveBeenCalledTimes(1)
      expect(ThemeDisplayRender).toHaveBeenCalledTimes(1)

      // Update user name
      act(() => {
        dataStore.user.name.set('Jane')
      })

      // UserDisplay should re-render
      expect(UserDisplayRender).toHaveBeenCalledTimes(2)
      // ThemeDisplay should NOT re-render
      expect(ThemeDisplayRender).toHaveBeenCalledTimes(1)

      // Update theme
      act(() => {
        dataStore.settings.theme.set('light')
      })

      // UserDisplay should NOT re-render
      expect(UserDisplayRender).toHaveBeenCalledTimes(2)
      // ThemeDisplay should re-render
      expect(ThemeDisplayRender).toHaveBeenCalledTimes(2)
    })
  })

  describe('error handling', () => {
    it('should handle errors in derived store getters gracefully', () => {
      const countStore = store(0)

      const errorStore = store(get => {
        const count = get(countStore)
        if (count > 5) {
          throw new Error('Count too high')
        }
        return count * 2
      })

      expect(errorStore.get()).toBe(0)

      countStore.set(3)
      expect(errorStore.get()).toBe(6)

      // This should not throw, but should return the last valid value
      countStore.set(10)
      expect(errorStore.get()).toBe(6) // Last valid value
    })

    it('should handle read-only derived store setter calls', () => {
      const countStore = store(0)
      const doubleCountStore = store(get => get(countStore) * 2)

      expect(() => {
        doubleCountStore.set(10)
      }).toThrow(
        'Cannot set value on derived store. Derived stores are read-only.'
      )
    })
  })

  describe('derive method on stores', () => {
    it('should create a derived store using the derive method', () => {
      const countStore = store(0)
      const doubleCountStore = countStore.derive(count => count * 2)

      expect(doubleCountStore.get()).toBe(0)

      countStore.set(5)
      expect(doubleCountStore.get()).toBe(10)
    })

    it('should update when dependencies change using derive method', () => {
      const countStore = store(0)
      const doubleCountStore = countStore.derive(count => count * 2)

      function TestComponent() {
        const [count, setCount] = useStore(countStore)
        const [doubleCount] = useStore(doubleCountStore)

        return (
          <div>
            <p>Count: {count}</p>
            <p>Double: {doubleCount}</p>
            <button onClick={() => setCount(count + 1)}>Increment</button>
          </div>
        )
      }

      render(<TestComponent />)

      expect(screen.getByText('Count: 0')).toBeInTheDocument()
      expect(screen.getByText('Double: 0')).toBeInTheDocument()

      fireEvent.click(screen.getByText('Increment'))

      expect(screen.getByText('Count: 1')).toBeInTheDocument()
      expect(screen.getByText('Double: 2')).toBeInTheDocument()
    })

    it('should handle complex derived logic with derive method', () => {
      const userStore = store({ name: 'John', age: 25 })
      const userInfoStore = userStore.derive(user => ({
        ...user,
        canVote: user.age >= 18,
        displayName: user.name.toUpperCase(),
      }))

      expect(userInfoStore.get()).toEqual({
        name: 'John',
        age: 25,
        canVote: true,
        displayName: 'JOHN',
      })

      userStore.set({ name: 'Jane', age: 17 })
      expect(userInfoStore.get()).toEqual({
        name: 'Jane',
        age: 17,
        canVote: false,
        displayName: 'JANE',
      })
    })

    it('should handle chained derived stores', () => {
      const countStore = store(0)
      const doubleStore = countStore.derive(count => count * 2)
      const quadrupleStore = doubleStore.derive(double => double * 2)

      expect(quadrupleStore.get()).toBe(0)

      countStore.set(3)
      expect(quadrupleStore.get()).toBe(12) // 3 * 2 * 2
    })

    it('should allow setting values on derived stores by updating the base store', () => {
      const countStore = store(0)
      const doubleCountStore = countStore.derive(count => count * 2)

      // Setting a value on the derived store should update the base store
      doubleCountStore.set(10)

      // The base store should be updated to 10 (direct assignment)
      expect(countStore.get()).toBe(10)
      expect(doubleCountStore.get()).toBe(20) // 10 * 2
    })
  })

  describe('async derived stores', () => {
    it('should handle async derived stores', () => {
      const pokemonIdStore = store('pikachu')
      const pokemonStore = store(get => {
        const id = get(pokemonIdStore)
        // Mock fetch for testing to avoid network requests
        return Promise.resolve({ name: id, id: 25, type: 'electric' })
      })

      // The derived store should return a promise
      const promise = pokemonStore.get()
      expect(promise).toBeInstanceOf(Promise)
    })

    it('should handle async derived stores using derive method', () => {
      const pokemonIdStore = store(1)
      const pokemonDetailsStore = pokemonIdStore.derive(async id => {
        // Mock fetch for testing
        return { name: `Pokemon ${id}`, id, type: 'electric' }
      })

      // The derived store should return a loading state initially
      const result = pokemonDetailsStore.get()
      expect(result).toEqual({ loading: true })
    })
  })
})
