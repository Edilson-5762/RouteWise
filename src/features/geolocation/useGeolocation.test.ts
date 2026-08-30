import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useGeolocation } from './useGeolocation';

describe('useGeolocation', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis.navigator, 'geolocation', {
      value: {
        watchPosition: vi.fn(),
        clearWatch: vi.fn(),
        getCurrentPosition: vi.fn(),
      },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it('expõe velocidade e direção quando o navegador fornece esses dados', async () => {
    (navigator.geolocation.watchPosition as ReturnType<typeof vi.fn>).mockImplementation(
      (success: PositionCallback) => {
        success({
          coords: {
            latitude: -23.5505,
            longitude: -46.6333,
            speed: 8.3,
            heading: 90,
          },
        } as GeolocationPosition);
        return 1;
      },
    );

    const { result } = renderHook(() => useGeolocation());

    await waitFor(() => {
      expect(result.current.speedMetersPerSecond).toBe(8.3);
      expect(result.current.headingDegrees).toBe(90);
    });
  });

  it('usa null para direção quando o GPS reporta NaN (dispositivo parado)', async () => {
    (navigator.geolocation.watchPosition as ReturnType<typeof vi.fn>).mockImplementation(
      (success: PositionCallback) => {
        success({
          coords: {
            latitude: -23.5505,
            longitude: -46.6333,
            speed: 0,
            heading: NaN,
          },
        } as GeolocationPosition);
        return 1;
      },
    );

    const { result } = renderHook(() => useGeolocation());

    await waitFor(() => {
      expect(result.current.headingDegrees).toBeNull();
    });
  });

  it('usa null para velocidade/direção quando o navegador não os fornece', async () => {
    (navigator.geolocation.watchPosition as ReturnType<typeof vi.fn>).mockImplementation(
      (success: PositionCallback) => {
        success({
          coords: { latitude: -23.5505, longitude: -46.6333, speed: null, heading: null },
        } as GeolocationPosition);
        return 1;
      },
    );

    const { result } = renderHook(() => useGeolocation());

    await waitFor(() => {
      expect(result.current.speedMetersPerSecond).toBeNull();
      expect(result.current.headingDegrees).toBeNull();
    });
  });

  it('ignora leituras dentro da margem de precisão do GPS (ruído com o dispositivo parado)', async () => {
    let successCallback: PositionCallback | null = null;
    (navigator.geolocation.watchPosition as ReturnType<typeof vi.fn>).mockImplementation(
      (success: PositionCallback) => {
        successCallback = success;
        success({
          coords: { latitude: -23.5505, longitude: -46.6333, accuracy: 15 },
        } as GeolocationPosition);
        return 1;
      },
    );

    const { result } = renderHook(() => useGeolocation());

    await waitFor(() => {
      expect(result.current.position).toEqual({ lat: -23.5505, lng: -46.6333 });
    });

    act(() => {
      // ~11m ao norte: dentro da precisão de 15m informada pelo GPS, deve
      // ser tratado como ruído e não mover o puck.
      successCallback?.({
        coords: { latitude: -23.5506, longitude: -46.6333, accuracy: 15 },
      } as GeolocationPosition);
    });

    expect(result.current.position).toEqual({ lat: -23.5505, lng: -46.6333 });
  });

  it('nunca cai para o modo impreciso — só pede watchPosition em alta precisão', async () => {
    (navigator.geolocation.watchPosition as ReturnType<typeof vi.fn>).mockImplementation(
      (_success: PositionCallback, error: PositionErrorCallback) => {
        // Alta precisão falha por indisponibilidade (fix de GPS ainda "frio").
        error({ code: 2, message: 'unavailable' } as GeolocationPositionError);
        return 1;
      },
    );
    (navigator.geolocation.getCurrentPosition as ReturnType<typeof vi.fn>).mockImplementation(
      (success: PositionCallback) => {
        success({
          coords: { latitude: -23.5505, longitude: -46.6333, accuracy: 10 },
        } as GeolocationPosition);
      },
    );

    const { result } = renderHook(() => useGeolocation());

    await waitFor(() => {
      expect(result.current.position).toEqual({ lat: -23.5505, lng: -46.6333 });
    });
    // Chamado só uma vez, e nunca com enableHighAccuracy: false.
    expect(navigator.geolocation.watchPosition).toHaveBeenCalledTimes(1);
    expect(navigator.geolocation.watchPosition).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ enableHighAccuracy: false }),
    );
    expect(result.current.error).toBeNull();
  });

  it('mostra o erro de permissão negada na hora, sem tentar de novo', async () => {
    (navigator.geolocation.watchPosition as ReturnType<typeof vi.fn>).mockImplementation(
      (_success: PositionCallback, error: PositionErrorCallback) => {
        error({ code: 1, message: 'denied' } as GeolocationPositionError);
        return 1;
      },
    );

    const { result } = renderHook(() => useGeolocation());

    await waitFor(() => {
      expect(result.current.error).toBe(
        'Você negou o acesso à localização. Permita o acesso nas configurações do navegador e tente novamente.',
      );
    });
    expect(navigator.geolocation.watchPosition).toHaveBeenCalledTimes(1);
  });

  it('mostra o erro só depois de várias falhas seguidas do polling sem nenhuma posição', async () => {
    (navigator.geolocation.watchPosition as ReturnType<typeof vi.fn>).mockImplementation(
      (_success: PositionCallback, error: PositionErrorCallback) => {
        error({ code: 2, message: 'unavailable' } as GeolocationPositionError);
        return 1;
      },
    );
    (navigator.geolocation.getCurrentPosition as ReturnType<typeof vi.fn>).mockImplementation(
      (_success: PositionCallback, error: PositionErrorCallback) => {
        error({ code: 2, message: 'unavailable' } as GeolocationPositionError);
      },
    );

    vi.useFakeTimers();
    const { result } = renderHook(() => useGeolocation());

    // Uma única falha do polling ainda não mostra erro.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.error).toBeNull();

    // Depois de 4 falhas seguidas, o erro aparece.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(result.current.error).toBe(
      'Não foi possível determinar sua localização. Verifique se o serviço de localização do sistema está ativado e tente novamente.',
    );
  });

  it('expõe accuracyMeters da leitura do GPS', async () => {
    (navigator.geolocation.watchPosition as ReturnType<typeof vi.fn>).mockImplementation(
      (success: PositionCallback) => {
        success({
          coords: { latitude: -23.5505, longitude: -46.6333, accuracy: 42 },
        } as GeolocationPosition);
        return 1;
      },
    );

    const { result } = renderHook(() => useGeolocation());

    await waitFor(() => {
      expect(result.current.accuracyMeters).toBe(42);
    });
  });

  it('conta em rawUpdateCount todo callback do watch, mesmo quando a leitura é filtrada como ruído', async () => {
    let successCallback: PositionCallback | null = null;
    (navigator.geolocation.watchPosition as ReturnType<typeof vi.fn>).mockImplementation(
      (success: PositionCallback) => {
        successCallback = success;
        success({
          coords: { latitude: -23.5505, longitude: -46.6333, accuracy: 30 },
        } as GeolocationPosition);
        return 1;
      },
    );

    const { result } = renderHook(() => useGeolocation());

    await waitFor(() => {
      expect(result.current.rawUpdateCount).toBe(1);
    });

    // Duas leituras seguidas ~11m adiante: dentro dos 30m de precisão, viram
    // ruído e NÃO movem `position` — mas ainda assim são callbacks do watch.
    act(() => {
      successCallback?.({
        coords: { latitude: -23.5506, longitude: -46.6333, accuracy: 30 },
      } as GeolocationPosition);
      successCallback?.({
        coords: { latitude: -23.5505, longitude: -46.6334, accuracy: 30 },
      } as GeolocationPosition);
    });

    expect(result.current.rawUpdateCount).toBe(3);
    expect(result.current.acceptedUpdateCount).toBe(1);
    expect(result.current.position).toEqual({ lat: -23.5505, lng: -46.6333 });
  });

  it('continua atualizando a posição por polling quando o watch dispara só uma vez', async () => {
    (navigator.geolocation.watchPosition as ReturnType<typeof vi.fn>).mockImplementation(
      (success: PositionCallback) => {
        success({
          coords: { latitude: -15.8, longitude: -48.0, accuracy: 2000 },
        } as GeolocationPosition);
        return 1;
      },
    );
    let pollTick = 0;
    (navigator.geolocation.getCurrentPosition as ReturnType<typeof vi.fn>).mockImplementation(
      (success: PositionCallback) => {
        pollTick += 1;
        success({
          coords: {
            latitude: -15.8 + pollTick * 0.001, // ~111m por tick: movimento real
            longitude: -48.0,
            accuracy: 12,
            speed: 1.5,
          },
        } as GeolocationPosition);
      },
    );

    vi.useFakeTimers();
    const { result } = renderHook(() => useGeolocation());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });

    expect(navigator.geolocation.getCurrentPosition).toHaveBeenCalled();
    expect(result.current.pollUpdateCount).toBeGreaterThan(0);
    expect(result.current.position?.lat).not.toBe(-15.8);
  });

  it('o polling pede alta precisão e sem cache (maximumAge 0)', async () => {
    (navigator.geolocation.watchPosition as ReturnType<typeof vi.fn>).mockImplementation(() => 1);
    (navigator.geolocation.getCurrentPosition as ReturnType<typeof vi.fn>).mockImplementation(
      () => {},
    );

    vi.useFakeTimers();
    renderHook(() => useGeolocation());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(navigator.geolocation.getCurrentPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      expect.objectContaining({ enableHighAccuracy: true, maximumAge: 0 }),
    );
  });

  it('não congela um movimento real quando a precisão informada é ruim (teto do deadband)', async () => {
    let successCallback: PositionCallback | null = null;
    (navigator.geolocation.watchPosition as ReturnType<typeof vi.fn>).mockImplementation(
      (success: PositionCallback) => {
        successCallback = success;
        success({
          coords: { latitude: -23.5505, longitude: -46.6333, accuracy: 500 },
        } as GeolocationPosition);
        return 1;
      },
    );

    const { result } = renderHook(() => useGeolocation());
    await waitFor(() => {
      expect(result.current.position).toEqual({ lat: -23.5505, lng: -46.6333 });
    });

    act(() => {
      // ~33m ao norte: abaixo dos 500m de precisão informada, mas acima do teto
      // de 25m — é movimento real e deve mover o puck.
      successCallback?.({
        coords: { latitude: -23.5502, longitude: -46.6333, accuracy: 500 },
      } as GeolocationPosition);
    });

    expect(result.current.position).toEqual({ lat: -23.5502, lng: -46.6333 });
  });

  it('aceita a leitura na hora quando o GPS reporta velocidade de deslocamento', async () => {
    let successCallback: PositionCallback | null = null;
    (navigator.geolocation.watchPosition as ReturnType<typeof vi.fn>).mockImplementation(
      (success: PositionCallback) => {
        successCallback = success;
        success({
          coords: { latitude: -23.5505, longitude: -46.6333, accuracy: 30, speed: 0 },
        } as GeolocationPosition);
        return 1;
      },
    );

    const { result } = renderHook(() => useGeolocation());
    await waitFor(() => {
      expect(result.current.position).toEqual({ lat: -23.5505, lng: -46.6333 });
    });

    act(() => {
      // ~11m adiante, dentro dos 30m de precisão — mas o GPS reporta 3 m/s,
      // então o aparelho está mesmo se movendo: aceita.
      successCallback?.({
        coords: { latitude: -23.5506, longitude: -46.6333, accuracy: 30, speed: 3 },
      } as GeolocationPosition);
    });

    expect(result.current.position).toEqual({ lat: -23.5506, lng: -46.6333 });
  });

  it('atualiza a posição quando o deslocamento excede a precisão informada pelo GPS', async () => {
    let successCallback: PositionCallback | null = null;
    (navigator.geolocation.watchPosition as ReturnType<typeof vi.fn>).mockImplementation(
      (success: PositionCallback) => {
        successCallback = success;
        success({
          coords: { latitude: -23.5505, longitude: -46.6333, accuracy: 15 },
        } as GeolocationPosition);
        return 1;
      },
    );

    const { result } = renderHook(() => useGeolocation());

    await waitFor(() => {
      expect(result.current.position).toEqual({ lat: -23.5505, lng: -46.6333 });
    });

    act(() => {
      // ~55m ao norte: além da precisão de 15m informada, é um movimento real.
      successCallback?.({
        coords: { latitude: -23.551, longitude: -46.6333, accuracy: 15 },
      } as GeolocationPosition);
    });

    expect(result.current.position).toEqual({ lat: -23.551, lng: -46.6333 });
  });
});
