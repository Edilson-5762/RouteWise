import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVoiceGuidance, type UpcomingManeuver } from './useVoiceGuidance';

const LEFT: UpcomingManeuver = { instruction: 'Vire à esquerda na Rua 4B', key: '1' };

describe('useVoiceGuidance', () => {
  const speakMock = vi.fn();
  let lastUtterance: { text: string; lang: string } | null = null;

  beforeEach(() => {
    speakMock.mockClear();
    lastUtterance = null;
    vi.stubGlobal('speechSynthesis', { speak: speakMock, cancel: vi.fn() });
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      vi.fn().mockImplementation((text: string) => {
        lastUtterance = { text, lang: '' };
        return lastUtterance;
      }),
    );
  });

  it('reporta suporte quando speechSynthesis existe', () => {
    const { result } = renderHook(() => useVoiceGuidance(null, null, { enabled: true }));
    expect(result.current.isSupported).toBe(true);
  });

  it('fala o aviso antecipado ("Em X metros, ...") ao cruzar o limite mais distante', () => {
    const { rerender } = renderHook(
      ({ distance }: { distance: number | null }) =>
        useVoiceGuidance(LEFT, distance, { enabled: true }),
      { initialProps: { distance: 400 as number | null } },
    );
    expect(speakMock).not.toHaveBeenCalled();

    rerender({ distance: 150 });

    expect(speakMock).toHaveBeenCalledTimes(1);
    expect(lastUtterance?.text).toBe('Em 150 metros, vire à esquerda na Rua 4B');
  });

  it('fala a ordem sem distância ao chegar perto da manobra', () => {
    const { rerender } = renderHook(
      ({ distance }: { distance: number | null }) =>
        useVoiceGuidance(LEFT, distance, { enabled: true }),
      { initialProps: { distance: 150 as number | null } },
    );
    speakMock.mockClear();

    rerender({ distance: 30 });

    expect(speakMock).toHaveBeenCalledTimes(1);
    expect(lastUtterance?.text).toBe('Vire à esquerda na Rua 4B');
  });

  it('não repete o mesmo aviso na mesma faixa de distância', () => {
    const { rerender } = renderHook(
      ({ distance }: { distance: number | null }) =>
        useVoiceGuidance(LEFT, distance, { enabled: true }),
      { initialProps: { distance: 150 as number | null } },
    );
    expect(speakMock).toHaveBeenCalledTimes(1);

    rerender({ distance: 120 });
    rerender({ distance: 90 });

    expect(speakMock).toHaveBeenCalledTimes(1);
  });

  it('rearma os avisos quando a manobra muda', () => {
    const { rerender } = renderHook(
      ({ maneuver, distance }: { maneuver: UpcomingManeuver; distance: number }) =>
        useVoiceGuidance(maneuver, distance, { enabled: true }),
      { initialProps: { maneuver: LEFT, distance: 150 } },
    );
    expect(speakMock).toHaveBeenCalledTimes(1);

    rerender({ maneuver: { instruction: 'Vire à direita', key: '2' }, distance: 150 });

    expect(speakMock).toHaveBeenCalledTimes(2);
    expect(lastUtterance?.text).toBe('Em 150 metros, vire à direita');
  });

  it('não fala quando está mudo', () => {
    const { result, rerender } = renderHook(
      ({ distance }: { distance: number | null }) =>
        useVoiceGuidance(LEFT, distance, { enabled: true }),
      { initialProps: { distance: 400 as number | null } },
    );

    act(() => {
      result.current.toggleMute();
    });
    rerender({ distance: 100 });

    expect(speakMock).not.toHaveBeenCalled();
  });

  it('não fala quando enabled é false', () => {
    const { rerender } = renderHook(
      ({ distance }: { distance: number | null }) =>
        useVoiceGuidance(LEFT, distance, { enabled: false }),
      { initialProps: { distance: 400 as number | null } },
    );

    rerender({ distance: 100 });

    expect(speakMock).not.toHaveBeenCalled();
  });
});
