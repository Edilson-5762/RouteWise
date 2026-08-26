import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSavedPlaces } from './useSavedPlaces';

describe('useSavedPlaces', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('inicia vazio quando não há nada salvo', () => {
    const { result } = renderHook(() => useSavedPlaces());
    expect(result.current.places).toEqual([]);
  });

  it('salva um local e persiste em localStorage', () => {
    const { result } = renderHook(() => useSavedPlaces());

    act(() => {
      result.current.savePlace('Casa', { lat: -23.55, lng: -46.63 });
    });

    expect(result.current.places).toHaveLength(1);
    expect(result.current.places[0].label).toBe('Casa');
    const stored = JSON.parse(localStorage.getItem('routewise-saved-places') ?? '[]');
    expect(stored).toHaveLength(1);
  });

  it('remove um local salvo pelo id', () => {
    const { result } = renderHook(() => useSavedPlaces());
    act(() => {
      result.current.savePlace('Trabalho', { lat: -23.56, lng: -46.64 });
    });
    const id = result.current.places[0].id;

    act(() => {
      result.current.removePlace(id);
    });

    expect(result.current.places).toEqual([]);
  });

  it('trata dado corrompido em localStorage como lista vazia', () => {
    localStorage.setItem('routewise-saved-places', 'não é json válido {{{');

    const { result } = renderHook(() => useSavedPlaces());

    expect(result.current.places).toEqual([]);
  });
});
