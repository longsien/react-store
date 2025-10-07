import React from 'react'
import { store, useStore, useStoreValue } from '../../../src/index.js'

// ===== BASIC DERIVED STORES =====

// Primitive stores
const countStore = store(0)
const nameStore = store('John')
const ageStore = store(get => get(countStore) + 10)

// Simple derived store (read-only)
const doubleCountStore = store(get => get(countStore) * 2)

// Complex derived store with multiple dependencies
const userStatsStore = store(get => ({
  total: get(countStore) + get(ageStore),
  displayName: `${get(nameStore)} (${get(ageStore)})`,
  isAdult: get(ageStore) >= 18,
}))

// ===== USER PROFILE DERIVED STORES =====

// User profile store
const userStore = store({
  firstName: 'John',
  lastName: 'Doe',
  email: 'john.doe@example.com',
  preferences: {
    theme: 'dark',
    notifications: true,
  },
})

// Derived stores from user data
const fullNameStore = store(get => {
  const user = get(userStore)
  return `${user.firstName} ${user.lastName}`
})

const emailDomainStore = store(get => {
  const user = get(userStore)
  return user.email.split('@')[1]
})

// ===== ASYNC DERIVED STORES =====

// Pokemon ID store
const pokemonIdStore = store('pikachu')

// Async derived store - create a derived store that returns a promise
const pokemonStore = store(get => {
  const id = get(pokemonIdStore)
  return fetch(`https://pokeapi.co/api/v2/pokemon/${id}`).then(res =>
    res.json()
  )
})

// ===== COMPONENTS =====

function BasicDerivedStores() {
  const [count, setCount] = useStore(countStore)
  const [doubleCount] = useStore(doubleCountStore)
  const [userStats] = useStore(userStatsStore)

  return (
    <div style={{ border: '1px solid #ccc', padding: '10px', margin: '10px' }}>
      <h3>Basic Derived Stores</h3>
      <p>Count: {count}</p>
      <p>Double Count (derived): {doubleCount}</p>
      <p>Total (count + age): {userStats.total}</p>
      <p>Display Name: {userStats.displayName}</p>
      <p>Is Adult: {userStats.isAdult ? 'Yes' : 'No'}</p>

      <button onClick={() => setCount(count + 1)}>Increment Count</button>
    </div>
  )
}

function UserProfileStores() {
  const [user, setUser] = useStore(userStore)
  const [fullName] = useStore(fullNameStore)
  const [emailDomain] = useStore(emailDomainStore)

  return (
    <div style={{ border: '1px solid #ccc', padding: '10px', margin: '10px' }}>
      <h3>User Profile Derived Stores</h3>
      <p>Full Name (derived): {fullName}</p>
      <p>Email Domain (derived): {emailDomain}</p>

      <div>
        <input
          value={user.firstName}
          onChange={e => setUser({ ...user, firstName: e.target.value })}
          placeholder='First Name'
        />
        <input
          value={user.lastName}
          onChange={e => setUser({ ...user, lastName: e.target.value })}
          placeholder='Last Name'
        />
        <input
          value={user.email}
          onChange={e => setUser({ ...user, email: e.target.value })}
          placeholder='Email'
        />
      </div>
    </div>
  )
}

function AsyncDerivedStores() {
  const [pokemonId, setPokemonId] = useStore(pokemonIdStore)
  const [pokemonPromise] = useStore(pokemonStore)
  const [pokemon, setPokemon] = React.useState(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    setLoading(true)
    pokemonPromise
      .then(data => {
        setPokemon(data)
        setLoading(false)
      })
      .catch(error => {
        setPokemon({ error: true, message: error.message })
        setLoading(false)
      })
  }, [pokemonPromise])

  return (
    <div style={{ border: '1px solid #ccc', padding: '10px', margin: '10px' }}>
      <h3>Async Derived Stores</h3>
      <p>Pokemon ID: {pokemonId}</p>

      {loading ? (
        <p>Loading...</p>
      ) : pokemon?.error ? (
        <div style={{ color: 'red' }}>
          <p>Error: {pokemon.message}</p>
        </div>
      ) : (
        <div>
          <p>Pokemon: {pokemon?.name}</p>
          <p>ID: {pokemon?.id}</p>
          <p>Height: {pokemon?.height}</p>
          <p>Weight: {pokemon?.weight}</p>
        </div>
      )}

      <div>
        <input
          value={pokemonId}
          onChange={e => setPokemonId(e.target.value)}
          placeholder='Pokemon ID'
        />
        <button onClick={() => setPokemonId('pikachu')}>Pikachu</button>
        <button onClick={() => setPokemonId('charizard')}>Charizard</button>
        <button onClick={() => setPokemonId('blastoise')}>Blastoise</button>
      </div>
    </div>
  )
}

export default function DerivedStoresExample() {
  return (
    <div>
      <h1>Derived Stores Example</h1>
      <p>
        This example demonstrates composable/derived stores using the{' '}
        <code>store(function)</code> syntax, similar to Jotai's approach.
      </p>

      <BasicDerivedStores />
      <UserProfileStores />
      <AsyncDerivedStores />
    </div>
  )
}
