import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { HomePage } from './pages/HomePage'
import { ToolPage } from './pages/ToolPage'
import { HelpPage } from './pages/HelpPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"     element={<HomePage />} />
        <Route path="/tool" element={<ToolPage />} />
        <Route path="/help" element={<HelpPage />} />
        {/* Catch-all: redirect to home */}
        <Route path="*"     element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
