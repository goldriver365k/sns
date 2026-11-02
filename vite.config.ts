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
    // 상품 사진 편집의 배경 제거 AI 라이브러리(약 900KB)는 그 화면에서만 따로 내려받으므로 기준을 그만큼 둔다
    chunkSizeWarningLimit: 950,
  },
})
