import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // Firebase는 따로 묶어 브라우저가 오래 저장해 두게 한다(앱만 바뀌면 다시 받지 않음)
    rollupOptions: {
      output: {
        manualChunks: (id) => (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase') ? 'firebase' : undefined),
      },
    },
    chunkSizeWarningLimit: 700,
  },
})
