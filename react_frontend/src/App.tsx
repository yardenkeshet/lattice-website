import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { HomePage } from './pages/HomePage'
import { ToolPage } from './pages/ToolPage'
import { HelpPage } from './pages/HelpPage'
import { HelpFullPage } from './pages/HelpFullPage'
import { isWheelZoomGesture, isKeyboardZoomShortcut } from './lib/browserZoomGuard'

export default function App() {
  // Ctrl+scroll / pinch-to-zoom and Ctrl +/-/0 change the *browser's* page
  // zoom, not anything in our UI. Chrome remembers that zoom level per
  // origin, so a stray nudge (even one meant for another tab) sticks on
  // every future visit and our fixed layout renders warped at non-100%
  // zoom. Block the gesture everywhere on the site so it can never engage.
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (isWheelZoomGesture(e)) e.preventDefault()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (isKeyboardZoomShortcut(e)) e.preventDefault()
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"          element={<HomePage />} />
        <Route path="/tool"      element={<ToolPage />} />
        <Route path="/help"      element={<HelpPage />} />
        <Route path="/help/full" element={<HelpFullPage />} />
        {/* Catch-all: redirect to home */}
        <Route path="*"     element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
