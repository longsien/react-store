import {
  useStore,
  store,
  isError,
  isSuccess,
  isLoading,
  getErrorMessage,
  getErrorStatus,
} from '../../../src/index.js' // import from your library
import { useEffect, useState } from 'react'

// Basic stores
const pokemonIdStore = store(1) // Start with a valid Pokemon ID
const counterStore = store(0)
const nameStore = store('John')
const ageStore = store(25)
const itemsStore = store(['apple', 'banana', 'cherry'])

// Derived stores - simple transformations
const doubledCounterStore = counterStore.derive(count => count * 2)
const isEvenStore = counterStore.derive(count => count % 2 === 0)
const greetingStore = nameStore.derive(name => `Hello, ${name}!`)
const canVoteStore = ageStore.derive(age => age >= 18)
const itemCountStore = itemsStore.derive(items => items.length)
const firstItemStore = itemsStore.derive(items => items[0] || 'No items')

// Derived stores - complex transformations
const userInfoStore = store(get => ({
  name: get(nameStore),
  age: get(ageStore),
  canVote: get(canVoteStore),
}))

const statsStore = store(get => ({
  counter: get(counterStore),
  doubled: get(doubledCounterStore),
  isEven: get(isEvenStore),
  itemCount: get(itemCountStore),
}))

// Async derived store
const pokemonDetailsStore = pokemonIdStore.derive(async id => {
  const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`)
  return response.json()
})

export default function App() {
  // Basic store values
  const [counter, setCounter] = useStore(counterStore)
  const [name, setName] = useStore(nameStore)
  const [age, setAge] = useStore(ageStore)
  const [items, setItems] = useStore(itemsStore)
  const [pokemonId, setPokemonId] = useStore(pokemonIdStore)

  // Derived store values
  const [doubledCounter] = useStore(doubledCounterStore)
  const [isEven] = useStore(isEvenStore)
  const [greeting] = useStore(greetingStore)
  const [canVote] = useStore(canVoteStore)
  const [itemCount] = useStore(itemCountStore)
  const [firstItem] = useStore(firstItemStore)
  const [userInfo] = useStore(userInfoStore)
  const [stats] = useStore(statsStore)
  const [pokemonDetails] = useStore(pokemonDetailsStore)

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>React Store Demo</h1>

      {/* Counter Examples */}
      <div
        style={{
          marginBottom: '30px',
          border: '1px solid #ccc',
          padding: '15px',
          borderRadius: '5px',
        }}>
        <h2>Counter Examples</h2>
        <div>
          <p>Counter: {counter}</p>
          <p>Doubled: {doubledCounter}</p>
          <p>Is Even: {isEven ? 'Yes' : 'No'}</p>
          <button onClick={() => setCounter(counter + 1)}>Increment</button>
          <button onClick={() => setCounter(counter - 1)}>Decrement</button>
          <button onClick={() => setCounter(0)}>Reset</button>
        </div>
      </div>

      {/* User Info Examples */}
      <div
        style={{
          marginBottom: '30px',
          border: '1px solid #ccc',
          padding: '15px',
          borderRadius: '5px',
        }}>
        <h2>User Info Examples</h2>
        <div>
          <p>
            Name: <input value={name} onChange={e => setName(e.target.value)} />
          </p>
          <p>
            Age:{' '}
            <input
              type='number'
              value={age}
              onChange={e => setAge(Number(e.target.value))}
            />
          </p>
          <p>Greeting: {greeting}</p>
          <p>Can Vote: {canVote ? 'Yes' : 'No'}</p>
          <h3>Combined User Info:</h3>
          <pre>{JSON.stringify(userInfo, null, 2)}</pre>
        </div>
      </div>

      {/* Items Examples */}
      <div
        style={{
          marginBottom: '30px',
          border: '1px solid #ccc',
          padding: '15px',
          borderRadius: '5px',
        }}>
        <h2>Items Examples</h2>
        <div>
          <p>Items: {items.join(', ')}</p>
          <p>Item Count: {itemCount}</p>
          <p>First Item: {firstItem}</p>
          <button onClick={() => setItems([...items, 'new item'])}>
            Add Item
          </button>
          <button onClick={() => setItems(items.slice(0, -1))}>
            Remove Last
          </button>
          <button onClick={() => setItems(['apple', 'banana', 'cherry'])}>
            Reset
          </button>
        </div>
      </div>

      {/* Stats Example */}
      <div
        style={{
          marginBottom: '30px',
          border: '1px solid #ccc',
          padding: '15px',
          borderRadius: '5px',
        }}>
        <h2>Combined Stats</h2>
        <pre>{JSON.stringify(stats, null, 2)}</pre>
      </div>

      {/* Async Pokemon Example */}
      <div
        style={{
          marginBottom: '30px',
          border: '1px solid #ccc',
          padding: '15px',
          borderRadius: '5px',
        }}>
        <h2>Async Derived Store (Pokemon)</h2>
        <div>
          <label>Pokemon ID: {pokemonId}</label>
          <div>
            <button onClick={() => setPokemonId(pokemonId - 1)}>
              Previous
            </button>
            <button onClick={() => setPokemonId(pokemonId + 1)}>Next</button>
          </div>
        </div>

        <h3>Pokemon Details:</h3>
        {isLoading(pokemonDetails) ?
          <div>
            <p>Loading Pokemon...</p>
          </div>
        : isError(pokemonDetails) ?
          <div style={{ color: 'red' }}>
            <p>
              <strong>Error:</strong> {getErrorMessage(pokemonDetails)}
            </p>
            <p>
              <strong>Status:</strong> {getErrorStatus(pokemonDetails)}
            </p>
          </div>
        : isSuccess(pokemonDetails) ?
          <div>
            <p>Pokemon: {pokemonDetails.name}</p>
            <p>ID: {pokemonDetails.id}</p>
            <p>Height: {pokemonDetails.height}</p>
            <p>Weight: {pokemonDetails.weight}</p>
            <p>
              Types: {pokemonDetails.types?.map(t => t.type.name).join(', ')}
            </p>
            <p>
              Abilities:{' '}
              {pokemonDetails.abilities?.map(a => a.ability.name).join(', ')}
            </p>
          </div>
        : <p>Unknown state...</p>}
      </div>
    </div>
  )
}
