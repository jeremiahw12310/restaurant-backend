/// <reference types="vitest/config" />
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
// Multi-page build:
// - `index.html` → main TRAQ app (v2/v3 shell from Firestore; `/admin/*` redirects to admin portal URL)
// - `beta.html` → always TRAQ 3.0 shell (beta Hosting site)
// - `apply.html` → Bonfire applicant-only shell
// - `admin.html` → Admin portal (PIN gate + admin routes at `/`, `/team`, …)
//
// Firebase Hosting (see `.firebaserc`):
// - `deploy:hosting:main` → site **traq-caab9** (`index.html`).
// - `deploy:hosting:beta` → **traq-beta** (`beta.html`).
// - `deploy:hosting:apply` → **traq-apply** (`apply.html` only).
// - `deploy:hosting:admin` → **traq-admin** (`admin.html` only).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  plugins: [
    react(),
    legacy({
      targets: ['iOS >= 9', 'Safari >= 9', 'ie >= 11'],
      additionalLegacyPolyfills: ['regenerator-runtime/runtime'],
      renderLegacyChunks: true,
      modernPolyfills: true,
      polyfills: [
        // Core ES features
        'es.symbol',
        'es.symbol.description',
        'es.symbol.iterator',
        'es.symbol.async-iterator',
        'es.array.iterator',
        'es.array.from',
        'es.array.includes',
        'es.array.find',
        'es.array.find-index',
        'es.array.fill',
        'es.array.flat',
        'es.array.flat-map',
        'es.string.iterator',
        'es.string.includes',
        'es.string.starts-with',
        'es.string.ends-with',
        'es.string.pad-start',
        'es.string.pad-end',
        'es.string.trim',
        'es.string.split',
        'es.object.assign',
        'es.object.keys',
        'es.object.values',
        'es.object.entries',
        'es.object.from-entries',
        'es.promise',
        'es.promise.finally',
        'es.promise.all-settled',
        'es.map',
        'es.set',
        'es.weak-map',
        'es.weak-set',
        'es.number.is-finite',
        'es.number.is-nan',
        'es.number.is-integer',
        'es.math.trunc',
        'es.json.stringify',
        'es.reflect.apply',
        'es.reflect.construct',
        // Web APIs
        'web.url',
        'web.url-search-params',
        'web.dom-collections.iterator',
        'web.dom-collections.for-each',
      ]
    })
  ],
  build: {
    // Modern bundle target. The iPad (Safari 17) and other current browsers get
    // lean ES2017+/native CSS here; older browsers still get a transpiled,
    // polyfilled fallback chunk via @vitejs/plugin-legacy below. Shipping ES5 to
    // Safari 17 wasted CPU (regenerator runtime, bulkier output) on the A-series
    // chip, so the modern path is raised to a current baseline.
    target: ['es2020', 'safari14'],
    cssTarget: 'safari14',
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        beta: path.resolve(__dirname, 'beta.html'),
        apply: path.resolve(__dirname, 'apply.html'),
        admin: path.resolve(__dirname, 'admin.html'),
      },
    },
  },
})
