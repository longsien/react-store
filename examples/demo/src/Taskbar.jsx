import { useEffect, useRef } from 'react'
import { useStoreValue, useStoreSetter } from '../../../src/index.js'
import {
  APPS,
  windowsStore,
  focusedWindowStore,
  activeSpaceStore,
  openWindow,
  bringToFront,
  taskbarInsetStore,
} from './stores.js'
import c from './App.module.scss'

const Taskbar = () => {
  const ref = useRef(null)
  const activeSpace = useStoreValue(activeSpaceStore)
  const focusedId = useStoreValue(focusedWindowStore)
  const setInset = useStoreSetter(taskbarInsetStore)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const inset = Math.max(0, window.innerHeight - el.getBoundingClientRect().top)
      setInset(inset)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [setInset])

  const handleClick = app => {
    const w = windowsStore[app.id].get()
    if (w?.open && w.space === activeSpace) {
      bringToFront(app.id)
    } else {
      openWindow(app.id)
    }
  }

  return (
    <div ref={ref} className={c.taskbar}>
      {APPS.map(app => {
        const w = windowsStore[app.id].get()
        const isOpen = w?.open && w.space === activeSpace
        const isFocused = focusedId === app.id
        return (
          <button
            key={app.id}
            className={`${c.taskbarBtn} ${isFocused ? c.taskbarBtnFocused : ''}`}
            style={{ '--app-color': app.color }}
            onClick={() => handleClick(app)}
            title={app.title}
          >
            <span className={c.taskbarBtnIcon}>{app.icon}</span>
            {isOpen && (
              <span
                className={c.taskbarBtnDot}
                style={{ backgroundColor: isFocused ? app.color : '#9ca3af' }}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}

export default Taskbar
