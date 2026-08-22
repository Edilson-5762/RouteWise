import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTheme } from './useTheme';

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  afterEach(() => {
    document.documentElement.classList.remove('dark');
  });

  it('inicia em light quando não há preferência salva e o sistema prefere claro', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('alterna para dark e aplica a classe no elemento raiz', () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('persiste a preferência em localStorage e a recupera em uma nova instância', () => {
    const { result, unmount } = renderHook(() => useTheme());
    act(() => {
      result.current.toggleTheme();
    });
    unmount();

    const { result: secondResult } = renderHook(() => useTheme());
    expect(secondResult.current.theme).toBe('dark');
  });
});
