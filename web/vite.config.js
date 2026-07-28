import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 80,
    strictPort: true,
  },
  preview: {
    port: 80,
    strictPort: true,
    // LB(로드밸런서) 뒤에서 도메인 Host 헤더로 들어오는 요청이 막히지 않도록 허용
    allowedHosts: true,
    // 프론트와 백엔드를 같은 origin으로 묶어서 서빙 (외부 접속 시 mixed content /
    // 브라우저 로컬 localhost 참조 문제를 피하기 위함). 백엔드 라우터 prefix와 일치해야 한다.
    proxy: {
      '/map': 'http://127.0.0.1:8000',
      '/imgPapago': 'http://127.0.0.1:8000',
      '/stt': { target: 'http://127.0.0.1:8000', ws: true },
    },
  },
})
