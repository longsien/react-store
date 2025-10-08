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

const pokemonStore = store().async(() =>
  fetch(`https://pokeapi.co/api/v2/pokemon/pikachu`).then(res => res.json())
)

const nestStore = store({ name: 'john', age: 30 })

// App

export default function App() {
  // Basic store values
  const [pokemonId, setPokemonId] = useStore(pokemonIdStore)

  // Derived store values
  const [pokemonDetails] = useStore(pokemonDetailsStore)

  // Async store values
  const [pokemon] = useStore(pokemonStore)

  const [name, setName] = useStore(nestStore.name)
  const [age, setAge] = useStore(nestStore.age)

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>React Store Demo</h1>

      <div>
        <h2>Nested Store</h2>
        <p>Name: {name}</p>
        <p>Age: {age}</p>
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
