import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
// Only the scheduler's optional CPU diagnostics need Node's perf_hooks.
// Browser uses the native Performance API and never receives Node globals.
export default defineConfig({
  base:'/Marauders/',
  resolve:{alias:{
    'node:perf_hooks':fileURLToPath(new URL('./src/performance-shim.js',import.meta.url))
  }},
  define:{
    'process.env.MARAUDERS_ROUTE_PROFILE':JSON.stringify('0'),
    'process.env.MARAUDERS_TICK_PROFILE':JSON.stringify('0')
  },
  build:{target:'es2022',outDir:'dist',assetsDir:'assets'},
  server:{host:'0.0.0.0'}
});
