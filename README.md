# React Store

A lightweight, proxy-based state management library for React with built-in localStorage and sessionStorage support.

## Installation

```bash
npm install @longsien/react-store
```

## Features

- **Lightweight**: Minimal footprint with zero dependencies beyond React
- **Proxy-based**: JavaScript Proxy enables intuitive nested property access with automatic path tracking
- **Dynamic Scoping**: Components automatically subscribe only to specific array indices or object properties they access
- **Storage Integration**: Seamless localStorage and sessionStorage persistence with automatic serialization
- **React 18+**: Built on `useSyncExternalStore` for concurrent rendering compatibility and optimal performance
- **Immutable Updates**: Automatic immutable state updates preserve React's rendering optimizations

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
      <button onClick={() => setCount(count + 1)}>+</button>
      <button onClick={() => setCount(prev => prev - 1)}>-</button>
    </div>
  )
}
```

## API Reference

### Store Creation

#### `store(initialValue)`

Creates a basic in-memory store that persists for the lifetime of the application session. The store uses a WeakMap internally to track state and a Set to manage subscribers, ensuring efficient memory usage and garbage collection.

```jsx
const userStore = store({ name: 'John', age: 30 })
```

#### `storeLocal(key, initialValue)`

Creates a store backed by localStorage with automatic persistence. Data is automatically serialized to JSON when saving and deserialized when loading. If localStorage is unavailable or corrupted, falls back to the initial value gracefully.

```jsx
const settingsStore = storeLocal('settings', { theme: 'dark' })
```

#### `storeSession(key, initialValue)`

Creates a store backed by sessionStorage with automatic persistence. Unlike localStorage, this data is cleared when the browser tab is closed. Perfect for temporary data that shouldn't persist between sessions.

```jsx
const tempStore = storeSession('temp-data', { items: [] })
```

### Hooks

#### `useStore(store)`

Returns `[value, setState]` tuple for reading and updating state. The hook uses `useSyncExternalStore` to ensure components only re-render when their specific data changes. The setState function accepts either a new value or an updater function, similar to React's built-in useState.

```jsx
const [user, setUser] = useStore(userStore)
const [userName, setUserName] = useStore(userStore.name)
```

#### `useStoreValue(store)`

Returns only the current value (read-only). This is optimized for components that only need to display data without updating it. Uses the same subscription mechanism as useStore but doesn't create a setter function, slightly reducing memory usage.

```jsx
const user = useStoreValue(userStore)
const userName = useStoreValue(userStore.name)
```

#### `useStoreSetter(store)`

Returns only the setter function. Perfect for components that need to update state but don't need to display the current value, avoiding unnecessary re-renders when the value changes.

```jsx
const setUser = useStoreSetter(userStore)
const setUserName = useStoreSetter(userStore.name)
```

### Non-Hook Functions

#### `getStore(store)`

Get current value outside React components. Useful for utility functions, event handlers, or any code that runs outside the React render cycle.

```jsx
const currentUser = getStore(userStore)
```

#### `setStore(store, value)`

Update value outside React components. Triggers all subscribed components to re-render if their specific data has changed. Accepts the same value types as the hook-based setters.

```jsx
setStore(userStore, { name: 'Jane', age: 25 })
```

## Nested Property Access

The library uses JavaScript Proxy to enable intuitive nested property access. Each property access creates a new proxy that tracks the path to that value. This allows components to subscribe to deeply nested values without re-rendering when unrelated parts of the state change.

```jsx
const userStore = store({
  profile: { name: 'John', settings: { theme: 'dark' } },
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

Components automatically subscribe only to the specific data they access, enabling efficient list rendering and object property subscriptions. This eliminates unnecessary re-renders and improves performance in large applications.

### Array Index Subscriptions

```jsx
const commentsStore = store([
  { text: 'First comment', author: 'Alice' },
  { text: 'Second comment', author: 'Bob' },
])

function Comment({ index }) {
  // Only re-renders when commentsStore[index] changes
  const [comment, setComment] = useStore(commentsStore[index])

  return (
    <div>
      <p>{comment?.text}</p>
      <small>by {comment?.author}</small>
      <button
        onClick={() =>
          setComment({
            ...comment,
            text: comment.text + ' (edited)',
          })
        }
      >
        Edit
      </button>
    </div>
  )
}

function CommentList() {
  const comments = useStoreValue(commentsStore)

  return (
    <div>
      {comments.map((_, index) => (
        <Comment key={index} index={index} />
      ))}
    </div>
  )
}
```

### Dynamic Object Property Subscriptions

```jsx
const usersStore = storeLocal('users', {
  alice: { name: 'Alice', status: 'online', messages: 5 },
  bob: { name: 'Bob', status: 'offline', messages: 2 },
  charlie: { name: 'Charlie', status: 'online', messages: 0 },
})

function UserCard({ userId }) {
  // Only re-renders when this specific user's data changes
  const [user, setUser] = useStore(usersStore[userId])
  const setStatus = useStoreSetter(usersStore[userId].status)

  const toggleStatus = () => {
    setStatus(prev => (prev === 'online' ? 'offline' : 'online'))
  }

  return (
    <div>
      <h3>{user?.name}</h3>
      <p>Status: {user?.status}</p>
      <p>Messages: {user?.messages}</p>
      <button onClick={toggleStatus}>Toggle Status</button>
    </div>
  )
}

function UserDirectory() {
  const users = useStoreValue(usersStore)

  return (
    <div>
      <h2>User Directory</h2>
      {Object.keys(users).map(userId => (
        <UserCard key={userId} userId={userId} />
      ))}
    </div>
  )
}
```

## Examples

### Basic Counter

```jsx
import { store, useStore } from '@longsien/react-store'

const counterStore = store(0)

function App() {
  const [count, setCount] = useStore(counterStore)

  return (
    <button onClick={() => setCount(prev => prev + 1)}>Count: {count}</button>
  )
}
```

### Persistent Settings

```jsx
import { storeLocal, useStore } from '@longsien/react-store'

const settingsStore = storeLocal('app-settings', {
  theme: 'light',
  language: 'en',
})

function Settings() {
  const [theme, setTheme] = useStore(settingsStore.theme)
  const [language, setLanguage] = useStore(settingsStore.language)

  return (
    <div>
      <select value={theme} onChange={e => setTheme(e.target.value)}>
        <option value='light'>Light</option>
        <option value='dark'>Dark</option>
      </select>

      <select value={language} onChange={e => setLanguage(e.target.value)}>
        <option value='en'>English</option>
        <option value='es'>Spanish</option>
      </select>
    </div>
  )
}
```

### Contacts App with Dynamic Scoping

```jsx
import {
  storeLocal,
  useStore,
  useStoreValue,
  setStore,
} from '@longsien/react-store'
import { useState } from 'react'

const contactsStore = storeLocal('contacts', [])

function ContactCard({ index }) {
  // Only re-renders when this specific contact changes
  const [contact, setContact] = useStore(contactsStore[index])
  const [isEditing, setIsEditing] = useState(false)

  if (!contact) return null

  const updateContact = (field, value) => {
    setContact(prev => ({ ...prev, [field]: value }))
  }

  const deleteContact = () => {
    const contacts = getStore(contactsStore)
    setStore(
      contactsStore,
      contacts.filter((_, i) => i !== index)
    )
  }

  if (isEditing) {
    return (
      <div>
        <input
          value={contact.name}
          onChange={e => updateContact('name', e.target.value)}
          placeholder='Name'
        />
        <input
          value={contact.email}
          onChange={e => updateContact('email', e.target.value)}
          placeholder='Email'
        />
        <input
          value={contact.phone || ''}
          onChange={e => updateContact('phone', e.target.value)}
          placeholder='Phone'
        />
        <button onClick={() => setIsEditing(false)}>Save</button>
        <button onClick={() => setIsEditing(false)}>Cancel</button>
      </div>
    )
  }

  return (
    <div>
      <h4>{contact.name}</h4>
      <p>Email: {contact.email}</p>
      {contact.phone && <p>Phone: {contact.phone}</p>}
      <button onClick={() => setIsEditing(true)}>Edit</button>
      <button onClick={deleteContact}>Delete</button>
    </div>
  )
}

function ContactsApp() {
  const [contacts, setContacts] = useStore(contactsStore)
  const [form, setForm] = useState({ name: '', email: '', phone: '' })

  const addContact = () => {
    if (form.name.trim() && form.email.trim()) {
      setContacts(prev => [
        ...prev,
        {
          id: Date.now(),
          ...form,
        },
      ])
      setForm({ name: '', email: '', phone: '' })
    }
  }

  return (
    <div>
      <h2>My Contacts ({contacts.length})</h2>

      <div>
        <h3>Add New Contact</h3>
        <input
          placeholder='Name'
          value={form.name}
          onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
        />
        <input
          placeholder='Email'
          value={form.email}
          onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
        />
        <input
          placeholder='Phone'
          value={form.phone}
          onChange={e => setForm(prev => ({ ...prev, phone: e.target.value }))}
        />
        <button onClick={addContact}>Add Contact</button>
      </div>

      {contacts.length === 0 ? (
        <p>No contacts yet. Add your first contact above!</p>
      ) : (
        <div>
          {contacts.map((_, index) => (
            <ContactCard key={index} index={index} />
          ))}
        </div>
      )}
    </div>
  )
}
```

## Requirements

- React 18.0.0 or higher

## License

MIT

## Contributing

Issues and pull requests are welcome on [GitHub](https://github.com/longsien/react-store).

## Author

Long Sien
