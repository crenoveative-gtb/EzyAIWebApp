import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 10 minutes – enough for yt-dlp download + transcription + summarisation
const PROXY_TIMEOUT_MS = 10 * 60 * 1000;

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:4300',
        changeOrigin: true,
        secure: false,
        timeout: PROXY_TIMEOUT_MS,
        proxyTimeout: PROXY_TIMEOUT_MS,
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (_proxyReq, req, _res) => {
            // Keep the incoming socket alive for long-running requests
            if (req.socket) {
              req.socket.setTimeout(PROXY_TIMEOUT_MS);
            }
          });
          proxy.on('error', (err, _req, res) => {
            console.error('[vite-proxy] proxy error:', err.message);
            if (res && 'writeHead' in res && !res.headersSent) {
              (res as import('http').ServerResponse).writeHead(502, { 'Content-Type': 'application/json' });
              (res as import('http').ServerResponse).end(JSON.stringify({
                success: false,
                error: `Proxy error: ${err.message}`
              }));
            }
          });
        }
      }
    }
  }
});