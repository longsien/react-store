import React from 'react'
import { store, useStore } from '../src/index'
import { render, screen, act } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

describe('Performance Tests', () => {
  // Helper to measure render time
  const measureRenderTime = (Component, props = {}) => {
    const start = performance.now()
    render(<Component {...props} />)
    const end = performance.now()
    return end - start
  }

  it('should measure initial render performance', () => {
    const initialValue = { count: 0, data: 'some data' }
    const myStore = store(initialValue)

    function TestComponent() {
      const [state] = useStore(myStore)
      return <p>{state.count}</p>
    }

    const renderTime = measureRenderTime(TestComponent)
    console.log(`Initial Render Time: ${renderTime.toFixed(3)} ms`)
    expect(renderTime).toBeLessThan(50) // Expect initial render to be fast
  })

  it('should measure targeted update performance', () => {
    const initialValue = { count: 0, data: 'some data', other: 'more data' }
    const myStore = store(initialValue)

    function CounterComponent() {
      const [state, setState] = useStore(myStore)
      return <p data-testid='count'>Count: {state.count}</p>
    }

    function DataComponent() {
      const [state] = useStore(myStore)
      return <p data-testid='data'>Data: {state.data}</p>
    }

    render(
      <>
        <CounterComponent />
        <DataComponent />
      </>
    )

    // Measure update time for a targeted property
    let updateCountTime
    act(() => {
      const start = performance.now()
      myStore.set({ ...myStore.get(), count: 1 })
      const end = performance.now()
      updateCountTime = end - start
    })

    console.log(
      `Targeted Update Time (count): ${updateCountTime.toFixed(3)} ms`
    )
    expect(updateCountTime).toBeLessThan(10) // Expect targeted update to be very fast
    expect(screen.getByTestId('count')).toHaveTextContent('Count: 1')

    // Measure update time for another targeted property
    let updateDataTime
    act(() => {
      const start = performance.now()
      myStore.set({ ...myStore.get(), data: 'new data' })
      const end = performance.now()
      updateDataTime = end - start
    })

    console.log(`Targeted Update Time (data): ${updateDataTime.toFixed(3)} ms`)
    expect(updateDataTime).toBeLessThan(10) // Expect targeted update to be very fast
    expect(screen.getByTestId('data')).toHaveTextContent('Data: new data')
  })

  it('should measure large state update performance', () => {
    const largeArray = Array.from({ length: 1000 }, (_, i) => `item-${i}`)
    const myStore = store({ list: largeArray, status: 'ready' })

    function ListComponent() {
      const [state] = useStore(myStore)
      return (
        <ul>
          {state.list.map(item => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )
    }

    function StatusComponent() {
      const [state] = useStore(myStore)
      return <p>Status: {state.status}</p>
    }

    render(
      <>
        <ListComponent />
        <StatusComponent />
      </>
    )

    // Measure update time for a large array
    let updateListTime
    act(() => {
      const start = performance.now()
      const currentState = myStore.get()
      myStore.set({ ...currentState, list: [...currentState.list, 'new-item'] })
      const end = performance.now()
      updateListTime = end - start
    })

    console.log(`Large List Update Time: ${updateListTime.toFixed(3)} ms`)
    expect(updateListTime).toBeLessThan(50) // Expect large update to be reasonably fast

    // Measure update time for a small property in a large store
    let updateStatusTime
    act(() => {
      const start = performance.now()
      const currentState = myStore.get()
      myStore.set({ ...currentState, status: 'updated' })
      const end = performance.now()
      updateStatusTime = end - start
    })

    console.log(
      `Small Update in Large Store Time: ${updateStatusTime.toFixed(3)} ms`
    )
    expect(updateStatusTime).toBeLessThan(10) // Should still be fast due to selective re-render
  })

  it('should measure store creation overhead', () => {
    const numStores = 1000
    const stores = []

    const createStartTime = performance.now()
    for (let i = 0; i < numStores; i++) {
      stores.push(store({ id: i, value: `value-${i}` }))
    }
    const createEndTime = performance.now()
    const creationTime = createEndTime - createStartTime

    console.log(
      `Time to create ${numStores} stores: ${creationTime.toFixed(3)} ms`
    )
    expect(creationTime).toBeLessThan(100) // Expect creating many stores to be fast
  })

  it('should handle 100 components listening to different paths efficiently', () => {
    const initialData = {}
    for (let i = 0; i < 100; i++) {
      initialData[`item${i}`] = `value${i}`
    }
    const myStore = store(initialData)

    const TestComponent = ({ path }) => {
      const [state] = useStore(myStore)
      return <div data-testid={path}>{state[path]}</div>
    }

    const components = []
    for (let i = 0; i < 100; i++) {
      components.push(<TestComponent key={`item${i}`} path={`item${i}`} />)
    }

    render(<div>{components}</div>)

    for (let i = 0; i < 100; i++) {
      expect(screen.getByTestId(`item${i}`)).toHaveTextContent(`value${i}`)
    }

    const start = performance.now()
    act(() => {
      const currentState = myStore.get()
      const newState = { ...currentState }
      for (let i = 0; i < 100; i++) {
        newState[`item${i}`] = `newValue${i}`
      }
      myStore.set(newState)
    })
    const end = performance.now()
    const updateTime = end - start

    for (let i = 0; i < 100; i++) {
      expect(screen.getByTestId(`item${i}`)).toHaveTextContent(`newValue${i}`)
    }
    console.log(`Update time for 100 components: ${updateTime.toFixed(3)} ms`)
    expect(updateTime).toBeLessThan(100)
  })
})
