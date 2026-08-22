import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { App } from './App';
import * as mapboxClient from './services/mapboxClient';

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
    getLayer = vi.fn().mockReturnValue(undefined);
    removeLayer = vi.fn();
    removeSource = vi.fn();
    fitBounds = vi.fn();
  }
  class FakeMarker {
    setLngLat = vi.fn().mockReturnThis();
    addTo = vi.fn().mockReturnThis();
  }
  class FakeLngLatBounds {
    extend = vi.fn().mockReturnThis();
    constructor(
      public sw?: unknown,
      public ne?: unknown,
    ) {}
  }
  return {
    default: { Map: FakeMap, Marker: FakeMarker, LngLatBounds: FakeLngLatBounds, accessToken: '' },
  };
});

describe('App', () => {
  beforeEach(() => {
    Object.defineProperty(global.navigator, 'geolocation', {
      value: {
        watchPosition: vi.fn((success: PositionCallback) => {
          success({
            coords: { latitude: -23.5505, longitude: -46.6333 },
          } as GeolocationPosition);
          return 1;
        }),
        clearWatch: vi.fn(),
      },
      configurable: true,
    });
  });

  it('planeja uma rota assim que um destino é selecionado e mostra o resumo', async () => {
    vi.spyOn(mapboxClient, 'searchPlaces').mockResolvedValue([
      {
        id: '1',
        placeName: 'Av. Paulista, São Paulo',
        coordinates: { lat: -23.5613, lng: -46.6564 },
      },
    ]);
    vi.spyOn(mapboxClient, 'getDirections').mockResolvedValue({
      geometry: [
        { lat: -23.5505, lng: -46.6333 },
        { lat: -23.5613, lng: -46.6564 },
      ],
      steps: [
        {
          instruction: 'Siga em frente',
          distanceMeters: 500,
          durationSeconds: 60,
          maneuverLocation: { lat: -23.5505, lng: -46.6333 },
        },
      ],
      distanceMeters: 500,
      durationSeconds: 60,
    });

    render(<App />);

    fireEvent.change(screen.getByLabelText('Buscar destino'), {
      target: { value: 'Paulista' },
    });
    const option = await screen.findByText('Av. Paulista, São Paulo');
    fireEvent.click(option);

    await waitFor(() => {
      expect(screen.getByText('1 min')).toBeInTheDocument();
    });
    expect(screen.getByText('Iniciar navegação')).toBeInTheDocument();
  });

  it('planeja a rota mesmo quando o destino é selecionado antes do primeiro fix de GPS', async () => {
    let sendPosition: PositionCallback | null = null;
    Object.defineProperty(global.navigator, 'geolocation', {
      value: {
        watchPosition: vi.fn((success: PositionCallback) => {
          sendPosition = success;
          return 1;
        }),
        clearWatch: vi.fn(),
      },
      configurable: true,
    });

    vi.spyOn(mapboxClient, 'searchPlaces').mockResolvedValue([
      {
        id: '1',
        placeName: 'Av. Paulista, São Paulo',
        coordinates: { lat: -23.5613, lng: -46.6564 },
      },
    ]);
    vi.spyOn(mapboxClient, 'getDirections').mockResolvedValue({
      geometry: [
        { lat: -23.5505, lng: -46.6333 },
        { lat: -23.5613, lng: -46.6564 },
      ],
      steps: [
        {
          instruction: 'Siga em frente',
          distanceMeters: 500,
          durationSeconds: 60,
          maneuverLocation: { lat: -23.5505, lng: -46.6333 },
        },
      ],
      distanceMeters: 500,
      durationSeconds: 60,
    });

    render(<App />);

    // Destino selecionado antes de qualquer fix de GPS (permissão ainda pendente).
    fireEvent.change(screen.getByLabelText('Buscar destino'), {
      target: { value: 'Paulista' },
    });
    const option = await screen.findByText('Av. Paulista, São Paulo');
    fireEvent.click(option);

    expect(sendPosition).not.toBeNull();
    expect(screen.queryByText('1 min')).not.toBeInTheDocument();

    // O primeiro fix de GPS chega depois da seleção do destino.
    act(() => {
      sendPosition!({
        coords: { latitude: -23.5505, longitude: -46.6333 },
      } as GeolocationPosition);
    });

    await waitFor(() => {
      expect(screen.getByText('1 min')).toBeInTheDocument();
    });
    expect(screen.getByText('Iniciar navegação')).toBeInTheDocument();
  });

  it('chama getDirections apenas uma vez mesmo com múltiplas atualizações de GPS antes da rota resolver', async () => {
    let sendPosition: PositionCallback | null = null;
    Object.defineProperty(global.navigator, 'geolocation', {
      value: {
        watchPosition: vi.fn((success: PositionCallback) => {
          sendPosition = success;
          success({
            coords: { latitude: -23.5505, longitude: -46.6333 },
          } as GeolocationPosition);
          return 1;
        }),
        clearWatch: vi.fn(),
      },
      configurable: true,
    });

    vi.spyOn(mapboxClient, 'searchPlaces').mockResolvedValue([
      {
        id: '1',
        placeName: 'Av. Paulista, São Paulo',
        coordinates: { lat: -23.5613, lng: -46.6564 },
      },
    ]);

    let resolveDirections: ((route: Awaited<ReturnType<typeof mapboxClient.getDirections>>) => void) | null =
      null;
    const directionsPromise = new Promise<Awaited<ReturnType<typeof mapboxClient.getDirections>>>(
      (resolve) => {
        resolveDirections = resolve;
      },
    );
    const getDirectionsSpy = vi
      .spyOn(mapboxClient, 'getDirections')
      .mockReturnValue(directionsPromise);

    render(<App />);

    fireEvent.change(screen.getByLabelText('Buscar destino'), {
      target: { value: 'Paulista' },
    });
    const option = await screen.findByText('Av. Paulista, São Paulo');
    fireEvent.click(option);

    await waitFor(() => {
      expect(getDirectionsSpy).toHaveBeenCalledTimes(1);
    });

    // Várias atualizações de GPS chegam enquanto a rota ainda está pendente.
    act(() => {
      sendPosition!({
        coords: { latitude: -23.5506, longitude: -46.6334 },
      } as GeolocationPosition);
    });
    act(() => {
      sendPosition!({
        coords: { latitude: -23.5507, longitude: -46.6335 },
      } as GeolocationPosition);
    });

    expect(getDirectionsSpy).toHaveBeenCalledTimes(1);

    // Resolve a promise pendente para não vazar estado entre testes.
    act(() => {
      resolveDirections!({
        geometry: [
          { lat: -23.5505, lng: -46.6333 },
          { lat: -23.5613, lng: -46.6564 },
        ],
        steps: [
          {
            instruction: 'Siga em frente',
            distanceMeters: 500,
            durationSeconds: 60,
            maneuverLocation: { lat: -23.5505, lng: -46.6333 },
          },
        ],
        distanceMeters: 500,
        durationSeconds: 60,
      });
    });

    await waitFor(() => {
      expect(screen.getByText('1 min')).toBeInTheDocument();
    });
    expect(getDirectionsSpy).toHaveBeenCalledTimes(1);
  });
});
