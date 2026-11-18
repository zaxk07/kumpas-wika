import { readFileSync } from 'node:fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Pin the hosted WASM fileset to the exact installed @mediapipe/tasks-vision version.
const mpPkg = JSON.parse(
  readFileSync(new URL('./node_modules/@mediapipe/tasks-vision/package.json', import.meta.url), 'utf8'),
) as { version: string }

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // MediaPipe runs in a module worker that lazy-imports the tasks-vision bundle.
  worker: { format: 'es' },
  build: {
    rolldownOptions: {
      output: {
        // Long-lived vendor chunks: React and motion change far less often than the app.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'motion', test: /node_modules[\\/](motion|motion-dom|motion-utils|framer-motion)[\\/]/ },
          ],
        },
      },
    },
  },
  define: {
    __MP_VERSION__: JSON.stringify(mpPkg.version),
  },
})
