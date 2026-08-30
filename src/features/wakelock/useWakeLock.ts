import { useEffect, useRef } from 'react';

// Mantém a tela do dispositivo ligada enquanto `enabled` for true — usado
// durante a navegação passo-a-passo, onde o usuário fica minutos sem tocar na
// tela e o bloqueio automático cortaria o GPS e o recálculo por desvio.
//
// O sistema solta a trava sozinho quando a página vai para segundo plano
// (troca de app, chega uma ligação, tela apaga). Ela NÃO volta sozinha, por
// isso re-solicitamos no `visibilitychange` quando a aba fica visível de novo.
//
// `navigator.wakeLock` não existe em navegadores antigos nem no Safari iOS
// abaixo de 16.4 — nesses casos o hook simplesmente não faz nada.
export function useWakeLock(enabled: boolean): void {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
      return;
    }

    let released = false;

    const acquire = async () => {
      try {
        const sentinel = await navigator.wakeLock.request('screen');
        if (released) {
          // O efeito foi limpo enquanto o pedido estava no ar — solta já, senão
          // a trava vaza (o cleanup não viu este sentinel).
          void sentinel.release().catch(() => {});
          return;
        }
        sentinelRef.current = sentinel;
      } catch {
        // Pedido rejeitado (aba em segundo plano, bateria fraca, política do
        // navegador) — segue sem a trava; o `visibilitychange` tenta de novo.
      }
    };

    const handleVisibilityChange = () => {
      if (!released && document.visibilityState === 'visible') {
        void acquire();
      }
    };

    void acquire();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      released = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      void sentinel?.release().catch(() => {});
    };
  }, [enabled]);
}
