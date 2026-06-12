import { useEffect, useRef } from 'react'
import { useStoreValue, useStoreSetter } from '../../../src/index.js'
import { spacesViewStore, activeSpaceStore, spacesStore, topNavInsetStore } from './stores.js'
import WindowManager from './WindowManager.jsx'
import Taskbar from './Taskbar.jsx'
import Spaces from './Spaces.jsx'
import c from './App.module.scss'

export default function App() {
  const navRef = useRef(null)
  const setIsOpen = useStoreSetter(spacesViewStore)
  const setTopNavInset = useStoreSetter(topNavInsetStore)
  const activeSpace = useStoreValue(activeSpaceStore)
  const spaces = useStoreValue(spacesStore)
  const activeName = spaces.find(s => s.id === activeSpace)?.name || 'Default'

  useEffect(() => {
    const el = navRef.current
    if (!el) return
    const update = () => setTopNavInset(el.getBoundingClientRect().height)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [setTopNavInset])

  return (
    <div className={c.shell}>
      {/* Top nav bar */}
      <nav ref={navRef} className={c.topNav}>
        <div className={c.topNavLeft}>
          <button className={c.spacesBtn} onClick={() => setIsOpen(true)}>
            <span className={c.spacesBtnGrid}>
              <span /><span /><span /><span />
            </span>
            <span className={c.spacesBtnLabel}>{activeName}</span>
          </button>
        </div>
        <div className={c.topNavCenter}>
          <span className={c.topNavTitle}>react-store</span>
        </div>
        <div className={c.topNavRight}>
          <span className={c.topNavClock}>
            <Clock />
          </span>
        </div>
      </nav>

      {/* Window area */}
      <WindowManager />

      {/* Taskbar */}
      <Taskbar />

      {/* Spaces overlay */}
      <Spaces />
    </div>
  )
}

function Clock() {
  const now = new Date()
  return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
