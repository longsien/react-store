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

## API Reference

### Store Creation

#### `store(initialValue)`

Creates a basic in-memory store that persists for the lifetime of the application session.

```jsx
const userStore = store({ name: 'Winter', age: 24 })
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
const [userEmail, setUserEmail] = useStore(userStore.contact.email)
```

#### `useStoreValue(store)`

Returns only the current value (read-only).

```jsx
const user = useStoreValue(userStore)
const userName = useStoreValue(userStore.name)
```

#### `useStoreSetter(store)`

Returns only the setter function, avoiding unnecessary re-renders when the value changes.

```jsx
const setUser = useStoreSetter(userStore)
const setUserName = useStoreSetter(userStore.name)
```

### Non-Hook Functions

#### `store.get()`

Get current value outside React components. Useful for utility functions, event handlers, or any code that runs outside the React render cycle.

```jsx
const currentUser = userStore.get()
const useName = userStore.name.get()
```

#### `store.set(value)`

Update value outside React components. Triggers all subscribed components to re-render if their specific data has changed. Accepts the same value types as the hook-based setters.

```jsx
useStore.set({ name: 'Karina', age: 25 })
useStore.name.set('Karina')
useStore.age.set(prev => prev + 1)
```

## Nested Property Access

The library uses JavaScript Proxies to enable nested property access. This allows components to subscribe to deeply nested values without re-rendering when unrelated parts of the state change.

```jsx
const userStore = store({
  profile: { name: 'Winter', settings: { theme: 'dark' } },
  posts: [],
})

// Access nested values - each creates a scoped subscription
const [theme, setTheme] = useStore(userStore.profile.settings.theme)
const [posts, setPosts] = useStore(userStore.posts)

// Update nested values immutably
setTheme('light') // Only components using userStore.profile.settings.theme re-render
setPosts(prev => [...prev, newPost]) // Only components using userStore.posts re-render
```

## Dynamic Scoping

Nested property access works with dynamic scoping, allowing dynamic path path subscription based on component props.

### Array Index Subscriptions

```jsx
const [comment, setComment] = useStore(commentsStore[index])
const author = useStoreValue(commentsStore[index].author)
```

### Dynamic Object Property Subscriptions

```jsx
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
