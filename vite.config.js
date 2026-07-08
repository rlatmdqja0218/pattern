import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages 프로젝트 페이지(https://<user>.github.io/pattern/) 경로 대응
  base: '/pattern/',
})
