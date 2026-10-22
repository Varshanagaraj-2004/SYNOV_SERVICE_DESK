import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const apiProxy = {
  "/api": {
    target: "http://localhost:5050",
    changeOrigin: true,
    xfwd: true,
    timeout: 0,
    proxyTimeout: 0,
  },
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    proxy: apiProxy,
  },
  preview: {
    host: true,
    port: 5173,
    strictPort: true,
    proxy: apiProxy,
  },
})