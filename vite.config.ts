/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      // Ícones em public/, gerados de public/logo.svg por `npm run generate:pwa-assets`.
      includeAssets: ['favicon.ico', 'logo.svg', 'apple-touch-icon-180x180.png', 'og-card.png'],
      manifest: {
        name: 'RouteWise',
        short_name: 'RouteWise',
        description:
          'GPS de rotas no navegador: busque um destino, veja o trajeto e o tempo estimado, e siga a navegação.',
        lang: 'pt-BR',
        theme_color: '#2563EB',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Só o "esqueleto" do app entra no cache offline — nada de tiles do
        // Mapbox nem respostas da Geoapify, que precisam vir sempre da rede.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
      },
      devOptions: { enabled: false },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    passWithNoTests: true,
    // .worktrees é gitignored mas não é ignorado pelos excludes padrão do
    // Vitest — sem isso, rodar a suíte na raiz do repo com um worktree vivo
    // coleta os arquivos de teste de dentro dele também, que resolvem um
    // node_modules próprio e quebram com múltiplas cópias do React.
    exclude: ['**/node_modules/**', '**/.worktrees/**', '**/dist/**'],
  },
});
