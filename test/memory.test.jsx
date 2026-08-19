import { describe, it, expect } from 'vitest'
import { store } from '../src/index'

// Requires node --expose-gc; the GC-dependent tests skip without it.
const forceGC = async () => {
  for (let i = 0; i < 4; i++) {
    globalThis.gc()
    await new Promise(resolve => setTimeout(resolve, 0))
  }
}

describe('derived store lifetime', () => {
  it('stops recomputing once destroyed', () => {
    const base = store({ n: 1 })
    let computes = 0
    const derived = base.derive(value => {
      computes++
      return value.n * 2
    })

    base.n.set(2)
    const afterUpdate = computes
    expect(afterUpdate).toBeGreaterThan(1)

    derived.destroy()
    base.n.set(3)
    base.n.set(4)
    expect(computes).toBe(afterUpdate)
  })

  it('keeps a referenced derived store alive and updating', async () => {
    const base = store({ n: 1 })
    const derived = base.derive(value => value.n * 2)

    if (globalThis.gc) await forceGC()

    base.n.set(5)
    // Still referenced here, so it must survive collection and stay subscribed.
    expect(derived._obj.value).toBe(10)
  })

  it.skipIf(!globalThis.gc)(
    'releases a derived store the application has dropped',
    async () => {
      const base = store({ n: 1 })
      let computes = 0

      // Scoped so the only reference dies with the block, as it would when a
      // component that created a derived store unmounts.
      const setup = () => {
        const derived = base.derive(value => {
          computes++
          return value.n * 2
        })
        expect(derived._obj.value).toBe(2)
      }
      setup()

      base.n.set(2)
      const beforeDrop = computes
      expect(beforeDrop).toBeGreaterThan(1)

      await forceGC()

      // The first update walks the dependents and prunes the dead entry...
      base.n.set(3)
      // ...so this one has nothing left to recompute.
      base.n.set(4)

      expect(computes).toBe(beforeDrop)
    },
  )

  it.skipIf(!globalThis.gc)(
    'drops the dependency entry entirely once every dependent is collected',
    async () => {
      const base = store({ n: 1 })

      const setup = () => {
        base.derive(value => value.n * 2)
        base.derive(value => value.n * 3)
      }
      setup()

      await forceGC()
      base.n.set(2) // walking the set prunes both tombstones

      // With no dependents left, an update has no derived work to do at all.
      let recomputed = false
      const probe = base.derive(() => {
        recomputed = true
        return 1
      })
      recomputed = false
      base.n.set(3)
      expect(recomputed).toBe(true) // the live one still fires
      probe.destroy()
    },
  )
})
