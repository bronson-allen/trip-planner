import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Expose MAPBOX_* so client code can read MAPBOX_API_KEY (public token only).
  envPrefix: ['VITE_', 'MAPBOX_'],
  test: {
    include: ['src/**/*.test.ts'],
  },
})

