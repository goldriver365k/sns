// 엑셀·워드 문서 도구: 결과물은 HTML 파일 하나 (스크립트·스타일을 모두 안에 넣음)
// SNS 사이트와는 따로 만든다. 만들기: 저장소 최상위에서 npm run build:office
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 고칠 때마다 올린다. 화면과 파일 이름에 붙어 예전 파일과 헷갈리지 않게 한다
const VERSION = '2'
const OUT_NAME = `엑셀워드도구-v${VERSION}.html`
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** 만들어진 JS·CSS 파일을 HTML 안으로 넣고 따로 된 파일은 지운다 (파일을 더블클릭해서 열 수 있게) */
function singleFile(): Plugin {
  return {
    name: 'single-file',
    enforce: 'post',
    generateBundle(_, bundle) {
      const html = Object.values(bundle).find((f) => f.type === 'asset' && f.fileName.endsWith('.html'))
      if (!html || html.type !== 'asset') return
      let src = String(html.source)
      for (const f of Object.values(bundle)) {
        if (f.type === 'chunk') {
          const code = f.code.replace(/<\/script/gi, '<\\/script')
          src = src.replace(new RegExp(`<script[^>]*src="[^"]*${esc(f.fileName)}"[^>]*></script>`), () => `<script type="module">${code}</script>`)
          delete bundle[f.fileName]
        } else if (f.fileName.endsWith('.css')) {
          src = src.replace(new RegExp(`<link[^>]*href="[^"]*${esc(f.fileName)}"[^>]*>`), () => `<style>${String(f.source)}</style>`)
          delete bundle[f.fileName]
        }
      }
      html.source = src
      html.fileName = OUT_NAME
    },
  }
}

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  plugins: [react(), tailwindcss(), singleFile()],
  define: { __APP_VERSION__: JSON.stringify(VERSION) },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    cssCodeSplit: false,
    modulePreload: false,
    chunkSizeWarningLimit: 1000,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
})
