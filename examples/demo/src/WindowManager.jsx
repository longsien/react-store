import { useStoreValue } from '../../../src/index.js'
import { windowIdsStore } from './stores.js'
import Window from './Window.jsx'
import c from './App.module.scss'

const WindowManager = () => {
  const windowIds = useStoreValue(windowIdsStore)
  return (
    <div className={c.windowManager}>
      {windowIds.map(id => (
        <Window key={id} id={id} />
      ))}
    </div>
  )
}

export default WindowManager
