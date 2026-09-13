// Fala compartilhada por toda a navegação (manobras + início + chegada).
// Duas correções de "a voz sai baixa/engasgada" relatadas em teste de rua:
//  - `volume` explícito no máximo — em parte dos Android o WebView cria a
//    utterance com volume padrão mais baixo que o esperado.
//  - `cancel()` antes de falar — sem isso, uma frase nova disparada enquanto a
//    anterior ainda toca (ex.: aviso "em X metros" seguido rápido pela ordem)
//    entra na fila e sai atropelada/baixa em vez de substituir a anterior.
export function speak(phrase: string): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(phrase);
  utterance.lang = 'pt-BR';
  utterance.volume = 1;
  window.speechSynthesis.speak(utterance);
}
