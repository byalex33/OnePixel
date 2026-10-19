import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted so the game works offline and on hosts that sandbox it (itch.io).
import '@fontsource/press-start-2p'
import '@fontsource/vt323'
import '@fontsource/caveat/600.css'
import './index.css'
import App from './ui/App'
import { Runtime } from './app/runtime'
import { RuntimeContext } from './ui/hooks'

const runtime = new Runtime()
// Dev-only handle for debugging / playtesting from the console.
if (import.meta.env.DEV) (window as unknown as { op: Runtime }).op = runtime

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RuntimeContext.Provider value={runtime}>
      <App />
    </RuntimeContext.Provider>
  </StrictMode>,
)
