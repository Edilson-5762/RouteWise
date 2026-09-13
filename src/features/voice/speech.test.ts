import { describe, it, expect, vi, afterEach } from 'vitest';
import { speak } from './speech';

describe('speak', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fala em pt-BR no volume máximo', () => {
    const speakMock = vi.fn();
    let utterance: { text: string; lang: string; volume: number } | null = null;
    vi.stubGlobal('speechSynthesis', { speak: speakMock, cancel: vi.fn() });
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      vi.fn().mockImplementation((text: string) => {
        utterance = { text, lang: '', volume: 0 };
        return utterance;
      }),
    );

    speak('Vire à esquerda');

    expect(speakMock).toHaveBeenCalledTimes(1);
    expect(utterance).toMatchObject({ text: 'Vire à esquerda', lang: 'pt-BR', volume: 1 });
  });

  it('cancela qualquer fala pendente antes de começar a nova', () => {
    const cancelMock = vi.fn();
    const speakMock = vi.fn();
    vi.stubGlobal('speechSynthesis', { speak: speakMock, cancel: cancelMock });
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      vi.fn().mockImplementation((text: string) => ({ text, lang: '' })),
    );

    speak('Continue em frente');

    expect(cancelMock).toHaveBeenCalledTimes(1);
    // cancela ANTES de falar a nova frase, senão a fala nova é cortada junto.
    expect(cancelMock.mock.invocationCallOrder[0]).toBeLessThan(
      speakMock.mock.invocationCallOrder[0],
    );
  });

  it('sem suporte a speechSynthesis, não faz nada (não lança)', () => {
    vi.stubGlobal('speechSynthesis', undefined);
    expect(() => speak('Vire à direita')).not.toThrow();
  });
});
