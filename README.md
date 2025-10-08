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

// Create a store
const counterStore = store(0)

function Counter() {
  const [count, setCount] = useStore(counterStore)

  return (
    <div>
      <p>Count: {count}</p>
      {/* Increment Set value directly */}
      <button onClick={() => setCount(count + 1)}>+</button>
      {/* Use updater function for synchronous updates */}
      <button onClick={() => setCount(prev => prev - 1)}>-</button>
    </div>
  )
}
```

## As Global Store

You can treat a store as a global store and use it in any component without prop passing and unnecessary re-renders.

```jsx
import { store, useStore, useStoreValue } from '@longsien/react-store'

// Create a store
const personStore = store({ name: 'Hanni', origin: 'Australia' })

// Updater component
function Updater() {
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

// DisplayName component
function DisplayName() {
  const name = useStoreValue(personStore.name)

  return <div>Name: {name}</div>
}

// DisplayOrigin component
function DisplayOrigin() {
  const origin = useStoreValue(personStore.origin)

  return <div>Origin: {origin}</div>
}
```

## API Reference

### Store Creation

#### `store(initialValue)`

Creates a basic in-memory store that persists for the lifetime of the application session.

```jsx
const userStore = store({ name: 'Winter', origin: 'South Korea' })
```

#### `store(initialValue).local(key)`

Creates a store backed by localStorage with automatic persistence. Data is automatically serialized to JSON when saving and deserialized when loading.

```jsx
const settingsStore = store({ theme: 'dark' }).local('settings')
```

#### `store(initialValue).session(key)`

Creates a store backed by sessionStorage with automatic persistence. Data is automatically serialized to JSON when saving and deserialized when loading.

```jsx
const tempStore = store({ items: [] }).session('temp-data')
```

### Hooks

#### `useStore(store)`

Returns `[value, setState]` tuple for reading and updating state. Use exactly the same as React's built-in `useState` hook.

```jsx
const [user, setUser] = useStore(userStore)
const [userName, setUserName] = useStore(userStore.name)
const [userOrigin, setUserOrigin] = useStore(userStore.origin)
```

#### `useStoreValue(store)`

Returns only the current value (read-only).

```jsx
const user = useStoreValue(userStore)
const userName = useStoreValue(userStore.name)
const userOrigin = useStoreValue(userStore.origin)
```

#### `useStoreSetter(store)`

Returns only the setter function, avoiding unnecessary re-renders when the value changes.

```jsx
const setUser = useStoreSetter(userStore)
const setUserName = useStoreSetter(userStore.name)
const setUserOrigin = useStoreSetter(userStore.origin)
```

### Non-Hook Functions

#### `store.get()`

Get current value outside React components. Useful for utility functions, event handlers, or any code that runs outside the React render cycle.

```jsx
const currentUser = userStore.get()
const userName = userStore.name.get()
const userOrigin = userStore.origin.get()
```

#### `store.set(value)`

Update value outside React components. Triggers all subscribed components to re-render if their specific data has changed. Accepts the same value types as the hook-based setters.

```jsx
useStore.set({ name: 'Karina', origin: 'South Korea' })
useStore.name.set('Ningning')
useStore.origin.set('China')
```

## Derived Stores

Derived stores automatically compute values based on other stores and update when their dependencies change.

### Basic Derived Stores

```jsx
import { store, useStore } from '@longsien/react-store'

const counterStore = store(0)
const doubledStore = counterStore.derive(count => count * 2)
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

const nameStore = store('Winter')
const originStore = store('South Korea')
const isActiveStore = store(true)

const userProfileStore = store(get => ({
  name: get(nameStore),
  origin: get(originStore),
  isActive: get(isActiveStore),
  displayName: `${get(nameStore)} (${get(originStore)})`,
  status: get(isActiveStore) ? 'Online' : 'Offline',
  canPerformActions: get(isActiveStore) && get(originStore) !== 'Unknown',
}))

function UserProfile() {
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

const pokemonStore = store().async(() =>
  fetch(`https://pokeapi.co/api/v2/pokemon/pikachu`).then(res => res.json())
)

function Pokemon() {
  const pokemon = useStoreValue(pokemonStore)

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

const pokemonIdStore = store(1)
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

      {isLoading(pokemonDetails) && <p>Loading Pokemon details...</p>}
      {isError(pokemonDetails) && (
        <p>Error: {getErrorMessage(pokemonDetails)}</p>
      )}
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
{
  isSuccess(pokemonDetails) && <div>{/* Render success content */}</div>
}
```

#### `getErrorMessage(data)`

Returns the error message from a failed async operation.

```jsx
const errorMessage = getErrorMessage(pokemonDetails)
```

#### `getErrorStatus(data)`

Returns the HTTP status code from a failed async operation.

```jsx
const statusCode = getErrorStatus(pokemonDetails)
```

## Nested Property Access

The library uses JavaScript Proxies to enable nested property access. This allows components to subscribe to deeply nested values without re-rendering when unrelated parts of the state change.

```jsx
import { store, useStore } from '@longsien/react-store'

const userStore = store({
  profile: {
    name: 'Winter',
    origin: 'South Korea',
    settings: { theme: 'dark' },
  },
  posts: [],
})

// Access nested values - each creates a scoped subscription
const [theme, setTheme] = useStore(userStore.profile.settings.theme)
const [origin, setOrigin] = useStore(userStore.profile.origin)
const [posts, setPosts] = useStore(userStore.posts)

// Update nested values immutably
setTheme('light') // Only components using userStore.profile.settings.theme re-render
setOrigin('Australia') // Only components using userStore.profile.origin re-render
setPosts(prev => [...prev, newPost]) // Only components using userStore.posts re-render
```

## Dynamic Scoping

Nested property access works with dynamic scoping, allowing dynamic path path subscription based on component props.

### Array Index Subscriptions

```jsx
import { useStore, useStoreValue } from '@longsien/react-store'

const [comment, setComment] = useStore(commentsStore[index])
const author = useStoreValue(commentsStore[index].author)
```

### Dynamic Object Property Subscriptions

```jsx
import { useStore, useStoreSetter } from '@longsien/react-store'

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
