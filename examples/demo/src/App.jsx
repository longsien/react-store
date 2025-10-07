import { useStore, store } from '../../../src/index.js' // import from your library
import { useEffect } from 'react'

const counterStore = store(0)
const pokeStore = store()

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

  // Test nested storage stores
  const [theme, setTheme] = useStore(themeStore)
  const [userCount, setUserCount] = useStore(countStore)

  useEffect(() => {
    fetch('https://pokeapi.co/api/v2/pokemon/1')
      .then(res => res.json())
      .then(data => setPokemon(data))
  }, [])

  useEffect(() => {
    console.log(pokemon)
  }, [pokemon])

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
