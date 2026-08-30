import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createRef } from 'react';
import { useMapboxMap } from './useMapboxMap';
import type { Coordinates, Route } from '../../types';

const setLngLatMock = vi.fn().mockReturnThis();
const addToMock = vi.fn().mockReturnThis();
const setRotationMock = vi.fn().mockReturnThis();
const markerRemoveMock = vi.fn();
const fitBoundsMock = vi.fn();
const addSourceMock = vi.fn();
const setDataMock = vi.fn();

let movestartHandler: ((event: { originalEvent?: unknown }) => void) | null = null;
const markerElementBox: { current: HTMLElement | null } = { current: null };
// Leitura via função (em vez de `markerElementBox.current` direto): o TS
// estreita `.current` para `never` quando é lido logo após um reset síncrono
// (`markerElementBox.current = null`) seguido de uma chamada (`renderHook`)
// cujo callback aninhado reatribui a propriedade indiretamente — uma
// limitação conhecida da análise de fluxo de controle do TS para
// propriedades de objeto mutadas por closures não adjacentes.
function currentMarkerElement(): HTMLElement | null {
  return markerElementBox.current;
}

vi.mock('mapbox-gl', () => {
  class FakeMap {
    isStyleLoaded = () => true;
    on = vi.fn((event: string, handler: (event: { originalEvent?: unknown }) => void) => {
      if (event === 'movestart') {
        movestartHandler = handler;
      }
    });
    off = vi.fn();
    // Invoca o callback de 'style.load' na hora (síncrono): o hook usa esse
    // evento só para saber quando um `setStyle` em andamento termina — nestes
    // testes o estilo nunca está realmente "em troca", então o callback deve
    // rodar imediatamente, do jeito que `isStyleLoaded: () => true` fazia
    // antes de o hook passar a rastrear isso por conta própria.
    once = vi.fn((event: string, handler: () => void) => {
      if (event === 'style.load') {
        handler();
      }
    });
    remove = vi.fn();
    setCenter = vi.fn();
    private sourceIds = new Set<string>();
    // Stateful (ao contrário de um simples mockReturnValue(undefined)): o
    // efeito de conexão da linha da rota com a posição do usuário precisa
    // encontrar a source já criada por addSource para poder atualizá-la via
    // setData nos re-renders seguintes, igual ao Mapbox real.
    getSource = vi.fn((id: string) =>
      this.sourceIds.has(id) ? { setData: setDataMock } : undefined,
    );
    addSource = vi.fn((id: string, config: unknown) => {
      this.sourceIds.add(id);
      addSourceMock(id, config);
    });
    addLayer = vi.fn();
    getLayer = vi.fn().mockReturnValue(undefined);
    removeLayer = vi.fn();
    removeSource = vi.fn((id: string) => {
      this.sourceIds.delete(id);
    });
    fitBounds = fitBoundsMock;
    setStyle = vi.fn();
    easeTo = vi.fn();
    getBearing = vi.fn().mockReturnValue(0);
  }
  class FakeMarker {
    setLngLat = setLngLatMock;
    addTo = addToMock;
    setRotation = setRotationMock;
    remove = markerRemoveMock;
    constructor(options?: { element?: HTMLElement }) {
      markerElementBox.current = options?.element ?? null;
    }
  }
  class FakeLngLatBounds {
    extend() {
      return this;
    }
  }
  return {
    default: {
      Map: FakeMap,
      Marker: FakeMarker,
      LngLatBounds: FakeLngLatBounds,
      accessToken: '',
    },
  };
});

const sampleRoute: Route = {
  geometry: [
    { lat: -23.5505, lng: -46.6333 },
    { lat: -23.5605, lng: -46.6433 },
  ],
  steps: [],
  distanceMeters: 1000,
  durationSeconds: 120,
};

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
        travelProfile: 'driving' as const,
        speedMetersPerSecond: null,
      }),
    );

    expect(setLngLatMock).toHaveBeenCalledWith([-46.6333, -23.5505]);
    expect(addToMock).toHaveBeenCalled();
  });

  it('gira o marcador de origem (a seta) de acordo com o heading do GPS', () => {
    const containerRef = createRef<HTMLDivElement>();
    Object.defineProperty(containerRef, 'current', {
      value: document.createElement('div'),
      writable: true,
    });

    const { rerender } = renderHook(
      (props: { headingDegrees: number | null }) =>
        useMapboxMap({
          containerRef,
          origin: { lat: -23.5505, lng: -46.6333 },
          destination: null,
          route: null,
          isNavigating: true,
          theme: 'light',
          travelProfile: 'driving',
          speedMetersPerSecond: null,
          ...props,
        }),
      { initialProps: { headingDegrees: null } as { headingDegrees: number | null } },
    );

    rerender({ headingDegrees: 200 });

    expect(setRotationMock).toHaveBeenCalledWith(200);
  });

  it('mantém o último heading real em vez de girar para o norte quando o GPS fica sem heading (veículo parado)', () => {
    setRotationMock.mockClear();
    const containerRef = createRef<HTMLDivElement>();
    Object.defineProperty(containerRef, 'current', {
      value: document.createElement('div'),
      writable: true,
    });

    const { rerender } = renderHook(
      (props: { headingDegrees: number | null }) =>
        useMapboxMap({
          containerRef,
          origin: { lat: -23.5505, lng: -46.6333 },
          destination: null,
          route: null,
          isNavigating: true,
          theme: 'light',
          travelProfile: 'driving',
          speedMetersPerSecond: null,
          ...props,
        }),
      { initialProps: { headingDegrees: 200 } as { headingDegrees: number | null } },
    );

    setRotationMock.mockClear();
    rerender({ headingDegrees: null });

    expect(setRotationMock).not.toHaveBeenCalled();
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
          travelProfile: 'driving',
          speedMetersPerSecond: null,
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

    expect(result.current.mapRef.current?.easeTo).toHaveBeenCalledWith(
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
          travelProfile: 'driving',
          speedMetersPerSecond: null,
          ...props,
        }),
      { initialProps: { isNavigating: true } },
    );

    rerender({ isNavigating: false });

    expect(result.current.mapRef.current?.easeTo).toHaveBeenCalledWith(
      expect.objectContaining({ pitch: 0, bearing: 0 }),
    );
  });

  it('não recentraliza no GPS (setCenter) quando uma rota já está planejada, mesmo com o GPS atualizando', () => {
    // Reproduz o bug reportado (print do usuário: cartão de destino "cobrindo"
    // o trajeto mesmo depois do fitBounds já enquadrar a rota inteira):
    // qualquer atualização de `origin` (GPS) fora do modo de navegação disparava
    // `map.setCenter(origin)`, brigando com o `fitBounds` do efeito de rota (que
    // enquadra a rota inteira) e recentralizando o mapa só no ponto do usuário —
    // desfazendo o enquadramento assim que qualquer leitura de GPS chegasse
    // enquanto o usuário olhava o cartão de destino.
    const containerRef = createRef<HTMLDivElement>();
    Object.defineProperty(containerRef, 'current', {
      value: document.createElement('div'),
      writable: true,
    });

    const { result, rerender } = renderHook(
      (props: { origin: Coordinates }) =>
        useMapboxMap({
          containerRef,
          destination: null,
          route: sampleRoute,
          isNavigating: false,
          headingDegrees: null,
          theme: 'light',
          travelProfile: 'driving',
          speedMetersPerSecond: null,
          ...props,
        }),
      { initialProps: { origin: { lat: -23.5505, lng: -46.6333 } } },
    );

    const setCenterMock = result.current.mapRef.current?.setCenter as ReturnType<typeof vi.fn>;
    setCenterMock.mockClear();

    rerender({ origin: { lat: -23.5507, lng: -46.6335 } });

    expect(setCenterMock).not.toHaveBeenCalled();
  });

  it('recentraliza no GPS (setCenter) quando ainda não há rota planejada (estado inicial/ocioso)', () => {
    const containerRef = createRef<HTMLDivElement>();
    Object.defineProperty(containerRef, 'current', {
      value: document.createElement('div'),
      writable: true,
    });

    const { result, rerender } = renderHook(
      (props: { origin: Coordinates }) =>
        useMapboxMap({
          containerRef,
          destination: null,
          route: null,
          isNavigating: false,
          headingDegrees: null,
          theme: 'light',
          travelProfile: 'driving',
          speedMetersPerSecond: null,
          ...props,
        }),
      { initialProps: { origin: { lat: -23.5505, lng: -46.6333 } } },
    );

    const setCenterMock = result.current.mapRef.current?.setCenter as ReturnType<typeof vi.fn>;
    setCenterMock.mockClear();

    rerender({ origin: { lat: -23.5507, lng: -46.6335 } });

    expect(setCenterMock).toHaveBeenCalledWith([-46.6335, -23.5507]);
  });

  it('remove o marcador de destino do mapa quando a rota é cancelada (destination volta a null)', () => {
    // Sem isso, cancelar o trajeto ou sair da navegação limpava `destination`
    // no estado do app, mas o pino vermelho ficava preso no mapa para
    // sempre — o efeito só cria/atualiza o marcador, nunca o remove (o
    // sintoma do print: pino vermelho ainda visível numa tela que já
    // deveria estar "em branco", sem destino nenhum).
    markerRemoveMock.mockClear();
    const containerRef = createRef<HTMLDivElement>();
    Object.defineProperty(containerRef, 'current', {
      value: document.createElement('div'),
      writable: true,
    });

    const { rerender } = renderHook(
      (props: { destination: Coordinates | null }) =>
        useMapboxMap({
          containerRef,
          origin: { lat: -23.5505, lng: -46.6333 },
          route: null,
          isNavigating: false,
          headingDegrees: null,
          theme: 'light',
          travelProfile: 'driving',
          speedMetersPerSecond: null,
          ...props,
        }),
      {
        initialProps: { destination: { lat: -23.56, lng: -46.65 } } as {
          destination: Coordinates | null;
        },
      },
    );

    expect(markerRemoveMock).not.toHaveBeenCalled();

    rerender({ destination: null });

    expect(markerRemoveMock).toHaveBeenCalledTimes(1);
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
          travelProfile: 'driving',
          speedMetersPerSecond: null,
          ...props,
        }),
      { initialProps: { theme: 'light' } as { theme: 'light' | 'dark' } },
    );

    rerender({ theme: 'dark' });

    expect(result.current.mapRef.current?.setStyle).toHaveBeenCalledWith(
      'mapbox://styles/mapbox/navigation-night-v1',
    );
  });

  it('para de seguir automaticamente quando o usuário arrasta o mapa durante a navegação', () => {
    movestartHandler = null;
    const containerRef = createRef<HTMLDivElement>();
    Object.defineProperty(containerRef, 'current', {
      value: document.createElement('div'),
      writable: true,
    });

    const { result, rerender } = renderHook(
      (props: { headingDegrees: number | null }) =>
        useMapboxMap({
          containerRef,
          origin: { lat: -23.5505, lng: -46.6333 },
          destination: null,
          route: null,
          isNavigating: true,
          theme: 'light',
          travelProfile: 'driving',
          speedMetersPerSecond: null,
          ...props,
        }),
      { initialProps: { headingDegrees: null } as { headingDegrees: number | null } },
    );

    expect(result.current.isFollowingUser).toBe(true);

    act(() => {
      movestartHandler?.({ originalEvent: { type: 'touchmove' } });
    });

    expect(result.current.isFollowingUser).toBe(false);

    const easeToCallsBefore = (result.current.mapRef.current?.easeTo as ReturnType<typeof vi.fn>)
      .mock.calls.length;
    rerender({ headingDegrees: 90 });
    expect(
      (result.current.mapRef.current?.easeTo as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBe(easeToCallsBefore);
  });

  it('volta a seguir e recentraliza a câmera ao chamar recenter()', () => {
    movestartHandler = null;
    const containerRef = createRef<HTMLDivElement>();
    Object.defineProperty(containerRef, 'current', {
      value: document.createElement('div'),
      writable: true,
    });

    const { result } = renderHook(() =>
      useMapboxMap({
        containerRef,
        origin: { lat: -23.5505, lng: -46.6333 },
        destination: null,
        route: null,
        isNavigating: true,
        headingDegrees: 90,
        theme: 'light',
        travelProfile: 'driving',
        speedMetersPerSecond: null,
      }),
    );

    act(() => {
      movestartHandler?.({ originalEvent: { type: 'touchmove' } });
    });
    expect(result.current.isFollowingUser).toBe(false);

    act(() => {
      result.current.recenter();
    });

    expect(result.current.isFollowingUser).toBe(true);
    expect(result.current.mapRef.current?.easeTo).toHaveBeenCalledWith(
      expect.objectContaining({ pitch: 60, bearing: 90, zoom: 17 }),
    );
  });

  it('ajusta a câmera para caber a rota inteira (fitBounds) durante o planejamento', () => {
    fitBoundsMock.mockClear();
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
        route: sampleRoute,
        isNavigating: false,
        headingDegrees: null,
        theme: 'light',
        travelProfile: 'driving',
        speedMetersPerSecond: null,
      }),
    );

    expect(fitBoundsMock).toHaveBeenCalled();
  });

  it('soma a altura real do cabeçalho/cartão de destino (chromeInsets) ao padding do fitBounds', () => {
    // Sem isso, o fitBounds usava um padding fixo de 48px em todo lado,
    // então o cartão de destino (que cobre boa parte da tela embaixo, com
    // altura variável) escondia o trecho final da rota atrás dele — o
    // sintoma reportado ("informações cobrindo o trajeto").
    fitBoundsMock.mockClear();
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
        route: sampleRoute,
        isNavigating: false,
        headingDegrees: null,
        theme: 'light',
        travelProfile: 'driving',
        speedMetersPerSecond: null,
        chromeInsets: { top: 100, bottom: 260 },
      }),
    );

    expect(fitBoundsMock).toHaveBeenCalled();
    const options = fitBoundsMock.mock.calls.at(-1)?.[1];
    expect(options.padding).toEqual({ top: 124, bottom: 284, left: 24, right: 24 });
  });

  it('não ajusta a câmera para caber a rota inteira (fitBounds) durante a navegação', () => {
    fitBoundsMock.mockClear();
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
        route: sampleRoute,
        isNavigating: true,
        headingDegrees: null,
        theme: 'light',
        travelProfile: 'driving',
        speedMetersPerSecond: null,
      }),
    );

    expect(fitBoundsMock).not.toHaveBeenCalled();
  });

  it('ignora movimentos de câmera programáticos (sem originalEvent) ao decidir parar de seguir', () => {
    movestartHandler = null;
    const containerRef = createRef<HTMLDivElement>();
    Object.defineProperty(containerRef, 'current', {
      value: document.createElement('div'),
      writable: true,
    });

    const { result } = renderHook(() =>
      useMapboxMap({
        containerRef,
        origin: { lat: -23.5505, lng: -46.6333 },
        destination: null,
        route: null,
        isNavigating: true,
        headingDegrees: null,
        theme: 'light',
        travelProfile: 'driving',
        speedMetersPerSecond: null,
      }),
    );

    act(() => {
      movestartHandler?.({});
    });

    expect(result.current.isFollowingUser).toBe(true);
  });

  it('inclui um trecho conectando a posição real do usuário ao início da rota (rota colada na via mais próxima)', () => {
    addSourceMock.mockClear();
    const containerRef = createRef<HTMLDivElement>();
    Object.defineProperty(containerRef, 'current', {
      value: document.createElement('div'),
      writable: true,
    });

    const origin = { lat: -15.8, lng: -48.0 };

    renderHook(() =>
      useMapboxMap({
        containerRef,
        origin,
        destination: null,
        route: sampleRoute,
        isNavigating: true,
        headingDegrees: null,
        theme: 'light',
        travelProfile: 'driving',
        speedMetersPerSecond: null,
      }),
    );

    expect(addSourceMock).toHaveBeenCalled();
    const [, config] = addSourceMock.mock.calls[0] as [
      string,
      { data: GeoJSON.Feature<GeoJSON.LineString> },
    ];
    const coordinates = config.data.geometry.coordinates;
    expect(coordinates[0]).toEqual([origin.lng, origin.lat]);
    expect(coordinates[1]).toEqual([sampleRoute.geometry[0].lng, sampleRoute.geometry[0].lat]);
  });

  it('não duplica o ponto inicial quando a origem já coincide com o início da rota', () => {
    addSourceMock.mockClear();
    const containerRef = createRef<HTMLDivElement>();
    Object.defineProperty(containerRef, 'current', {
      value: document.createElement('div'),
      writable: true,
    });

    renderHook(() =>
      useMapboxMap({
        containerRef,
        origin: sampleRoute.geometry[0],
        destination: null,
        route: sampleRoute,
        isNavigating: true,
        headingDegrees: null,
        theme: 'light',
        travelProfile: 'driving',
        speedMetersPerSecond: null,
      }),
    );

    const [, config] = addSourceMock.mock.calls[0] as [
      string,
      { data: GeoJSON.Feature<GeoJSON.LineString> },
    ];
    const coordinates = config.data.geometry.coordinates;
    expect(coordinates).toHaveLength(sampleRoute.geometry.length);
    expect(coordinates[0]).toEqual([sampleRoute.geometry[0].lng, sampleRoute.geometry[0].lat]);
  });

  it('atualiza a conexão da linha quando a posição do usuário muda, sem reajustar o enquadramento da câmera', () => {
    addSourceMock.mockClear();
    setDataMock.mockClear();
    const containerRef = createRef<HTMLDivElement>();
    Object.defineProperty(containerRef, 'current', {
      value: document.createElement('div'),
      writable: true,
    });

    const { rerender } = renderHook(
      (props: { origin: Coordinates }) =>
        useMapboxMap({
          containerRef,
          origin: props.origin,
          destination: null,
          route: sampleRoute,
          isNavigating: false,
          headingDegrees: null,
          theme: 'light',
          travelProfile: 'driving',
          speedMetersPerSecond: null,
        }),
      { initialProps: { origin: { lat: -15.8, lng: -48.0 } } },
    );

    fitBoundsMock.mockClear();
    const movedOrigin = { lat: -15.81, lng: -48.01 };
    rerender({ origin: movedOrigin });

    expect(setDataMock).toHaveBeenCalled();
    const lastCall = setDataMock.mock.calls.at(-1)?.[0] as GeoJSON.Feature<GeoJSON.LineString>;
    expect(lastCall.geometry.coordinates[0]).toEqual([movedOrigin.lng, movedOrigin.lat]);
    expect(fitBoundsMock).not.toHaveBeenCalled();
  });

  it('mostra 0 km/h no selo de velocidade do puck assim que ele é criado (mesmo sem o GPS ainda ter reportado velocidade)', () => {
    markerElementBox.current = null;
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
        theme: 'light',
        travelProfile: 'driving',
        speedMetersPerSecond: null,
      }),
    );

    expect(
      currentMarkerElement()?.querySelector('[data-testid="user-puck-speed"]')?.textContent,
    ).toBe('0 km/h');
  });

  it('atualiza o selo de velocidade do puck quando o GPS reporta uma nova velocidade', () => {
    markerElementBox.current = null;
    const containerRef = createRef<HTMLDivElement>();
    Object.defineProperty(containerRef, 'current', {
      value: document.createElement('div'),
      writable: true,
    });

    const { rerender } = renderHook(
      (props: { speedMetersPerSecond: number | null }) =>
        useMapboxMap({
          containerRef,
          origin: { lat: -23.5505, lng: -46.6333 },
          destination: null,
          route: null,
          isNavigating: false,
          headingDegrees: null,
          theme: 'light',
          travelProfile: 'driving',
          ...props,
        }),
      { initialProps: { speedMetersPerSecond: null } as { speedMetersPerSecond: number | null } },
    );

    rerender({ speedMetersPerSecond: 10 });

    expect(
      currentMarkerElement()?.querySelector('[data-testid="user-puck-speed"]')?.textContent,
    ).toBe('36 km/h');
  });

  it('mostra o ícone do veículo correspondente ao modo de transporte selecionado no puck', () => {
    markerElementBox.current = null;
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
        isNavigating: true,
        headingDegrees: null,
        theme: 'light',
        travelProfile: 'motorcycling',
        speedMetersPerSecond: null,
      }),
    );

    const icon = currentMarkerElement()?.querySelector('[data-testid="user-puck-icon"] svg');
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute('data-vehicle-avatar')).toBe('motorcycle');
  });

  it('expõe a instância do mapa (mapInstance) depois de criada, para consumidores que precisam de um valor reativo', () => {
    const containerRef = createRef<HTMLDivElement>();
    Object.defineProperty(containerRef, 'current', {
      value: document.createElement('div'),
      writable: true,
    });

    const { result } = renderHook(() =>
      useMapboxMap({
        containerRef,
        origin: null,
        destination: null,
        route: null,
        isNavigating: false,
        headingDegrees: null,
        theme: 'light',
        travelProfile: 'driving',
        speedMetersPerSecond: null,
      }),
    );

    expect(result.current.mapInstance).toBe(result.current.mapRef.current);
    expect(result.current.mapInstance).not.toBeNull();
  });

  it('atualiza o ícone do puck quando o modo de transporte selecionado muda', () => {
    markerElementBox.current = null;
    const containerRef = createRef<HTMLDivElement>();
    Object.defineProperty(containerRef, 'current', {
      value: document.createElement('div'),
      writable: true,
    });

    const { rerender } = renderHook(
      (props: { travelProfile: 'driving' | 'motorcycling' | 'walking' | 'cycling' }) =>
        useMapboxMap({
          containerRef,
          origin: { lat: -23.5505, lng: -46.6333 },
          destination: null,
          route: null,
          isNavigating: true,
          headingDegrees: null,
          theme: 'light',
          speedMetersPerSecond: null,
          ...props,
        }),
      { initialProps: { travelProfile: 'driving' } },
    );

    expect(
      currentMarkerElement()
        ?.querySelector('[data-testid="user-puck-icon"] svg')
        ?.getAttribute('data-vehicle-avatar'),
    ).toBe('car');

    rerender({ travelProfile: 'cycling' });

    expect(
      currentMarkerElement()
        ?.querySelector('[data-testid="user-puck-icon"] svg')
        ?.getAttribute('data-vehicle-avatar'),
    ).toBe('bicycle');
  });
});
