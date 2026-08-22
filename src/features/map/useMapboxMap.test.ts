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
      }),
    );

    expect(setLngLatMock).toHaveBeenCalledWith([-46.6333, -23.5505]);
    expect(addToMock).toHaveBeenCalled();
  });
});
