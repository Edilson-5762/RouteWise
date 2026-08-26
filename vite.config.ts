/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
