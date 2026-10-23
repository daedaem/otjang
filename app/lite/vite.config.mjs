import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  build: {
    target: ['safari16.4', 'chrome110'], outDir: fileURLToPath(new URL('./dist/react', import.meta.url)), emptyOutDir: false, manifest: true,
    rollupOptions: { preserveEntrySignatures: 'strict', input: fileURLToPath(new URL('./src/input/index.tsx', import.meta.url)), output: { entryFileNames: 'input-[hash].js', assetFileNames: '[name]-[hash][extname]' } },
  },
});
