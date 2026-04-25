import path from "path"
import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  server: {
    proxy: {
      // Proxying the socket.io protocol and long-polling
      '/socket.io': {
        target: 'http://127.0.0.1:5003',
        ws: true, // Crucial for WebSockets
        changeOrigin: true,
      },
      // If you add standard REST API routes later (e.g., @app.route('/api/...'))
      '/api': {
        target: 'http://127.0.0.1:5003',
        changeOrigin: true,
      }
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    babel({ 
      presets: [reactCompilerPreset()],
      // Ensure the compiler only runs on your source files
      include: /\.(jsx|tsx|ts|js)$/,
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})