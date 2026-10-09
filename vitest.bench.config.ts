import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

// Separate entry so timing runs never slow down or flake `npm test`.
export default defineConfig((env) =>
  mergeConfig(viteConfig(env), {
    test: { include: ['src/bench/**/*.perf.ts'], environment: 'node' },
  }),
)
