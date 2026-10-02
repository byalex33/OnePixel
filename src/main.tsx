import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
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
