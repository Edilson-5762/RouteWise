import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVoiceGuidance } from './useVoiceGuidance';

describe('useVoiceGuidance', () => {
  const speakMock = vi.fn();

  beforeEach(() => {
    speakMock.mockClear();
    vi.stubGlobal('speechSynthesis', { speak: speakMock, cancel: vi.fn() });
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      vi.fn().mockImplementation((text: string) => ({ text, lang: '' })),
    );
  });

  it('reporta suporte quando speechSynthesis existe', () => {
    const { result } = renderHook(() => useVoiceGuidance(null, { enabled: true }));
    expect(result.current.isSupported).toBe(true);
  });

  it('fala a instrução quando ela muda e não está mudo', () => {
    const { rerender } = renderHook(
      ({ instruction }: { instruction: string | null }) =>
        useVoiceGuidance(instruction, { enabled: true }),
      { initialProps: { instruction: null as string | null } },
    );

    rerender({ instruction: 'Vire à direita na Rua Augusta' });

    expect(speakMock).toHaveBeenCalledTimes(1);
  });

  it('não fala quando está mudo', () => {
    const { result, rerender } = renderHook(
      ({ instruction }: { instruction: string | null }) =>
        useVoiceGuidance(instruction, { enabled: true }),
      { initialProps: { instruction: null as string | null } },
    );

    act(() => {
      result.current.toggleMute();
    });
    rerender({ instruction: 'Vire à direita' });

    expect(speakMock).not.toHaveBeenCalled();
  });

  it('não fala quando enabled é false', () => {
    const { rerender } = renderHook(
      ({ instruction }: { instruction: string | null }) =>
        useVoiceGuidance(instruction, { enabled: false }),
      { initialProps: { instruction: null as string | null } },
    );

    rerender({ instruction: 'Vire à direita' });

    expect(speakMock).not.toHaveBeenCalled();
  });
});
