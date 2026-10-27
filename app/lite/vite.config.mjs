import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  publicDir: false, // The existing PWA build copies the shared install icons once.
  build: {
    target: ['safari16.4', 'chrome110'], outDir: fileURLToPath(new URL('./dist/react', import.meta.url)), emptyOutDir: false, manifest: true,
    rollupOptions: { preserveEntrySignatures: 'strict', input: { input: fileURLToPath(new URL('./src/input/index.tsx', import.meta.url)), home: fileURLToPath(new URL('./src/home/index.tsx', import.meta.url)), results: fileURLToPath(new URL('./src/results/index.tsx', import.meta.url)), detail: fileURLToPath(new URL('./src/detail/index.tsx', import.meta.url)), records: fileURLToPath(new URL('./src/records/index.tsx', import.meta.url)), consult: fileURLToPath(new URL('./src/consult/index.tsx', import.meta.url)), backup: fileURLToPath(new URL('./src/backup/index.tsx', import.meta.url)), chrome: fileURLToPath(new URL('./src/chrome/index.tsx', import.meta.url)), addSearch: fileURLToPath(new URL('./src/add-search/index.tsx', import.meta.url)), photos: fileURLToPath(new URL('./src/photos/index.js', import.meta.url)), closet: fileURLToPath(new URL('./src/closet/index.tsx', import.meta.url)), profile: fileURLToPath(new URL('./src/profile/index.tsx', import.meta.url)), measure: fileURLToPath(new URL('./src/measure/index.tsx', import.meta.url)), collection:fileURLToPath(new URL('./src/collection/index.tsx', import.meta.url)), outfits:fileURLToPath(new URL('./src/outfits/index.tsx', import.meta.url)), mirror:fileURLToPath(new URL('./src/mirror/index.tsx', import.meta.url)) }, output: { entryFileNames: '[name]-[hash].js', assetFileNames: '[name]-[hash][extname]' } },
  },
});
