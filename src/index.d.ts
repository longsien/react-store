/**
 * @fileoverview Type definitions for @longsien/react-store
 * A lightweight, proxy-based global state management library for React
 */

import { Dispatch, SetStateAction } from 'react'

/**
 * A function that updates state, similar to React's setState.
 * Can accept either a new value or an updater function.
 *
 * @template T The type of the state value
 * @param value Either a new value of type T, or a function that takes the current value and returns a new value
 */
export type StoreSetter<T> = Dispatch<SetStateAction<T>>

/**
 * Core store interface that provides access to state value and mutation methods.
 * Uses JavaScript Proxy to enable nested property access with automatic path tracking.
 *
 * @template T The type of the stored value
 */
export interface Store<T> {
  /** Internal property - the tracked path to this nested value */
  readonly _path: string[]

  /** Internal property - reference to the root store object */
  readonly _obj: any

  /**
   * Get the current value of this store synchronously.
   * Useful for accessing state outside React components.
   *
   * @returns The current value stored at this path
   * @example
   * ```ts
   * const userStore = store({ name: 'John', age: 30 })
   * const currentUser = userStore.get() // { name: 'John', age: 30 }
   * const currentName = userStore.name.get() // 'John'
   * ```
   */
  get(): T

  /**
   * Update the value of this store synchronously.
   * Triggers re-renders for all subscribed components.
   *
   * @param value Either a new value or an updater function
   * @example
   * ```ts
   * const counterStore = store(0)
   *
   * // Set directly
   * counterStore.set(5)
   *
   * // Use updater function
   * counterStore.set(prev => prev + 1)
   * ```
   */
  set(value: SetStateAction<T>): void

  /**
   * Create a localStorage-backed version of this store.
   * Data is automatically persisted and restored across browser sessions.
   * Can be called on both root stores and nested properties.
   *
   * @param key The localStorage key to use for persistence
   * @returns A new store instance backed by localStorage
   * @example
   * ```ts
   * const settingsStore = store({ theme: 'dark' }).local('app-settings')
   * const userThemeStore = store({ user: { theme: 'light' } }).user.theme.local('user-theme')
   * ```
   */
  local(key: string): Store<T>

  /**
   * Create a sessionStorage-backed version of this store.
   * Data is automatically persisted for the current browser session only.
   * Can be called on both root stores and nested properties.
   *
   * @param key The sessionStorage key to use for persistence
   * @returns A new store instance backed by sessionStorage
   * @example
   * ```ts
   * const tempStore = store({ items: [] }).session('temp-data')
   * const userTempStore = store({ user: { temp: 'data' } }).user.temp.session('user-temp')
   * ```
   */
  session(key: string): Store<T>

  /**
   * Load data asynchronously into this store.
   * The async function is called immediately and the result updates the store.
   * On error, sets an error state object with error details.
   * Returns the store proxy for chaining.
   *
   * @param asyncFn A function that returns a Promise with the data to load
   * @returns The store proxy for method chaining
   * @example
   * ```ts
   * const pokeStore = store('Loading...').async(() =>
   *   fetch('https://pokeapi.co/api/v2/pokemon/1').then(res => res.json())
   * )
   *
   * // Error handling
   * const [data, setData] = useStore(pokeStore)
   * if (data?.error) {
   *   console.log('Error:', data.message, 'Status:', data.status)
   * }
   * ```
   */
  async(asyncFn: () => Promise<T>): Store<T>
}

/**
 * Proxy type that enables nested property access on stores.
 * Each property access creates a new Store instance scoped to that path.
 *
 * @template T The type of the object being proxied
 */
export type StoreProxy<T> = Store<T> & {
  [K in keyof T]: T[K] extends object ? StoreProxy<T[K]> : Store<T[K]>
}

/**
 * Create a new in-memory store with the given initial value.
 * The store persists for the lifetime of the application session.
 *
 * @template T The type of the initial value
 * @param initialValue The initial value to store
 * @returns A Store proxy that enables nested property access
 * @example
 * ```ts
 * // Simple value store
 * const counterStore = store(0)
 *
 * // Object store with nested access
 * const userStore = store({
 *   name: 'John',
 *   profile: { email: 'john@example.com' }
 * })
 *
 * // Array store
 * const todosStore = store([{ id: 1, text: 'Learn React' }])
 * ```
 */
export function store<T>(initialValue: T): StoreProxy<T>

/**
 * React hook that provides both the current value and a setter function.
 * Components automatically subscribe to changes at the specific path accessed.
 * Returns a tuple similar to React's useState hook.
 *
 * @template T The type of the stored value
 * @param store The store or nested store property to subscribe to
 * @returns A tuple of [currentValue, setterFunction]
 * @example
 * ```ts
 * function UserProfile() {
 *   const [user, setUser] = useStore(userStore)
 *   const [name, setName] = useStore(userStore.name)
 *   const [email, setEmail] = useStore(userStore.profile.email)
 *
 *   return (
 *     <div>
 *       <input
 *         value={name}
 *         onChange={(e) => setName(e.target.value)}
 *       />
 *       <input
 *         value={email}
 *         onChange={(e) => setEmail(e.target.value)}
 *       />
 *     </div>
 *   )
 * }
 * ```
 */
export function useStore<T>(store: Store<T>): [T, StoreSetter<T>]

/**
 * React hook that provides only the current value (read-only).
 * Use this when you only need to read the value and don't need to update it.
 * Avoids creating unnecessary setter functions.
 *
 * @template T The type of the stored value
 * @param store The store or nested store property to subscribe to
 * @returns The current value
 * @example
 * ```ts
 * function UserDisplay() {
 *   const user = useStoreValue(userStore)
 *   const name = useStoreValue(userStore.name)
 *
 *   return <div>Hello, {name}!</div>
 * }
 * ```
 */
export function useStoreValue<T>(store: Store<T>): T

/**
 * React hook that provides only the setter function.
 * Use this when you only need to update the value and don't need the current value.
 * Prevents unnecessary re-renders when the value changes.
 *
 * @template T The type of the stored value
 * @param store The store or nested store property to get the setter for
 * @returns The setter function
 * @example
 * ```ts
 * function UserActions() {
 *   const setUser = useStoreSetter(userStore)
 *   const setName = useStoreSetter(userStore.name)
 *
 *   return (
 *     <button onClick={() => setName('New Name')}>
 *       Update Name
 *     </button>
 *   )
 * }
 * ```
 */
export function useStoreSetter<T>(store: Store<T>): StoreSetter<T>

// Legacy API (deprecated but maintained for backward compatibility)

/**
 * @deprecated Use `store.get()` instead. Will be removed in v2.
 *
 * Get the current value of a store outside React components.
 *
 * @template T The type of the stored value
 * @param store The store to get the value from
 * @returns The current value
 */
export function getStore<T>(store: Store<T>): T

/**
 * @deprecated Use `store.set()` instead. Will be removed in v2.
 *
 * Update a store value outside React components.
 *
 * @template T The type of the stored value
 * @param store The store to update
 * @param value The new value or updater function
 */
export function setStore<T>(store: Store<T>, value: SetStateAction<T>): void

/**
 * @deprecated Use `store(initialValue).session(key)` instead. Will be removed in v2.
 *
 * Create a store backed by sessionStorage.
 *
 * @template T The type of the initial value
 * @param key The sessionStorage key
 * @param initialValue The initial value if nothing is stored
 * @returns A Store proxy backed by sessionStorage
 */
export function storeSession<T>(key: string, initialValue: T): StoreProxy<T>

/**
 * @deprecated Use `store(initialValue).local(key)` instead. Will be removed in v2.
 *
 * Create a store backed by localStorage.
 *
 * @template T The type of the initial value
 * @param key The localStorage key
 * @param initialValue The initial value if nothing is stored
 * @returns A Store proxy backed by localStorage
 */
export function storeLocal<T>(key: string, initialValue: T): StoreProxy<T>

// Type augmentation for dynamic property access on arrays and objects
declare global {
  interface Array<T> {
    [index: number]: T
  }
}

/**
 * Error state object returned when async operations fail
 */
export interface ErrorState {
  error: true
  message: string
  status: string
  originalError: any
}

/**
 * Check if data represents an error state
 * @param data The data to check
 * @returns True if data is an error state
 * @example
 * ```ts
 * if (isError(pokemon)) {
 *   console.log('Error:', pokemon.message)
 * }
 * ```
 */
export function isError(data: any): data is ErrorState

/**
 * Check if data represents a successful result
 * @param data The data to check
 * @returns True if data is not an error state
 * @example
 * ```ts
 * if (isSuccess(pokemon)) {
 *   console.log('Success:', pokemon.name)
 * }
 * ```
 */
export function isSuccess(data: any): boolean

/**
 * Check if data represents a loading state
 * @param data The data to check
 * @returns True if data is in loading state
 * @example
 * ```ts
 * if (isLoading(pokemon)) {
 *   return <div>Loading...</div>
 * }
 * ```
 */
export function isLoading(data: any): boolean

/**
 * Get error message from data if it's an error state
 * @param data The data to check
 * @returns Error message or null
 * @example
 * ```ts
 * const errorMsg = getErrorMessage(pokemon)
 * if (errorMsg) console.log('Error:', errorMsg)
 * ```
 */
export function getErrorMessage(data: any): string | null

/**
 * Get error status from data if it's an error state
 * @param data The data to check
 * @returns Error status or null
 * @example
 * ```ts
 * const status = getErrorStatus(pokemon)
 * if (status) console.log('Status:', status)
 * ```
 */
export function getErrorStatus(data: any): string | null

/**
 * Additional type utilities for better IntelliSense support
 */
export namespace StoreTypes {
  /**
   * Extract the type of a nested property from a store
   * @example
   * ```ts
   * type UserStore = StoreTypes.StoreType<typeof userStore>
   * type UserName = StoreTypes.NestedType<typeof userStore.name>
   * ```
   */
  export type StoreType<T> = T extends Store<infer U> ? U : never

  /**
   * Type for nested store properties
   */
  export type NestedType<T> = T extends Store<infer U> ? U : never

  /**
   * Type for store setter functions
   */
  export type SetterType<T> = T extends Store<infer U> ? StoreSetter<U> : never
}
