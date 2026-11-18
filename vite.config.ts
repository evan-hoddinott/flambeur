// dev only: vite serves the client, the game server (pnpm server, port 8787) handles /api and /ws
import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    // keep the browser's Host header: the server refuses an Origin that doesn't match it
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false },
      '/ws': { target: 'ws://127.0.0.1:8787', ws: true, changeOrigin: false },
    },
  },
})
