import { memo, useRef, useCallback, useEffect, useReducer } from 'react'
import { createPortal } from 'react-dom'
import { useStore, useStoreValue } from '../../../src/index.js'
import {
  windowsStore,
  bringToFront,
  closeWindow,
  getWindowFocusStore,
  activeSpaceStore,
  topNavInsetStore,
  taskbarInsetStore,
} from './stores.js'
import c from './App.module.scss'

// ─── Constraints (matches studyOS window-constraints.js) ─────

const MIN_SIZE = { width: 220, height: 160 }
const DRAG_THRESHOLD = 5

const constrainPosition = (x, y, width, height) => {
  const topNav = topNavInsetStore.get()
  const taskbar = taskbarInsetStore.get()
  const newPos = { x, y }
  if (x < 0) newPos.x = 0
  else if (x + width > window.innerWidth) newPos.x = window.innerWidth - width
  if (y < topNav) newPos.y = topNav
  else if (y + height > window.innerHeight - taskbar)
    newPos.y = window.innerHeight - taskbar - height
  return newPos
}

const constrainStoredSize = (width, height) => ({
  width: Math.max(MIN_SIZE.width, width),
  height: Math.max(MIN_SIZE.height, height),
})

const computeDisplaySize = size => {
  const topNav = topNavInsetStore.get()
  const taskbar = taskbarInsetStore.get()
  const availableH = window.innerHeight - topNav - taskbar
  return {
    width: Math.max(MIN_SIZE.width, Math.min(size.width, window.innerWidth)),
    height: Math.max(MIN_SIZE.height, Math.min(size.height, availableH)),
  }
}

const computeDisplayPosition = (pos, size) => {
  const displaySize = computeDisplaySize(size)
  return constrainPosition(pos.x, pos.y, displaySize.width, displaySize.height)
}

// ─── Window component ────────────────────────────

const Window = memo(({ id }) => {
  const _window = useStoreValue(windowsStore[id])
  const [pos, setPos] = useStore(windowsStore[id].position)
  const [size, setSize] = useStore(windowsStore[id].size)
  const zIndex = useStoreValue(windowsStore[id].zIndex)
  const isFocused = useStoreValue(getWindowFocusStore(id))
  const activeSpace = useStoreValue(activeSpaceStore)

  const renderCount = useRef(0)
  renderCount.current++

  // Re-render on viewport resize so display clamping stays correct
  const [, bump] = useReducer(n => n + 1, 0)
  useEffect(() => {
    const h = () => bump()
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  // Drag — stores logical position, display is computed on-the-fly
  const handleDragStart = useCallback(
    e => {
      if (e.button !== 0) return
      e.preventDefault()
      bringToFront(id)

      // Sync stored values to display values so drag starts from visible position
      const displaySize = computeDisplaySize(size)
      const displayPos = computeDisplayPosition(pos, size)
      const needsSync =
        displayPos.x !== pos.x ||
        displayPos.y !== pos.y ||
        displaySize.width !== size.width ||
        displaySize.height !== size.height
      if (needsSync) {
        setPos(displayPos)
        if (displaySize.width !== size.width || displaySize.height !== size.height)
          setSize(displaySize)
      }

      const startPos = needsSync ? displayPos : pos
      const startClient = { x: e.clientX, y: e.clientY }
      const hasMoved = { current: false }

      const onMove = ev => {
        const dx = ev.clientX - startClient.x
        const dy = ev.clientY - startClient.y
        if (!hasMoved.current && Math.sqrt(dx * dx + dy * dy) <= DRAG_THRESHOLD)
          return
        hasMoved.current = true
        const nextPos = constrainPosition(
          startPos.x + dx,
          startPos.y + dy,
          displaySize.width,
          displaySize.height,
        )
        setPos(nextPos)
      }
      const onUp = () => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [id, pos, size, setPos, setSize],
  )

  // Resize — stores logical size (can exceed viewport), minimum enforced
  const handleResizeStart = useCallback(
    e => {
      if (e.button !== 0) return
      e.preventDefault()
      bringToFront(id)

      // Sync stored values to display values
      const displaySize = computeDisplaySize(size)
      const displayPos = computeDisplayPosition(pos, size)
      const needsSync =
        displaySize.width !== size.width ||
        displaySize.height !== size.height ||
        displayPos.x !== pos.x ||
        displayPos.y !== pos.y
      if (needsSync) {
        setPos(displayPos)
        setSize(displaySize)
      }

      const sx = e.clientX
      const sy = e.clientY
      const sw = displaySize.width
      const sh = displaySize.height

      const onMove = ev => {
        setSize(
          constrainStoredSize(sw + ev.clientX - sx, sh + ev.clientY - sy),
        )
      }
      const onUp = () => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [id, pos, size, setSize, setPos],
  )

  if (!_window || !_window.open || _window.space !== activeSpace) return null

  // Compute display values — stored values survive viewport resizes
  const displayPos = computeDisplayPosition(pos, size)
  const displaySize = computeDisplaySize(size)

  return createPortal(
    <div
      className={c.window}
      style={{
        left: displayPos.x,
        top: displayPos.y,
        width: displaySize.width,
        height: displaySize.height,
        zIndex,
        borderColor: isFocused ? _window.color : '#d1d5db',
      }}
      onMouseDown={() => bringToFront(id)}
    >
      <div
        className={c.windowColour}
        style={{ backgroundColor: isFocused ? _window.color : '#d1d5db' }}
      />
      <div className={c.windowHeader}>
        <div className={c.windowDragHandle} onMouseDown={handleDragStart}>
          <span className={c.windowIcon}>{_window.icon}</span>
          <span className={c.windowTitle}>{_window.title}</span>
          <span className={c.windowRenderBadge}>
            Renders: {renderCount.current}
          </span>
        </div>
        <div className={c.windowButtons}>
          <button
            className={c.windowCloseBtn}
            onClick={() => closeWindow(id)}
            title="Close"
          >
            ✕
          </button>
        </div>
      </div>
      <div className={c.windowBody}>
        <div className={c.windowInfo}>
          <span>
            Position: ({Math.round(pos.x)}, {Math.round(pos.y)})
          </span>
          <span>
            Size: {Math.round(size.width)} × {Math.round(size.height)}
          </span>
          <span>Z-Index: {zIndex}</span>
        </div>
      </div>
      <div className={c.resizeHandle} onMouseDown={handleResizeStart} />
    </div>,
    document.body,
  )
})

export default Window
