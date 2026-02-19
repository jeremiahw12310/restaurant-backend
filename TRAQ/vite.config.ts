import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'

// https://vite.dev/config/
export default defineConfig({
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
    // Target ES5 for maximum compatibility with legacy browsers
    target: 'es5',
    cssTarget: 'safari9',
  }
})
