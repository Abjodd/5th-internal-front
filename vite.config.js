import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // Dependencies live in their own chunks, so editing app code never
        // invalidates them — and anything added later lands in `vendor` without
        // touching this config. three.js and motion are named separately
        // because they are the two large ones; three.js in particular would
        // otherwise be bundled into the Login page that is its only consumer.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('/node_modules/three/')) return 'three'
          if (/\/node_modules\/(motion|framer-motion|motion-dom|motion-utils)\//.test(id)) return 'motion'
          return 'vendor'
        },
      },
    },
  },
})
