import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MapView } from './MapView';

let movestartHandler: ((event: { originalEvent?: unknown }) => void) | null = null;

vi.mock('mapbox-gl', () => {
  class FakeMap {
    isStyleLoaded = () => true;
    on = vi.fn((event: string, handler: (event: { originalEvent?: unknown }) => void) => {
      if (event === 'movestart') {
        movestartHandler = handler;
      }
    });
    off = vi.fn();
    once = vi.fn();
    remove = vi.fn();
    setCenter = vi.fn();
    getSource = vi.fn().mockReturnValue(undefined);
    addSource = vi.fn();
    addLayer = vi.fn();
    getLayer = vi.fn().mockReturnValue(undefined);
    removeLayer = vi.fn();
    removeSource = vi.fn();
    fitBounds = vi.fn();
    setStyle = vi.fn();
    easeTo = vi.fn();
    getBearing = vi.fn().mockReturnValue(0);
  }
  class FakeMarker {
    setLngLat = vi.fn().mockReturnThis();
    addTo = vi.fn().mockReturnThis();
    setRotation = vi.fn().mockReturnThis();
    remove = vi.fn();
  }
  return {
    default: { Map: FakeMap, Marker: FakeMarker, accessToken: '' },
  };
});

describe('MapView', () => {
  it('não mostra o botão de centralizar enquanto está seguindo o usuário', () => {
    render(
      <MapView
        origin={{ lat: -23.5505, lng: -46.6333 }}
        destination={null}
        route={null}
        isNavigating
        headingDegrees={null}
        theme="light"
        travelProfile="driving"
        speedMetersPerSecond={null}
      />,
    );

    expect(screen.queryByLabelText('Centralizar no destino')).not.toBeInTheDocument();
  });

  it('mostra o botão de centralizar quando o usuário arrasta o mapa durante a navegação, e some ao clicar', () => {
    movestartHandler = null;
    render(
      <MapView
        origin={{ lat: -23.5505, lng: -46.6333 }}
        destination={null}
        route={null}
        isNavigating
        headingDegrees={null}
        theme="light"
        travelProfile="driving"
        speedMetersPerSecond={null}
      />,
    );

    act(() => {
      movestartHandler?.({ originalEvent: { type: 'touchmove' } });
    });

    const recenterButton = screen.getByLabelText('Centralizar no destino');
    expect(recenterButton).toBeInTheDocument();

    fireEvent.click(recenterButton);

    expect(screen.queryByLabelText('Centralizar no destino')).not.toBeInTheDocument();
  });

  it('não mostra o botão de centralizar fora do modo navegação', () => {
    movestartHandler = null;
    render(
      <MapView
        origin={{ lat: -23.5505, lng: -46.6333 }}
        destination={null}
        route={null}
        isNavigating={false}
        headingDegrees={null}
        theme="light"
        travelProfile="driving"
        speedMetersPerSecond={null}
      />,
    );

    act(() => {
      movestartHandler?.({ originalEvent: { type: 'touchmove' } });
    });

    expect(screen.queryByLabelText('Centralizar no destino')).not.toBeInTheDocument();
  });
});
