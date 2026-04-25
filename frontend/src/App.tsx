import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Tool from './pages/Tool'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/tool" element={<Tool />} />
      {/* Catch-all for 404 pages */}
      <Route path="*" element={<h1>404 Not Found</h1>} />
    </Routes>
  )
}
export default App;