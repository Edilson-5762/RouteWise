import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { App } from './App';
import * as mapboxClient from './services/mapboxClient';
import * as geoapifyClient from './services/geoapifyClient';

const mapConstructorSpy = vi.fn();
const mapRemoveSpy = vi.fn();

vi.mock('mapbox-gl', () => {
  class FakeMap {
    isStyleLoaded = () => true;
    on = vi.fn();
    off = vi.fn();
    // Invoca o callback de 'style.load' na hora: nestes testes o estilo
    // nunca está de fato "em troca", então o hook (que rastreia isso por
    // conta própria via `styleReadyRef`) precisa ver esse evento na hora.
    once = vi.fn((event: string, handler: () => void) => {
      if (event === 'style.load') {
        handler();
      }
    });
    remove = mapRemoveSpy;
    setCenter = vi.fn();
    constructor(...args: unknown[]) {
      mapConstructorSpy(...args);
    }
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

vi.stubGlobal('speechSynthesis', { speak: vi.fn(), cancel: vi.fn() });
vi.stubGlobal(
  'SpeechSynthesisUtterance',
  vi.fn().mockImplementation((text: string) => ({ text, lang: '' })),
);

describe('App', () => {
  beforeEach(() => {
    mapConstructorSpy.mockClear();
    mapRemoveSpy.mockClear();
    Object.defineProperty(globalThis.navigator, 'geolocation', {
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
    vi.spyOn(geoapifyClient, 'searchPlaces').mockResolvedValue([
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
          maneuverType: 'turn',
          maneuverModifier: null,
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
      expect(screen.getByText(/1 min/)).toBeInTheDocument();
    });
    expect(screen.getByText('Iniciar navegação')).toBeInTheDocument();
  });

  it('planeja a rota mesmo quando o destino é selecionado antes do primeiro fix de GPS', async () => {
    let sendPosition: PositionCallback | null = null;
    Object.defineProperty(globalThis.navigator, 'geolocation', {
      value: {
        watchPosition: vi.fn((success: PositionCallback) => {
          sendPosition = success;
          return 1;
        }),
        clearWatch: vi.fn(),
      },
      configurable: true,
    });

    vi.spyOn(geoapifyClient, 'searchPlaces').mockResolvedValue([
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
          maneuverType: 'turn',
          maneuverModifier: null,
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
    expect(screen.queryByText(/1 min/)).not.toBeInTheDocument();

    // O primeiro fix de GPS chega depois da seleção do destino.
    act(() => {
      sendPosition!({
        coords: { latitude: -23.5505, longitude: -46.6333 },
      } as GeolocationPosition);
    });

    await waitFor(() => {
      expect(screen.getByText(/1 min/)).toBeInTheDocument();
    });
    expect(screen.getByText('Iniciar navegação')).toBeInTheDocument();
  });

  it('chama getDirections apenas uma vez mesmo com múltiplas atualizações de GPS antes da rota resolver', async () => {
    let sendPosition: PositionCallback | null = null;
    Object.defineProperty(globalThis.navigator, 'geolocation', {
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

    vi.spyOn(geoapifyClient, 'searchPlaces').mockResolvedValue([
      {
        id: '1',
        placeName: 'Av. Paulista, São Paulo',
        coordinates: { lat: -23.5613, lng: -46.6564 },
      },
    ]);

    let resolveDirections:
      ((route: Awaited<ReturnType<typeof mapboxClient.getDirections>>) => void) | null = null;
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
            maneuverType: 'turn',
            maneuverModifier: null,
          },
        ],
        distanceMeters: 500,
        durationSeconds: 60,
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/1 min/)).toBeInTheDocument();
    });
    expect(getDirectionsSpy).toHaveBeenCalledTimes(1);
  });

  it('mostra banner de erro quando o cálculo de rota falha, e o retry rechama getDirections', async () => {
    vi.spyOn(geoapifyClient, 'searchPlaces').mockResolvedValue([
      {
        id: '1',
        placeName: 'Av. Paulista, São Paulo',
        coordinates: { lat: -23.5613, lng: -46.6564 },
      },
    ]);
    const getDirectionsSpy = vi
      .spyOn(mapboxClient, 'getDirections')
      .mockRejectedValue(new Error('Falha ao calcular rota: 500'));

    render(<App />);

    fireEvent.change(screen.getByLabelText('Buscar destino'), {
      target: { value: 'Paulista' },
    });
    const option = await screen.findByText('Av. Paulista, São Paulo');
    fireEvent.click(option);

    await waitFor(() => {
      expect(screen.getByText('Falha ao calcular rota: 500')).toBeInTheDocument();
    });
    expect(getDirectionsSpy).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Tentar novamente'));

    await waitFor(() => {
      expect(getDirectionsSpy).toHaveBeenCalledTimes(2);
    });
  });

  it('mostra banner em tela cheia quando a geolocalização é negada, e o retry rechama watchPosition', async () => {
    const watchPositionMock = vi.fn(
      (_success: PositionCallback, error?: PositionErrorCallback | null) => {
        error?.({
          code: 1,
          message: 'User denied Geolocation',
        } as GeolocationPositionError);
        return 1;
      },
    );
    Object.defineProperty(globalThis.navigator, 'geolocation', {
      value: {
        watchPosition: watchPositionMock,
        clearWatch: vi.fn(),
      },
      configurable: true,
    });

    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByText(
          'Você negou o acesso à localização. Permita o acesso nas configurações do navegador e tente novamente.',
        ),
      ).toBeInTheDocument();
    });
    expect(watchPositionMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Tentar novamente'));

    expect(watchPositionMock).toHaveBeenCalledTimes(2);
  });

  it('transiciona para a NavigationView em tela cheia ao iniciar a navegação', async () => {
    vi.spyOn(geoapifyClient, 'searchPlaces').mockResolvedValue([
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
          maneuverType: 'continue',
          maneuverModifier: null,
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

    await screen.findByText('Iniciar navegação');
    fireEvent.click(screen.getByText('Iniciar navegação'));

    await waitFor(() => {
      expect(screen.getByText('Siga em frente')).toBeInTheDocument();
    });
    expect(screen.queryByLabelText('Buscar destino')).not.toBeInTheDocument();
  });

  it('reaproveita a mesma instância do mapa Mapbox ao trocar de tela, em vez de recriá-la', async () => {
    vi.spyOn(geoapifyClient, 'searchPlaces').mockResolvedValue([
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
          maneuverType: 'continue',
          maneuverModifier: null,
        },
      ],
      distanceMeters: 500,
      durationSeconds: 60,
    });

    render(<App />);

    // PlanningView monta o mapa uma vez.
    await waitFor(() => {
      expect(mapConstructorSpy).toHaveBeenCalledTimes(1);
    });

    fireEvent.change(screen.getByLabelText('Buscar destino'), {
      target: { value: 'Paulista' },
    });
    const option = await screen.findByText('Av. Paulista, São Paulo');
    fireEvent.click(option);

    await screen.findByText('Iniciar navegação');
    fireEvent.click(screen.getByText('Iniciar navegação'));

    await waitFor(() => {
      expect(screen.getByText('Siga em frente')).toBeInTheDocument();
    });

    // Trocar para a NavigationView não deveria destruir e recriar o mapa.
    expect(mapConstructorSpy).toHaveBeenCalledTimes(1);
    expect(mapRemoveSpy).not.toHaveBeenCalled();
  });

  it('recalcula a rota a partir da posição atual do GPS ao iniciar a navegação', async () => {
    let sendPosition: PositionCallback | null = null;
    Object.defineProperty(globalThis.navigator, 'geolocation', {
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

    vi.spyOn(geoapifyClient, 'searchPlaces').mockResolvedValue([
      {
        id: '1',
        placeName: 'Av. Paulista, São Paulo',
        coordinates: { lat: -23.5613, lng: -46.6564 },
      },
    ]);
    const getDirectionsSpy = vi.spyOn(mapboxClient, 'getDirections').mockResolvedValue({
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
          maneuverType: 'continue',
          maneuverModifier: null,
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

    await screen.findByText('Iniciar navegação');
    expect(getDirectionsSpy).toHaveBeenCalledTimes(1);

    // O GPS se move um pouco enquanto o usuário ainda está olhando o cartão
    // de destino, antes de apertar "Iniciar navegação".
    act(() => {
      sendPosition!({
        coords: { latitude: -23.5599, longitude: -46.634 },
      } as GeolocationPosition);
    });

    fireEvent.click(screen.getByText('Iniciar navegação'));

    await waitFor(() => {
      expect(getDirectionsSpy).toHaveBeenCalledTimes(2);
    });
    expect(getDirectionsSpy).toHaveBeenLastCalledWith(
      { lat: -23.5599, lng: -46.634 },
      { lat: -23.5613, lng: -46.6564 },
      'driving',
    );
    await waitFor(() => {
      expect(screen.getByText('Siga em frente')).toBeInTheDocument();
    });
  });

  it('tenta recalcular a rota apenas uma vez por episódio de desvio quando o recálculo falha', async () => {
    let sendPosition: PositionCallback | null = null;
    Object.defineProperty(globalThis.navigator, 'geolocation', {
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

    vi.spyOn(geoapifyClient, 'searchPlaces').mockResolvedValue([
      {
        id: '1',
        placeName: 'Av. Paulista, São Paulo',
        coordinates: { lat: -23.5613, lng: -46.6564 },
      },
    ]);

    const initialRoute = {
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
          maneuverType: 'continue',
          maneuverModifier: null,
        },
      ],
      distanceMeters: 500,
      durationSeconds: 60,
    };

    const getDirectionsSpy = vi
      .spyOn(mapboxClient, 'getDirections')
      // 1ª chamada: planejamento inicial. 2ª: recálculo automático que
      // START_NAVIGATION dispara para atualizar a rota a partir da posição
      // atual (ver navigationReducer.ts). Ambas bem-sucedidas, para isolar o
      // cenário de falha no episódio de desvio testado abaixo.
      .mockResolvedValueOnce(initialRoute)
      .mockResolvedValueOnce(initialRoute)
      .mockRejectedValue(new Error('Falha ao recalcular rota: 500'));

    render(<App />);

    fireEvent.change(screen.getByLabelText('Buscar destino'), {
      target: { value: 'Paulista' },
    });
    const option = await screen.findByText('Av. Paulista, São Paulo');
    fireEvent.click(option);

    await screen.findByText('Iniciar navegação');
    fireEvent.click(screen.getByText('Iniciar navegação'));

    await waitFor(() => {
      expect(screen.getByText('Siga em frente')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(getDirectionsSpy).toHaveBeenCalledTimes(2);
    });

    // Primeira posição desviada (bem longe da rota e do destino): dispara uma
    // tentativa de recálculo, que falha.
    act(() => {
      sendPosition!({
        coords: { latitude: -23.7, longitude: -46.9 },
      } as GeolocationPosition);
    });

    await waitFor(() => {
      expect(getDirectionsSpy).toHaveBeenCalledTimes(3);
    });
    await waitFor(() => {
      expect(screen.getByText('Falha ao recalcular rota: 500')).toBeInTheDocument();
    });

    // Segunda posição desviada (ainda no mesmo episódio de desvio): não deve
    // tentar recalcular de novo — o guard de "uma tentativa por desvio" segura.
    act(() => {
      sendPosition!({
        coords: { latitude: -23.71, longitude: -46.91 },
      } as GeolocationPosition);
    });

    expect(getDirectionsSpy).toHaveBeenCalledTimes(3);
  });

  it('permite pesquisar um novo destino depois de sair da navegação pelo botão "X", mesmo com o GPS parado', async () => {
    // O mock padrão de geolocalização (beforeEach) reporta a posição UMA vez
    // só e nunca mais chama `success` de novo — reproduz fielmente um
    // dispositivo parado, o cenário exato em que o bug aparecia: sem manter
    // `origin` no RESET, ele ficava preso em null (nada re-dispara o efeito
    // que o repõe, já que `geolocation.position` nunca muda de referência) e
    // a segunda busca nunca conseguia planejar rota.
    vi.spyOn(geoapifyClient, 'searchPlaces').mockResolvedValue([
      {
        id: '1',
        placeName: 'Av. Paulista, São Paulo',
        coordinates: { lat: -23.5613, lng: -46.6564 },
      },
    ]);
    const getDirectionsSpy = vi.spyOn(mapboxClient, 'getDirections').mockResolvedValue({
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
          maneuverType: 'continue',
          maneuverModifier: null,
        },
      ],
      distanceMeters: 500,
      durationSeconds: 60,
    });

    render(<App />);

    fireEvent.change(screen.getByLabelText('Buscar destino'), {
      target: { value: 'Paulista' },
    });
    fireEvent.click(await screen.findByText('Av. Paulista, São Paulo'));
    await screen.findByText('Iniciar navegação');
    fireEvent.click(screen.getByText('Iniciar navegação'));
    await screen.findByText('Siga em frente');
    expect(getDirectionsSpy).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByLabelText('Sair da navegação'));

    fireEvent.change(await screen.findByLabelText('Buscar destino'), {
      target: { value: 'Paulista' },
    });
    fireEvent.click(await screen.findByText('Av. Paulista, São Paulo'));

    await waitFor(() => {
      expect(getDirectionsSpy).toHaveBeenCalledTimes(3);
    });
    expect(screen.getByText('Iniciar navegação')).toBeInTheDocument();
  });
});
