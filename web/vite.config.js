import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 프론트와 백엔드를 같은 origin으로 묶기 위한 프록시 (dev·preview 공통).
// VITE_API_BASE를 빈 값으로 두면(same-origin) 이 프록시가 백엔드로 넘긴다.
// 백엔드 라우터 prefix와 일치해야 한다. /stt는 WebSocket이라 ws:true.
const proxy = {
  '/map': 'http://127.0.0.1:8000',
  '/imgPapago': 'http://127.0.0.1:8000',
  '/stt': { target: 'http://127.0.0.1:8000', ws: true },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 80,
    strictPort: true,
    proxy,
  },
  preview: {
    port: 80,
    strictPort: true,
    // LB(로드밸런서) 뒤에서 도메인 Host 헤더로 들어오는 요청이 막히지 않도록 허용
    allowedHosts: true,
    proxy,
  },
})
