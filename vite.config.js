import { defineConfig } from 'vite'

export default defineConfig({
  // Relative asset URLs so the build works from any subpath, such as GitHub Pages.
  base: './',
  worker: { format: 'es' },
})
