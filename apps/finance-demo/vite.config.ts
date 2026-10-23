import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/projects/finance-review-agent/demo/',
  plugins: [vue()],
  build: {
    outDir: '../../dist/projects/finance-review-agent/demo',
    emptyOutDir: true
  }
})
