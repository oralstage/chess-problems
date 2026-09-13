import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  build: {
    rollupOptions: {
      // Two pages out of one project: the site, and the board on its own for
      // embedding in someone else's page (dist/embed/index.html -> /embed).
      input: {
        main: resolve(__dirname, 'index.html'),
        embed: resolve(__dirname, 'embed/index.html'),
        // The same board with no name on it, for a page that wants to put its
        // own problem on it (dist/board/index.html -> /board).
        board: resolve(__dirname, 'board/index.html'),
      },
    },
  },
  server: {
    port: 5183,
    host: true,
    strictPort: true,
    proxy: {
      '/api': { target: 'https://chess-problems-staging.pages.dev', changeOrigin: true },
    },
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
  clearScreen: false,
})
