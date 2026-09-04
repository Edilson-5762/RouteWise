import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MapView } from './MapView';
import * as geoapifyClient from '../services/geoapifyClient';

let movestartHandler: ((event: { originalEvent?: unknown }) => void) | null = null;
const nearbyMarkerElements: HTMLDivElement[] = [];
let moveEndHandler: (() => void) | null = null;

vi.mock('mapbox-gl', () => {
  class FakeMap {
    isStyleLoaded = () => true;
    on = vi.fn((event: string, handler: () => void) => {
      if (event === 'movestart') {
        movestartHandler = handler as (event: { originalEvent?: unknown }) => void;
      }
      if (event === 'moveend') {
        moveEndHandler = handler;
      }
    });
    off = vi.fn();
    once = vi.fn((event: string, handler: () => void) => {
      if (event === 'style.load') {
        handler();
      }
    });
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
    getCenter = vi.fn().mockReturnValue({ lat: -15.8267, lng: -48.0654 });
    getZoom = vi.fn().mockReturnValue(16);
  }
  class FakeMarker {
    element?: HTMLDivElement;
    constructor(options?: { element?: HTMLDivElement }) {
      this.element = options?.element;
      // Filtra pelo data-testid que só os marcadores de useNearbyPlacesMarkers
      // carregam (ver createMarkerElement lá) — o puck de origem, dentro de
      // useMapboxMap, também constrói seu Marker com a chave `element`, então
      // rastrear "qualquer elemento recebido" capturaria o puck junto e
      // inflaria essa contagem sempre que `origin` estiver presente no teste.
      if (options?.element?.getAttribute('data-testid') === 'nearby-place-marker') {
        nearbyMarkerElements.push(options.element);
      }
    }
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
        onDestinationSelected={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText('Centralizar')).not.toBeInTheDocument();
  });

  it('mostra o ícone fixo do veículo só durante a navegação', () => {
    const { rerender } = render(
      <MapView
        origin={{ lat: -23.5505, lng: -46.6333 }}
        destination={null}
        route={null}
        isNavigating={false}
        headingDegrees={null}
        theme="light"
        travelProfile="driving"
        speedMetersPerSecond={null}
        onDestinationSelected={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('nav-vehicle')).not.toBeInTheDocument();

    rerender(
      <MapView
        origin={{ lat: -23.5505, lng: -46.6333 }}
        destination={null}
        route={null}
        isNavigating
        headingDegrees={null}
        theme="light"
        travelProfile="driving"
        speedMetersPerSecond={8}
        onDestinationSelected={vi.fn()}
      />,
    );
    const vehicle = screen.getByTestId('nav-vehicle');
    expect(vehicle).toBeInTheDocument();
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
        onDestinationSelected={vi.fn()}
      />,
    );

    act(() => {
      movestartHandler?.({ originalEvent: { type: 'touchmove' } });
    });

    const recenterButton = screen.getByLabelText('Centralizar');
    expect(recenterButton).toBeInTheDocument();

    fireEvent.click(recenterButton);

    expect(screen.queryByLabelText('Centralizar')).not.toBeInTheDocument();
  });

  it('também mostra o botão de centralizar fora do modo navegação (prévia da rota), e some ao clicar', () => {
    // À la Waze/Google Maps: arrastar o mapa enquanto se olha a prévia da
    // rota (antes de "Iniciar navegação") também precisa oferecer um jeito
    // de voltar ao enquadramento da rota inteira, não só durante a condução.
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
        onDestinationSelected={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText('Centralizar')).not.toBeInTheDocument();

    act(() => {
      movestartHandler?.({ originalEvent: { type: 'touchmove' } });
    });

    const recenterButton = screen.getByLabelText('Centralizar');
    expect(recenterButton).toBeInTheDocument();

    fireEvent.click(recenterButton);

    expect(screen.queryByLabelText('Centralizar')).not.toBeInTheDocument();
  });

  it('busca e desenha estabelecimentos próximos, e chama onDestinationSelected ao clicar num deles', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    nearbyMarkerElements.length = 0;
    moveEndHandler = null;
    vi.spyOn(geoapifyClient, 'searchNearbyPlaces').mockResolvedValue([
      {
        id: 'p1',
        placeName: "D'Casa Ferramentas, Rua 4",
        coordinates: { lat: -15.8306, lng: -48.0645 },
      },
    ]);
    const onDestinationSelected = vi.fn();

    render(
      <MapView
        origin={{ lat: -15.8267, lng: -48.0654 }}
        destination={null}
        route={null}
        isNavigating={false}
        headingDegrees={null}
        theme="light"
        travelProfile="driving"
        speedMetersPerSecond={null}
        onDestinationSelected={onDestinationSelected}
      />,
    );

    await act(async () => {
      moveEndHandler?.();
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(nearbyMarkerElements).toHaveLength(1);

    nearbyMarkerElements[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onDestinationSelected).toHaveBeenCalledWith({
      id: 'p1',
      placeName: "D'Casa Ferramentas, Rua 4",
      coordinates: { lat: -15.8306, lng: -48.0645 },
    });

    vi.useRealTimers();
  });
});
