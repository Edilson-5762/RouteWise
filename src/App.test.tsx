import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
  }
  class FakeMarker {
    setLngLat = vi.fn().mockReturnThis();
    addTo = vi.fn().mockReturnThis();
  }
  return { default: { Map: FakeMap, Marker: FakeMarker, accessToken: '' } };
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
});
