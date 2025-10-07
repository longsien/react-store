import {
  useStore,
  store,
  isError,
  isSuccess,
  isLoading,
  getErrorMessage,
  getErrorStatus,
} from '../../../src/index.js' // import from your library
import { useEffect } from 'react'

const counterStore = store(0)
const pokeStore = store('default initial value while loading maybe?').async(
  () =>
    fetch('https://pokeapi.co/api/v2/pokemon/pikachu').then(res => res.json())
)

// Test error handling with invalid URL
const errorStore = store('Loading...').async(() =>
  fetch('https://invalid-url-that-will-fail.com/api/data').then(res =>
    res.json()
  )
)

// Test nested storage methods
const userStore = store({
  user: {
    name: 'John',
    settings: { theme: 'dark', count: 0 },
  },
})

// This should now work without throwing an error!
const themeStore = userStore.user.settings.theme.local('user-theme')
const countStore = userStore.user.settings.count.session('user-count')

export default function App() {
  const [count, setCount] = useStore(counterStore)
  const [pokemon, setPokemon] = useStore(pokeStore)
  const [errorData, setErrorData] = useStore(errorStore)

  // Test nested storage stores
  const [theme, setTheme] = useStore(themeStore)
  const [userCount, setUserCount] = useStore(countStore)

  useEffect(() => {
    console.log('Pokemon data:', pokemon)
  }, [pokemon])

  useEffect(() => {
    console.log('Error data:', errorData)
  }, [errorData])

  // Test your library here
  return (
    <div>
      <h1>Demo App</h1>
      <div>
        <h2>Counter: {count}</h2>
        <button onClick={() => setCount(count + 1)}>Increment</button>
        <button onClick={() => setCount(count - 1)}>Decrement</button>
      </div>

      <div>
        <h2>Async Store Test</h2>
        {isError(pokemon) ? (
          <div style={{ color: 'red' }}>
            <p>
              <strong>Error:</strong> {getErrorMessage(pokemon)}
            </p>
            <p>
              <strong>Status:</strong> {getErrorStatus(pokemon)}
            </p>
          </div>
        ) : isSuccess(pokemon) ? (
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
        ) : isLoading(pokemon) ? (
          <p>Pokemon: {pokemon}</p>
        ) : (
          <p>Loading...</p>
        )}
      </div>

      <div>
        <h2>Error Handling Test</h2>
        {isError(errorData) ? (
          <div
            style={{
              color: 'red',
              border: '1px solid red',
              padding: '10px',
              margin: '10px 0',
            }}>
            <p>
              <strong>Error:</strong> {getErrorMessage(errorData)}
            </p>
            <p>
              <strong>Status:</strong> {getErrorStatus(errorData)}
            </p>
          </div>
        ) : isLoading(errorData) ? (
          <p>Loading error test...</p>
        ) : (
          <p>Unexpected state: {JSON.stringify(errorData)}</p>
        )}
      </div>

      <div>
        <h2>Nested Storage Test</h2>
        <p>Theme: {theme} (persisted to localStorage)</p>
        <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          Toggle Theme
        </button>

        <p>User Count: {userCount} (persisted to sessionStorage)</p>
        <button onClick={() => setUserCount(userCount + 1)}>+</button>
        <button onClick={() => setUserCount(userCount - 1)}>-</button>
      </div>
    </div>
  )
}
