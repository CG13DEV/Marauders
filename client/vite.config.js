import {defineConfig} from 'vite';
export default defineConfig({
  base:'/Marauders/',
  build:{target:'es2022',outDir:'dist',assetsDir:'assets'},
  server:{host:'0.0.0.0'}
});
