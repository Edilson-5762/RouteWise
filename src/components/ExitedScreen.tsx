import { LogOut } from 'lucide-react';

interface ExitedScreenProps {
  onReturn: () => void;
}

// Mostrada quando o usuário pede para sair do app mas o navegador bloqueia
// `window.close()` (só funciona em abas abertas por script — ver App.tsx) —
// sem isso, clicar em "Sair da página" numa aba comum não dava nenhum
// retorno visível, parecendo um botão quebrado.
export function ExitedScreen({ onReturn }: ExitedScreenProps) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-surface p-6 text-center text-surface-foreground">
      <LogOut size={48} className="text-muted" aria-hidden="true" />
      <h1 className="text-2xl font-bold">Você saiu do RouteWise</h1>
      <p className="max-w-xs text-muted">
        Seu navegador não permite fechar esta aba automaticamente. Você já pode fechá-la pelo X
        do navegador, ou continuar usando o app.
      </p>
      <button
        type="button"
        onClick={onReturn}
        className="mt-4 rounded-xl bg-primary px-8 py-3 font-semibold text-primary-foreground"
      >
        Voltar ao app
      </button>
    </div>
  );
}
