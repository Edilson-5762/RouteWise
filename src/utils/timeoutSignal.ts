// Junta um teto de tempo (ms) com um AbortSignal externo opcional. Devolve
// o signal combinado e uma função `cleanup` que solta o timer e o listener
// — chame-a no `finally` de quem consome.
export function timeoutSignal(
  ms: number,
  external?: AbortSignal,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const onExternalAbort = () => controller.abort();

  if (external) {
    if (external.aborted) {
      controller.abort();
    } else {
      external.addEventListener('abort', onExternalAbort);
    }
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      external?.removeEventListener('abort', onExternalAbort);
    },
  };
}
