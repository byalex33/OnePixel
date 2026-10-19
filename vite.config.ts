import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Relative URLs so the build runs from any folder (itch.io serves it from a subpath).
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    target: 'es2022',
    sourcemap: false,
  },
})
