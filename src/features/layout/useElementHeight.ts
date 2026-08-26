import { useEffect, useState } from 'react';

// Mede a altura real (renderizada) de um elemento e se mantém em dia quando
// ela muda — usado para descobrir quanto do mapa fica coberto por painéis
// sobrepostos (cabeçalho, cartão de destino) cujo conteúdo/altura varia
// (banner de aviso, erro, lista de locais salvos etc.), em vez de assumir um
// valor fixo. Recebe o nó do DOM diretamente (não um RefObject) para poder
// reagir também à montagem/desmontagem de elementos renderizados
// condicionalmente — passar `node` via `ref={setNode}` (callback ref) dispara
// esse efeito de novo tanto quando o elemento aparece quanto quando some.
export function useElementHeight(node: HTMLElement | null): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (!node) {
      setHeight(0);
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setHeight(entry.contentRect.height);
      }
    });
    observer.observe(node);

    return () => observer.disconnect();
  }, [node]);

  return height;
}
