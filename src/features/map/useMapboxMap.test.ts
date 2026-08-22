import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { createRef } from 'react';
import { useMapboxMap } from './useMapboxMap';

const setLngLatMock = vi.fn().mockReturnThis();
const addToMock = vi.fn().mockReturnThis();

vi.mock('mapbox-gl', () => {
  class FakeMap {
    isStyleLoaded = () => true;
    on = vi.fn();
    once = vi.fn();
    remove = vi.fn();
    setCenter = vi.fn();
    getSource = vi.fn().mockReturnValue(undefined);
    addSource = vi.fn();
    addLayer = vi.fn();
    setStyle = vi.fn();
    easeTo = vi.fn();
    getBearing = vi.fn().mockReturnValue(0);
  }
  class FakeMarker {
    setLngLat = setLngLatMock;
    addTo = addToMock;
  }
  return {
    default: {
      Map: FakeMap,
      Marker: FakeMarker,
      accessToken: '',
    },
  };
});

describe('useMapboxMap', () => {
  it('cria um marcador na origem assim que o container está disponível', () => {
    const containerRef = createRef<HTMLDivElement>();
    Object.defineProperty(containerRef, 'current', {
      value: document.createElement('div'),
      writable: true,
    });

    renderHook(() =>
      useMapboxMap({
        containerRef,
        origin: { lat: -23.5505, lng: -46.6333 },
        destination: null,
        route: null,
        isNavigating: false,
        headingDegrees: null,
        theme: 'light' as const,
      }),
    );

    expect(setLngLatMock).toHaveBeenCalledWith([-46.6333, -23.5505]);
    expect(addToMock).toHaveBeenCalled();
  });

  it('chama easeTo com pitch e bearing ao entrar em modo navegação', () => {
    const containerRef = createRef<HTMLDivElement>();
    Object.defineProperty(containerRef, 'current', {
      value: document.createElement('div'),
      writable: true,
    });

    const { result, rerender } = renderHook(
      (props: { isNavigating: boolean; headingDegrees: number | null }) =>
        useMapboxMap({
          containerRef,
          origin: { lat: -23.5505, lng: -46.6333 },
          destination: null,
          route: null,
          theme: 'light',
          ...props,
        }),
      {
        initialProps: { isNavigating: false, headingDegrees: null } as {
          isNavigating: boolean;
          headingDegrees: number | null;
        },
      },
    );

    rerender({ isNavigating: true, headingDegrees: 120 });

    expect(result.current.current?.easeTo).toHaveBeenCalledWith(
      expect.objectContaining({ pitch: 60, bearing: 120, zoom: 17 }),
    );
  });

  it('nivela a câmera (pitch/bearing 0) ao sair do modo navegação', () => {
    const containerRef = createRef<HTMLDivElement>();
    Object.defineProperty(containerRef, 'current', {
      value: document.createElement('div'),
      writable: true,
    });

    const { result, rerender } = renderHook(
      (props: { isNavigating: boolean }) =>
        useMapboxMap({
          containerRef,
          origin: { lat: -23.5505, lng: -46.6333 },
          destination: null,
          route: null,
          theme: 'light',
          headingDegrees: null,
          ...props,
        }),
      { initialProps: { isNavigating: true } },
    );

    rerender({ isNavigating: false });

    expect(result.current.current?.easeTo).toHaveBeenCalledWith(
      expect.objectContaining({ pitch: 0, bearing: 0 }),
    );
  });

  it('troca o estilo do mapa quando o tema muda', () => {
    const containerRef = createRef<HTMLDivElement>();
    Object.defineProperty(containerRef, 'current', {
      value: document.createElement('div'),
      writable: true,
    });

    const { result, rerender } = renderHook(
      (props: { theme: 'light' | 'dark' }) =>
        useMapboxMap({
          containerRef,
          origin: null,
          destination: null,
          route: null,
          isNavigating: false,
          headingDegrees: null,
          ...props,
        }),
      { initialProps: { theme: 'light' } as { theme: 'light' | 'dark' } },
    );

    rerender({ theme: 'dark' });

    expect(result.current.current?.setStyle).toHaveBeenCalledWith(
      'mapbox://styles/mapbox/navigation-night-v1',
    );
  });
});
