import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useGeolocation } from './useGeolocation';

describe('useGeolocation', () => {
  beforeEach(() => {
    Object.defineProperty(global.navigator, 'geolocation', {
      value: {
        watchPosition: vi.fn(),
        clearWatch: vi.fn(),
      },
      configurable: true,
    });
  });

  it('define a posição em caso de sucesso da geolocalização', async () => {
    (navigator.geolocation.watchPosition as ReturnType<typeof vi.fn>).mockImplementation(
      (success: PositionCallback) => {
        success({
          coords: { latitude: -23.5505, longitude: -46.6333 },
        } as GeolocationPosition);
        return 1;
      },
    );

    const { result } = renderHook(() => useGeolocation());

    await waitFor(() => {
      expect(result.current.position).toEqual({ lat: -23.5505, lng: -46.6333 });
    });
    expect(result.current.error).toBeNull();
  });

  it('define uma mensagem de erro quando a geolocalização falha', async () => {
    (navigator.geolocation.watchPosition as ReturnType<typeof vi.fn>).mockImplementation(
      (_success: PositionCallback, error: PositionErrorCallback) => {
        error({ code: 1, message: 'denied' } as GeolocationPositionError);
        return 1;
      },
    );

    const { result } = renderHook(() => useGeolocation());

    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });
    expect(result.current.position).toBeNull();
  });
});
