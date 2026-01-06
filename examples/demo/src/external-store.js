import { store } from '../../../src'

export const externalStore = store(Math.floor(Math.random() * 100)).local(
  'external-store'
)
