import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Gera os ícones do app (favicon, apple-touch-icon e ícones de PWA) a partir
// de public/logo.svg, direto em public/. Rode:  npm run generate:pwa-assets
// Os arquivos gerados são versionados; a Vercel só os serve como estáticos.
export default defineConfig({
  preset: minimal2023Preset,
  images: ['public/logo.svg'],
});
