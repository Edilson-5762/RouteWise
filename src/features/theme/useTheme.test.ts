import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTheme } from './useTheme';
import type { Coordinates } from '../../types';

// 2026-06-15 em Brasília (UTC-3): meio-dia e meia-noite locais em UTC.
const BRASILIA_NOON_UTC = new Date('2026-06-15T15:00:00Z');
const BRASILIA_MIDNIGHT_UTC = new Date('2026-06-15T03:00:00Z');
const BRASILIA: Coordinates = { lat: -15.7939, lng: -47.8828 };

describe('useTheme', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark');
  });

  afterEach(() => {
    document.documentElement.classList.remove('dark');
    vi.useRealTimers();
  });

  it('mostra claro quando é dia na coordenada atual', () => {
    vi.useFakeTimers();
    vi.setSystemTime(BRASILIA_NOON_UTC);

    const { result } = renderHook(() => useTheme(BRASILIA));

    expect(result.current.theme).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('mostra escuro quando é noite na coordenada atual', () => {
    vi.useFakeTimers();
    vi.setSystemTime(BRASILIA_MIDNIGHT_UTC);

    const { result } = renderHook(() => useTheme(BRASILIA));

    expect(result.current.theme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('reconfere periodicamente e escurece sozinho quando o horário avança para a noite', () => {
    vi.useFakeTimers();
    vi.setSystemTime(BRASILIA_NOON_UTC);
    const { result } = renderHook(() => useTheme(BRASILIA));
    expect(result.current.theme).toBe('light');

    act(() => {
      vi.setSystemTime(BRASILIA_MIDNIGHT_UTC);
      vi.advanceTimersByTime(60_000);
    });

    expect(result.current.theme).toBe('dark');
  });

  it('o botão força um tema, mas não persiste — uma nova instância volta a seguir o sol', () => {
    vi.useFakeTimers();
    vi.setSystemTime(BRASILIA_NOON_UTC); // dia -> claro por padrão
    const { result, unmount } = renderHook(() => useTheme(BRASILIA));

    act(() => {
      result.current.toggleTheme();
    });
    expect(result.current.theme).toBe('dark');
    unmount();

    const { result: secondResult } = renderHook(() => useTheme(BRASILIA));
    expect(secondResult.current.theme).toBe('light');
  });

  it('a força manual não é sobrescrita pela reconferência automática', () => {
    vi.useFakeTimers();
    vi.setSystemTime(BRASILIA_NOON_UTC); // segue dia por toda a duração do teste
    const { result } = renderHook(() => useTheme(BRASILIA));

    act(() => {
      result.current.toggleTheme(); // força escuro mesmo sendo dia
    });
    expect(result.current.theme).toBe('dark');

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(result.current.theme).toBe('dark');
  });

  it('usa o centro do DF quando ainda não há coordenada (sem GPS)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(BRASILIA_NOON_UTC);

    const { result } = renderHook(() => useTheme(null));

    expect(result.current.theme).toBe('light');
  });
});
