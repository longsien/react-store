import { useState } from 'react'
import { useStoreValue, useStoreSetter } from '../../../src/index.js'
import {
  spacesStore,
  activeSpaceStore,
  spacesViewStore,
  windowsStore,
} from './stores.js'
import c from './App.module.scss'

let spaceCounter = 1

const Spaces = () => {
  const isOpen = useStoreValue(spacesViewStore)
  const setIsOpen = useStoreSetter(spacesViewStore)
  const spaces = useStoreValue(spacesStore)
  const activeSpace = useStoreValue(activeSpaceStore)
  const setActiveSpace = useStoreSetter(activeSpaceStore)

  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')

  if (!isOpen) return null

  const pickSpace = id => {
    setActiveSpace(id)
    setIsOpen(false)
  }

  const addSpace = () => {
    spaceCounter++
    const newSpace = { id: `space-${Date.now()}`, name: `Space ${spaceCounter}` }
    spacesStore.set(prev => [...prev, newSpace])
    pickSpace(newSpace.id)
  }

  const removeSpace = id => {
    if (spaces.length <= 1) return
    spacesStore.set(prev => prev.filter(s => s.id !== id))
    if (activeSpace === id) {
      const remaining = spaces.find(s => s.id !== id)
      if (remaining) setActiveSpace(remaining.id)
    }
  }

  const renameSpace = (id, name) => {
    spacesStore.set(prev => prev.map(s => (s.id === id ? { ...s, name } : s)))
    setEditingId(null)
  }

  const windows = windowsStore.get()

  return (
    <div className={c.spacesOverlay} onClick={() => setIsOpen(false)}>
      <div className={c.spacesShell} onClick={e => e.stopPropagation()}>
        <div className={c.spacesGrid}>
          {spaces.map(space => {
            const spaceWindows = Object.values(windows).filter(
              w => w.open && w.space === space.id,
            )
            return (
              <div
                key={space.id}
                className={`${c.spaceCard} ${space.id === activeSpace ? c.spaceCardActive : ''}`}
                onClick={() => pickSpace(space.id)}
              >
                <div className={c.spaceCardHeader}>
                  {editingId === space.id ? (
                    <input
                      className={c.spaceRenameInput}
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onBlur={() => renameSpace(space.id, editName)}
                      onKeyDown={e => e.key === 'Enter' && renameSpace(space.id, editName)}
                      onClick={e => e.stopPropagation()}
                      autoFocus
                    />
                  ) : (
                    <span className={c.spaceCardName}>{space.name}</span>
                  )}
                  <div className={c.spaceCardActions}>
                    <button
                      className={c.spaceActionBtn}
                      onClick={e => {
                        e.stopPropagation()
                        setEditingId(space.id)
                        setEditName(space.name)
                      }}
                      title="Rename"
                    >
                      ✏️
                    </button>
                    {spaces.length > 1 && (
                      <button
                        className={c.spaceActionBtn}
                        onClick={e => {
                          e.stopPropagation()
                          removeSpace(space.id)
                        }}
                        title="Remove"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </div>
                <div className={c.spaceCardPreview}>
                  {spaceWindows.length === 0 ? (
                    <span className={c.spaceCardEmpty}>Empty</span>
                  ) : (
                    spaceWindows.map(w => (
                      <div
                        key={w.id}
                        className={c.spaceCardWindow}
                        style={{ borderLeftColor: w.color || '#999' }}
                      >
                        {w.icon} {w.title}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )
          })}
          <button className={c.spaceAddCard} onClick={addSpace}>
            <span>＋</span>
            <span>New Space</span>
          </button>
        </div>
      </div>
    </div>
  )
}

export default Spaces
