/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

/**
 * Strict Content-Security-Policy for the production preview server.
 * Not applied to `vite dev`: React Fast Refresh injects an inline script there.
 * Mirror these headers on the production web server / CDN.
 */
function securityHeaders(streamUrl: string | undefined): Record<string, string> {
  let streamOrigin = ''
  try {
    if (streamUrl) streamOrigin = new URL(streamUrl).origin.replace(/^http/, 'ws')
  } catch {
    streamOrigin = ''
  }
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    `connect-src 'self' ${streamOrigin}`.trim(),
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'none'",
  ].join('; ')
  return {
    'Content-Security-Policy': csp,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    plugins: [react()],
    preview: { headers: securityHeaders(env.VITE_STREAM_URL) },
    build: { sourcemap: false },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: false,
    },
  }
})
