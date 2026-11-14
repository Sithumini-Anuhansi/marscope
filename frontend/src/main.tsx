import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installMarsEllipsoid } from './utils/marsCoordinates'

// Set Cesium's default before React mounts any route that creates a Viewer.
installMarsEllipsoid()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
