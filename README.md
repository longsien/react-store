# React Store

A lightweight, proxy-based global state management library for React.

## Features

- **Lightweight**: Minimal footprint with zero dependencies beyond React
- **Proxy-based**: JavaScript Proxy enables nested property access with path tracking
- **Dynamic Scoping**: Components automatically subscribe only to specific array indices or object properties they access

## Installation

```bash
npm install @longsien/react-store
```

## Quick Start

```jsx
import { store, useStore } from '@longsien/react-store'

// Create a store with initial value
const counterStore = store(0)

function Counter() {
  // Get current value and setter function
  const [count, setCount] = useStore(counterStore)

  return (
    <div>
      <p>Count: {count}</p>
      {/* Direct value update */}
      <button onClick={() => setCount(count + 1)}>+</button>
      {/* Function-based update */}
      <button onClick={() => setCount(prev => prev - 1)}>-</button>
    </div>
  )
}
```

## As Global Store

You can treat a store as a global store and use it in any component without prop passing and unnecessary re-renders.

```jsx
import { store, useStore, useStoreValue } from '@longsien/react-store'

// Global store accessible from any component
const personStore = store({ name: 'Hanni', origin: 'Australia' })

// Component that updates store values
function Updater() {
  // Subscribe to specific nested properties
  const [name, setName] = useStore(personStore.name)
  const [origin, setOrigin] = useStore(personStore.origin)

  return (
    <div>
      <input type='text' value={name} onChange={e => setName(e.target.value)} />
      <input
        type='text'
        value={origin}
        onChange={e => setOrigin(e.target.value)}
      />
    </div>
  )
}

// Read-only component for name
function DisplayName() {
  // Only re-renders when name changes
  const name = useStoreValue(personStore.name)

  return <div>Name: {name}</div>
}

// Read-only component for origin
function DisplayOrigin() {
  // Only re-renders when origin changes
  const origin = useStoreValue(personStore.origin)

  return <div>Origin: {origin}</div>
}
```

## API Reference

### Store Creation

#### `store(initialValue)`

Creates a basic in-memory store that persists for the lifetime of the application session.

```jsx
// Basic in-memory store
const userStore = store({ name: 'Winter', origin: 'South Korea' })
```

#### `store(initialValue).local(key)`

Creates a store backed by localStorage with automatic persistence. Data is automatically serialized to JSON when saving and deserialized when loading.

```jsx
// Store with localStorage persistence
const settingsStore = store({ theme: 'dark' }).local('settings')
```

#### `store(initialValue).session(key)`

Creates a store backed by sessionStorage with automatic persistence. Data is automatically serialized to JSON when saving and deserialized when loading.

```jsx
// Store with sessionStorage persistence
const tempStore = store({ items: [] }).session('temp-data')
```

### Hooks

#### `useStore(store)`

Returns `[value, setState]` tuple for reading and updating state. Use exactly the same as React's built-in `useState` hook.

```jsx
// Returns [value, setter] tuple like useState
const [user, setUser] = useStore(userStore)
const [userName, setUserName] = useStore(userStore.name)
const [userOrigin, setUserOrigin] = useStore(userStore.origin)
```

#### `useStoreValue(store)`

Returns only the current value (read-only).

```jsx
// Read-only access, no setter returned
const user = useStoreValue(userStore)
const userName = useStoreValue(userStore.name)
const userOrigin = useStoreValue(userStore.origin)
```

#### `useStoreSetter(store)`

Returns only the setter function, avoiding unnecessary re-renders when the value changes.

```jsx
// Only get setter function, avoids re-renders
const setUser = useStoreSetter(userStore)
const setUserName = useStoreSetter(userStore.name)
const setUserOrigin = useStoreSetter(userStore.origin)
```

### Non-Hook Functions

#### `store.get()`

Get current value outside React components. Useful for utility functions, event handlers, or any code that runs outside the React render cycle.

```jsx
// Get values outside React components
const currentUser = userStore.get()
const userName = userStore.name.get()
const userOrigin = userStore.origin.get()
```

#### `store.set(value)`

Update value outside React components. Triggers all subscribed components to re-render if their specific data has changed. Accepts the same value types as the hook-based setters.

```jsx
// Update values outside React components
useStore.set({ name: 'Karina', origin: 'South Korea' })
useStore.name.set('Ningning')
useStore.origin.set('China')
```

## Derived Stores

Derived stores automatically compute values based on other stores and update when their dependencies change.

### Basic Derived Stores

```jsx
import { store, useStore } from '@longsien/react-store'

// Base store
const counterStore = store(0)
// Derived from counterStore
const doubledStore = counterStore.derive(count => count * 2)
// Derived from doubledStore (chained derivation)
const doubledAgainStore = doubledStore.derive(count => count * 2)

function Counter() {
  const [count, setCount] = useStore(counterStore)
  const [doubled] = useStore(doubledStore)
  const [doubledAgain] = useStore(doubledAgainStore)

  return (
    <div>
      <p>Count: {count}</p>
      <p>Doubled: {doubled}</p>
      <p>Doubled Again: {doubledAgain}</p>
      <button onClick={() => setCount(count + 1)}>Increment</button>
    </div>
  )
}
```

### Multi-Dependency Derived Stores

```jsx
import { store, useStore } from '@longsien/react-store'

// Multiple independent stores
const nameStore = store('Winter')
const originStore = store('South Korea')
const isActiveStore = store(true)

// Derived store combining multiple dependencies
const userProfileStore = store(get => ({
  name: get(nameStore),
  origin: get(originStore),
  isActive: get(isActiveStore),
  // Computed values based on dependencies
  displayName: `${get(nameStore)} (${get(originStore)})`,
  status: get(isActiveStore) ? 'Online' : 'Offline',
  canPerformActions: get(isActiveStore) && get(originStore) !== 'Unknown',
}))

function UserProfile() {
  // Automatically updates when any dependency changes
  const [userProfile] = useStore(userProfileStore)

  return (
    <div>
      <h3>{userProfile.displayName}</h3>
      <p>Status: {userProfile.status}</p>
      <p>Can perform actions: {userProfile.canPerformActions ? 'Yes' : 'No'}</p>
    </div>
  )
}
```

## Async Stores

Async stores handle asynchronous operations with built-in loading, error, and success states.

### Basic Async Store

```jsx
import { store, useStoreValue, isSuccess } from '@longsien/react-store'

// Async store that fetches data on creation
const pokemonStore = store().async(() =>
  fetch(`https://pokeapi.co/api/v2/pokemon/pikachu`).then(res => res.json())
)

function Pokemon() {
  const pokemon = useStoreValue(pokemonStore)

  // Check if data is successfully loaded
  return <div>Pokemon: {isSuccess(pokemon) && pokemon.name}</div>
}
```

### Async Derived Store

```jsx
import {
  store,
  useStore,
  isLoading,
  isError,
  isSuccess,
  getErrorMessage,
} from '@longsien/react-store'

// Store for Pokemon ID
const pokemonIdStore = store(1)
// Async derived store that fetches when ID changes
const pokemonDetailsStore = pokemonIdStore.derive(async id => {
  const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`)
  return response.json()
})

function PokemonDetails() {
  const [pokemonId, setPokemonId] = useStore(pokemonIdStore)
  const [pokemonDetails] = useStore(pokemonDetailsStore)

  return (
    <div>
      <button onClick={() => setPokemonId(pokemonId + 1)}>Next Pokemon</button>

      {/* Show loading state */}
      {isLoading(pokemonDetails) && <p>Loading Pokemon details...</p>}
      {/* Show error state */}
      {isError(pokemonDetails) && (
        <p>Error: {getErrorMessage(pokemonDetails)}</p>
      )}
      {/* Show success state */}
      {isSuccess(pokemonDetails) && (
        <div>
          <h3>{pokemonDetails.name}</h3>
          <p>
            <img
              src={pokemonDetails.sprites.front_default}
              alt={pokemonDetails.name}
            />
          </p>
          <p>Height: {pokemonDetails.height}</p>
          <p>Weight: {pokemonDetails.weight}</p>
        </div>
      )}
    </div>
  )
}
```

### Async Utility Functions

#### `isLoading(data)`

Returns `true` if the async store is currently loading.

```jsx
// Check if async operation is in progress
{
  isLoading(pokemonDetails) && <p>Loading Pokemon...</p>
}
```

#### `isError(data)`

Returns `true` if the async operation failed.

```jsx
import { isError, getErrorMessage } from '@longsien/react-store'

{
  isError(pokemonDetails) && <p>Error: {getErrorMessage(pokemonDetails)}</p>
}
```

#### `isSuccess(data)`

Returns `true` if the async operation completed successfully.

```jsx
// Check if async operation succeeded
{
  isSuccess(pokemonDetails) && <div>{/* Render success content */}</div>
}
```

#### `getErrorMessage(data)`

Returns the error message from a failed async operation.

```jsx
// Extract error message from failed async operation
const errorMessage = getErrorMessage(pokemonDetails)
```

#### `getErrorStatus(data)`

Returns the HTTP status code from a failed async operation.

```jsx
// Extract HTTP status code from failed async operation
const statusCode = getErrorStatus(pokemonDetails)
```

## Nested Property Access

The library uses JavaScript Proxies to enable nested property access. This allows components to subscribe to deeply nested values without re-rendering when unrelated parts of the state change.

```jsx
import { store, useStore } from '@longsien/react-store'

// Nested object structure
const userStore = store({
  profile: {
    name: 'Winter',
    origin: 'South Korea',
    settings: { theme: 'dark' },
  },
  posts: [],
})

// Subscribe to specific nested properties
const [theme, setTheme] = useStore(userStore.profile.settings.theme)
const [origin, setOrigin] = useStore(userStore.profile.origin)
const [posts, setPosts] = useStore(userStore.posts)

// Updates only affect components using those specific paths
setTheme('light') // Only theme subscribers re-render
setOrigin('Australia') // Only origin subscribers re-render
setPosts(prev => [...prev, newPost]) // Only posts subscribers re-render
```

## Dynamic Scoping

Nested property access works with dynamic scoping, allowing dynamic path path subscription based on component props.

### Array Index Subscriptions

```jsx
import { useStore, useStoreValue } from '@longsien/react-store'

// Dynamic array index subscription
const [comment, setComment] = useStore(commentsStore[index])
const author = useStoreValue(commentsStore[index].author)
```

### Dynamic Object Property Subscriptions

```jsx
import { useStore, useStoreSetter } from '@longsien/react-store'

// Dynamic object property subscription
const [user, setUser] = useStore(usersStore[userId])
const setStatus = useStoreSetter(usersStore[userId].status)
```

## Requirements

- React 18.0.0 or higher

## License

MIT

## Contributing

Issues and pull requests are welcome on [GitHub](https://github.com/longsien/react-store).

## Author

Long Sien
