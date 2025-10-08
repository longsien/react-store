import {
  useStore,
  store,
  isError,
  isSuccess,
  isLoading,
  getErrorMessage,
  getErrorStatus,
} from '../../../src/index.js' // import from your library

// Basic stores
const pokemonIdStore = store(1).local('pokemon-id')

// Async derived store
const pokemonDetailsStore = pokemonIdStore.derive(async id => {
  const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`)
  return response.json()
})

// App

export default function App() {
  // Basic store values
  const [pokemonId, setPokemonId] = useStore(pokemonIdStore)

  // Derived store values
  const [pokemonDetails] = useStore(pokemonDetailsStore)

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>React Store Demo</h1>

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
