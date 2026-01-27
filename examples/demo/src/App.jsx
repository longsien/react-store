import {
  useStore,
  store,
  isError,
  isSuccess,
  isLoading,
  getErrorMessage,
  getErrorStatus,
  useStoreValue,
} from '../../../src/index.js' // import from your library
import { externalStore } from './external-store.js'

const pokemonStore = store().async(() =>
  fetch(`https://pokeapi.co/api/v2/pokemon/pikachu`).then(res => res.json())
)

// Basic stores
const pokemonIdStore = store(1).local('pokemon-id')

// Async derived store
const pokemonDetailsStore = pokemonIdStore.derive(async id => {
  const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`)
  return response.json()
})

const nestStore = store({ name: 'john', age: 30 })

// Cross-tab sync store
const syncStore = store({ message: 'Hello from tab!', count: 0 }).local(
  'cross-tab-sync',
)

// App

export default function App() {
  // Basic store values
  const [pokemonId, setPokemonId] = useStore(pokemonIdStore)
  const external = useStoreValue(externalStore)

  // Derived store values
  const [pokemonDetails] = useStore(pokemonDetailsStore)

  // Async store values
  const [pokemon] = useStore(pokemonStore)

  const [name, setName] = useStore(nestStore.name)
  const [age, setAge] = useStore(nestStore.age)

  // Cross-tab sync store
  const [syncData, setSyncData] = useStore(syncStore)

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>React Store Demo</h1>

      <div>
        <h2>External Store</h2>
        <p>Value: {external}</p>
      </div>

      <div>
        <h2>Nested Store</h2>
        <p>Name: {name}</p>
        <p>Age: {age}</p>
      </div>

      {/* Cross-tab synchronization example */}
      <div
        style={{
          border: '2px solid #4CAF50',
          borderRadius: '8px',
          padding: '15px',
          marginTop: '20px',
          backgroundColor: '#f0f8f0',
        }}
      >
        <h2>Cross-Tab Synchronization (localStorage)</h2>
        <p style={{ fontSize: '14px', color: '#666', fontStyle: 'italic' }}>
          💡 Open this page in multiple tabs to see changes sync automatically!
        </p>
        <div style={{ marginTop: '15px' }}>
          <div style={{ marginBottom: '10px' }}>
            <label style={{ display: 'block', marginBottom: '5px' }}>
              Message:
            </label>
            <input
              type="text"
              value={syncData.message}
              onChange={e =>
                setSyncData({ ...syncData, message: e.target.value })
              }
              style={{
                padding: '8px',
                width: '300px',
                fontSize: '14px',
                border: '1px solid #ccc',
                borderRadius: '4px',
              }}
            />
          </div>
          <div style={{ marginBottom: '10px' }}>
            <label style={{ display: 'block', marginBottom: '5px' }}>
              Count: {syncData.count}
            </label>
            <div>
              <button
                onClick={() =>
                  setSyncData({ ...syncData, count: syncData.count - 1 })
                }
                style={{
                  padding: '8px 16px',
                  marginRight: '10px',
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                -
              </button>
              <button
                onClick={() =>
                  setSyncData({ ...syncData, count: syncData.count + 1 })
                }
                style={{
                  padding: '8px 16px',
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                +
              </button>
            </div>
          </div>
          <div
            style={{
              marginTop: '15px',
              padding: '10px',
              backgroundColor: '#fff',
              borderRadius: '4px',
              border: '1px solid #ddd',
            }}
          >
            <p>
              <strong>Current values:</strong>
            </p>
            <p>Message: "{syncData.message}"</p>
            <p>Count: {syncData.count}</p>
          </div>
        </div>
      </div>

      {/* Async store example */}
      <div>
        <h2>Async Store (Pokemon)</h2>
        {isSuccess(pokemon) && (
          <div>
            <p>Pokemon: {pokemon.name}</p>
            <p>ID: {pokemon.id}</p>
            <p>Height: {pokemon.height}</p>
            <p>Weight: {pokemon.weight}</p>
            <p>Types: {pokemon.types?.map(t => t.type.name).join(', ')}</p>
            <p>
              Abilities:{' '}
              {pokemon.abilities?.map(a => a.ability.name).join(', ')}
            </p>
          </div>
        )}
      </div>

      {/* Async Pokemon Example */}
      <div>
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
        {isLoading(pokemonDetails) && (
          <div>
            <p>Loading Pokemon...</p>
          </div>
        )}
        {isError(pokemonDetails) && (
          <div style={{ color: 'red' }}>
            <p>
              <strong>Error:</strong> {getErrorMessage(pokemonDetails)}
            </p>
            <p>
              <strong>Status:</strong> {getErrorStatus(pokemonDetails)}
            </p>
          </div>
        )}
        {isSuccess(pokemonDetails) && (
          <div>
            <div>
              <img
                src={pokemonDetails.sprites.front_default}
                alt={pokemonDetails.name}
              />
            </div>
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
        )}
      </div>
    </div>
  )
}
