import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <script src="/static/pako.min.js"></script>
    <script type="module" src="/static/client.js"></script>
    <App />
  </StrictMode>,
)
