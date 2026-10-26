import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  publicDir: false, // The existing PWA build copies the shared install icons once.
  build: {
    target: ['safari16.4', 'chrome110'], outDir: fileURLToPath(new URL('./dist/react', import.meta.url)), emptyOutDir: false, manifest: true,
    rollupOptions: { preserveEntrySignatures: 'strict', input: { input: fileURLToPath(new URL('./src/input/index.tsx', import.meta.url)), photos: fileURLToPath(new URL('./src/photos/index.js', import.meta.url)), closet: fileURLToPath(new URL('./src/closet/index.tsx', import.meta.url)), profile: fileURLToPath(new URL('./src/profile/index.tsx', import.meta.url)), measure: fileURLToPath(new URL('./src/measure/index.tsx', import.meta.url)), collection:fileURLToPath(new URL('./src/collection/index.tsx', import.meta.url)), outfits:fileURLToPath(new URL('./src/outfits/index.tsx', import.meta.url)) }, output: { entryFileNames: '[name]-[hash].js', assetFileNames: '[name]-[hash][extname]' } },
  },
});
