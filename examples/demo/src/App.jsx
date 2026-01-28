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
import { useRef } from 'react'
import c from './App.module.scss'

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

// Nested cross-tab sync store to demonstrate reference preservation
const nestedSyncStore = store({
  user: { name: 'John', email: 'john@example.com' },
  settings: { theme: 'dark', notifications: true },
  metadata: { lastUpdated: new Date().toISOString() },
}).local('nested-cross-tab-sync')

// Component with render counter to demonstrate re-renders
function ComponentWithCounter({ children, label, color = '#2196F3' }) {
  const renderCount = useRef(0)
  renderCount.current += 1

  return (
    <div
      className={c.componentWithCounter}
      style={{ borderColor: color }}
    >
      <div
        className={c.renderCounter}
        style={{ backgroundColor: color }}
      >
        Renders: {renderCount.current}
      </div>
      {children}
    </div>
  )
}

// Separate components for each nested path
function UserNameField() {
  const [userName, setUserName] = useStore(nestedSyncStore.user.name)
  return (
    <ComponentWithCounter label="User Name" color="#4CAF50">
      <h3 className={c.fieldTitle}>User Name</h3>
      <div className={c.fieldGroup}>
        <label className={c.fieldLabel}>Name:</label>
        <input
          type="text"
          value={userName}
          onChange={e => setUserName(e.target.value)}
          className={c.fieldInput}
        />
      </div>
    </ComponentWithCounter>
  )
}

function UserEmailField() {
  const userEmail = useStoreValue(nestedSyncStore.user.email)
  return (
    <ComponentWithCounter label="User Email" color="#FF9800">
      <h3 className={c.fieldTitle}>User Email</h3>
      <div>
        <label className={c.fieldLabel}>Email:</label>
        <input
          type="email"
          value={userEmail}
          readOnly
          className={c.fieldInputReadOnly}
        />
        <small className={c.fieldHint}>
          (Read-only - watch the render counter!)
        </small>
      </div>
    </ComponentWithCounter>
  )
}

function ThemeField() {
  const [theme, setTheme] = useStore(nestedSyncStore.settings.theme)
  return (
    <ComponentWithCounter label="Theme" color="#9C27B0">
      <h3 className={c.fieldTitle}>Theme</h3>
      <div className={c.fieldGroup}>
        <label className={c.fieldLabel}>Theme:</label>
        <select
          value={theme}
          onChange={e => setTheme(e.target.value)}
          className={c.fieldSelect}
        >
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="auto">Auto</option>
        </select>
      </div>
    </ComponentWithCounter>
  )
}

function NotificationsField() {
  const [notifications, setNotifications] = useStore(
    nestedSyncStore.settings.notifications,
  )
  return (
    <ComponentWithCounter label="Notifications" color="#F44336">
      <h3 className={c.fieldTitle}>Notifications</h3>
      <div>
        <label className={c.fieldCheckboxLabel}>
          <input
            type="checkbox"
            checked={notifications}
            onChange={e => setNotifications(e.target.checked)}
            className={c.fieldCheckbox}
          />
          <span>Enable Notifications</span>
        </label>
      </div>
    </ComponentWithCounter>
  )
}

function LastUpdatedField() {
  const lastUpdated = useStoreValue(nestedSyncStore.metadata.lastUpdated)
  return (
    <ComponentWithCounter label="Last Updated" color="#00BCD4">
      <h3 className={c.fieldTitle}>Last Updated</h3>
      <p className={c.fieldText}>
        {new Date(lastUpdated).toLocaleString()}
      </p>
      <small className={c.fieldHint}>
        (Read-only - watch the render counter!)
      </small>
    </ComponentWithCounter>
  )
}

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
    <div className={c.container}>
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
      <div className={c.crossTabSection}>
        <h2>Cross-Tab Synchronization (localStorage)</h2>
        <p className={c.crossTabHint}>
          💡 Open this page in multiple tabs to see changes sync automatically!
        </p>
        <div className={c.crossTabContent}>
          <div className={c.crossTabField}>
            <label className={c.crossTabLabel}>Message:</label>
            <input
              type="text"
              value={syncData.message}
              onChange={e =>
                setSyncData({ ...syncData, message: e.target.value })
              }
              className={c.crossTabInput}
            />
          </div>
          <div className={c.crossTabField}>
            <label className={c.crossTabLabel}>Count: {syncData.count}</label>
            <div>
              <button
                onClick={() =>
                  setSyncData({ ...syncData, count: syncData.count - 1 })
                }
                className={c.crossTabButton}
              >
                -
              </button>
              <button
                onClick={() =>
                  setSyncData({ ...syncData, count: syncData.count + 1 })
                }
                className={c.crossTabButtonLast}
              >
                +
              </button>
            </div>
          </div>
          <div className={c.crossTabValues}>
            <p>
              <strong>Current values:</strong>
            </p>
            <p>Message: "{syncData.message}"</p>
            <p>Count: {syncData.count}</p>
          </div>
        </div>
      </div>

      {/* Nested Cross-Tab Sync with Reference Preservation */}
      <div className={c.nestedCrossTabSection}>
        <h2>Nested Cross-Tab Sync (Reference Preservation)</h2>
        <p className={c.nestedCrossTabHint}>
          💡 Each field is a separate component. Watch the render counters - when
          you update one field, only that component re-renders! Open multiple tabs
          to see cross-tab sync in action.
        </p>
        <div className={c.nestedCrossTabContent}>
          <div className={c.nestedCrossTabGrid}>
            <UserNameField />
            <UserEmailField />
            <ThemeField />
            <NotificationsField />
          </div>

          <div className={c.nestedCrossTabLastField}>
            <LastUpdatedField />
          </div>

          <div className={c.nestedCrossTabInstructions}>
            <p className={c.nestedCrossTabInstructionsTitle}>
              How to test reference preservation:
            </p>
            <ul className={c.nestedCrossTabInstructionsList}>
              <li>Update the Name field - only the Name component re-renders</li>
              <li>Update the Theme - only the Theme component re-renders</li>
              <li>
                Email and Last Updated stay at their render count (they don't
                re-render!)
              </li>
              <li>
                Open this page in multiple tabs and update different fields - you'll
                see the same behavior across tabs
              </li>
            </ul>
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
          <div className={c.errorContainer}>
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
