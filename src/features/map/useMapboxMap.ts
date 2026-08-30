import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import mapboxgl from 'mapbox-gl';
import type { Coordinates, MapChromeInsets, Route, TravelProfile } from '../../types';
import type { Feature, LineString } from 'geojson';
import { getPuckIconMarkup } from '../../utils/vehicleAvatar';
import { formatSpeedKmh } from '../../utils/format';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

const ROUTE_SOURCE_ID = 'route-source';
const ROUTE_CASING_LAYER_ID = 'route-casing-layer';
const ROUTE_LAYER_ID = 'route-layer';
const DAY_STYLE = 'mapbox://styles/mapbox/navigation-day-v1';
const NIGHT_STYLE = 'mapbox://styles/mapbox/navigation-night-v1';

// A Directions API do Mapbox gruda ("snap") a origem informada no ponto
// roteável mais próximo — confirmado com uma chamada real: uma origem a
// ~92m de distância da via mais próxima teve seu primeiro ponto de rota
// devolvido ali, não na coordenada de GPS enviada. Sem esse trecho de
// conexão, a linha azul nasce "na pista" enquanto o puck (posição real do
// usuário) fica visivelmente flutuando ao lado dela sempre que o usuário
// não está exatamente sobre uma via — o comportamento reproduzido no print
// enviado pelo usuário. Prepend a origem real como primeiro ponto resolve
// isso visualmente, à la Waze, sem alterar a rota/ETA calculados (que
// continuam vindo do ponto já snapado).
function buildRouteGeojson(route: Route, connectorOrigin: Coordinates | null): Feature<LineString> {
  const coordinates: [number, number][] = route.geometry.map((point) => [point.lng, point.lat]);
  const [firstLng, firstLat] = coordinates[0] ?? [];
  const isAlreadyAtOrigin =
    connectorOrigin !== null &&
    firstLng === connectorOrigin.lng &&
    firstLat === connectorOrigin.lat;

  if (connectorOrigin && !isAlreadyAtOrigin) {
    coordinates.unshift([connectorOrigin.lng, connectorOrigin.lat]);
  }

  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates },
  };
}

interface UseMapboxMapOptions {
  containerRef: RefObject<HTMLDivElement>;
  origin: Coordinates | null;
  destination: Coordinates | null;
  route: Route | null;
  isNavigating: boolean;
  headingDegrees: number | null;
  theme: 'light' | 'dark';
  travelProfile: TravelProfile;
  speedMetersPerSecond: number | null;
  chromeInsets?: MapChromeInsets;
}

const DEFAULT_CHROME_INSETS: MapChromeInsets = { top: 0, bottom: 0 };
// Margem extra além da área efetivamente coberta pelo cabeçalho/cartão, para
// a rota não nascer/terminar colada na borda desses painéis.
const FIT_BOUNDS_BREATHING_ROOM_PX = 24;

// Puck de localização apontando para o heading do GPS — a própria rotação do
// marcador (setRotation, abaixo) já faz o ícone servir de seta de direção,
// sem precisar de uma seta separada.
//
// Todo modo de transporte usa um avatar ilustrado (ver `vehicleAvatar.ts`),
// exibido "solto" sobre o mapa como no Waze — sem disco de fundo, que faria a
// ilustração parecer presa dentro de um botão.
function applyPuckContainerStyle(el: HTMLDivElement): void {
  el.style.cssText = '';
  Object.assign(el.style, {
    position: 'relative',
    width: '46px',
    height: '46px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
  });
}

function applyPuckSpeedBadgePosition(speedBadge: HTMLDivElement): void {
  speedBadge.style.top = '-15px';
}

function createPuckElement(travelProfile: TravelProfile): {
  element: HTMLDivElement;
  iconContainer: HTMLDivElement;
  speedBadge: HTMLDivElement;
} {
  const el = document.createElement('div');
  el.setAttribute('data-testid', 'user-puck');
  applyPuckContainerStyle(el);

  const iconContainer = document.createElement('div');
  iconContainer.setAttribute('data-testid', 'user-puck-icon');
  Object.assign(iconContainer.style, { display: 'flex' });
  iconContainer.innerHTML = getPuckIconMarkup(travelProfile);
  el.appendChild(iconContainer);

  // Selo de velocidade (ex.: "0 km/h") preso ao puck, igual ao avatar do
  // Waze na tela inicial. Fica fora de `iconContainer` (que gira junto com
  // o marcador via setRotation) e é contra-rotacionado a cada heading (ver
  // efeito de rotação abaixo) para permanecer sempre legível na vertical.
  const speedBadge = document.createElement('div');
  speedBadge.setAttribute('data-testid', 'user-puck-speed');
  Object.assign(speedBadge.style, {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    background: '#111827',
    color: '#ffffff',
    fontSize: '10px',
    fontWeight: '700',
    lineHeight: '1',
    padding: '3px 6px',
    borderRadius: '9999px',
    whiteSpace: 'nowrap',
    boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
  });
  applyPuckSpeedBadgePosition(speedBadge);
  speedBadge.textContent = formatSpeedKmh(null);
  el.appendChild(speedBadge);

  return { element: el, iconContainer, speedBadge };
}

export function useMapboxMap({
  containerRef,
  origin,
  destination,
  route,
  isNavigating,
  headingDegrees,
  theme,
  travelProfile,
  speedMetersPerSecond,
  chromeInsets = DEFAULT_CHROME_INSETS,
}: UseMapboxMapOptions) {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const originMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const puckIconContainerRef = useRef<HTMLDivElement | null>(null);
  const speedBadgeRef = useRef<HTMLDivElement | null>(null);
  const destinationMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const [isFollowingUser, setIsFollowingUser] = useState(true);
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null);
  // Lido (não como dependência) só no momento em que o marcador é criado —
  // igual ao restante deste hook, o efeito abaixo intencionalmente não
  // reage a mudanças de travelProfile após a criação; a troca de ícone em
  // um marcador já existente é responsabilidade do efeito dedicado mais
  // abaixo (deps `[travelProfile]`).
  const travelProfileRef = useRef(travelProfile);
  travelProfileRef.current = travelProfile;
  // Lido (não como dependência) só na criação/recriação da source da rota —
  // atualizações de origem depois disso são responsabilidade do efeito
  // dedicado mais abaixo (deps `[route, origin]`), que só chama setData sem
  // reajustar fitBounds/layers a cada tick de GPS.
  const originRef = useRef(origin);
  originRef.current = origin;
  const skipInitialStyleEffectRef = useRef(true);
  // Rastreia se o *estilo em si* (a folha de estilo carregada via
  // construtor/setStyle) já terminou de carregar — ao contrário de
  // `map.isStyleLoaded()`, que também retorna `false` enquanto qualquer
  // source (inclusive a nossa source de rota, um GeoJSON comum) ainda está
  // processando seus dados. Usar `isStyleLoaded()` como sinal de "posso
  // desenhar a rota agora" fazia o efeito de rota, ao rodar de novo logo
  // depois de adicionar a própria source (ex.: quando o padding do
  // fitBounds é recalculado com a altura real do cartão de destino), cair
  // no branch de "esperar `style.load`" — evento que não viria de novo
  // (não houve troca de estilo nenhuma), perdendo esse fitBounds corrigido
  // para sempre e deixando a câmera presa no enquadramento errado do
  // primeiro fitBounds (sem a altura do cartão).
  const styleReadyRef = useRef(false);
  // Último enquadramento (bounds + padding) calculado pelo efeito de rota,
  // para o botão "Centralizar" poder reaplicá-lo sem recalcular nada.
  const lastRouteFitRef = useRef<{
    bounds: mapboxgl.LngLatBounds;
    padding: { top: number; bottom: number; left: number; right: number };
  } | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    // Usa a origem e o modo de navegação já conhecidos no primeiro mount (em vez
    // de um centro fixo em São Paulo) porque NavigationView monta uma instância
    // nova do mapa a cada troca de tela — sem isso a câmera nascia longe da
    // posição real e o efeito de câmera de condução abaixo a animava (easeTo)
    // até o usuário, fazendo o puck parecer "voar"/se mover sozinho ao iniciar.
    mapRef.current = new mapboxgl.Map({
      container: containerRef.current,
      style: theme === 'dark' ? NIGHT_STYLE : DAY_STYLE,
      center: origin ? [origin.lng, origin.lat] : [-46.6333, -23.5505],
      zoom: isNavigating ? 17 : 12,
      pitch: isNavigating ? 60 : 0,
      bearing: isNavigating && headingDegrees != null ? headingDegrees : 0,
    });
    // A instância acima já nasce com o estilo correto — marca a próxima
    // rodada do efeito de tema (abaixo) para pular a chamada de setStyle
    // dela, evitando um reload de estilo redundante logo no mount desta
    // instância (ver comentário nesse efeito).
    skipInitialStyleEffectRef.current = true;
    styleReadyRef.current = false;
    mapRef.current.once('style.load', () => {
      styleReadyRef.current = true;
    });
    setMapInstance(mapRef.current);

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      originMarkerRef.current = null;
      destinationMarkerRef.current = null;
      setMapInstance(null);
    };
  }, [containerRef]);

  // Um pan/zoom/rotação disparado pelo próprio usuário sempre carrega
  // `originalEvent` (o gesto de origem); movimentos de câmera programáticos
  // (easeTo/flyTo, usados pelo efeito de seguir localização abaixo) não
  // carregam. Isso permite distinguir "usuário mexeu no mapa" de "o app
  // recentralizou sozinho" e é o que liga/desliga o botão de recentralizar.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const handleUserMove = (event: { originalEvent?: unknown }) => {
      if (event.originalEvent) {
        setIsFollowingUser(false);
      }
    };

    map.on('movestart', handleUserMove);
    return () => {
      map.off('movestart', handleUserMove);
    };
  }, [containerRef]);

  // Sempre que uma navegação começa, volta a seguir a posição do usuário
  // automaticamente (ignora qualquer pan manual feito antes/depois da
  // navegação anterior).
  useEffect(() => {
    if (isNavigating) {
      setIsFollowingUser(true);
    }
  }, [isNavigating]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !origin) {
      return;
    }

    if (!originMarkerRef.current) {
      const { element, iconContainer, speedBadge } = createPuckElement(travelProfileRef.current);
      puckIconContainerRef.current = iconContainer;
      speedBadgeRef.current = speedBadge;
      originMarkerRef.current = new mapboxgl.Marker({
        element,
        rotationAlignment: 'map',
        pitchAlignment: 'map',
      })
        .setLngLat([origin.lng, origin.lat])
        .addTo(map);
    } else {
      originMarkerRef.current.setLngLat([origin.lng, origin.lat]);
    }
    // Só gira o puck quando o GPS reporta um heading real. `heading` vem NaN
    // (já normalizado para null em useGeolocation) sempre que o dispositivo
    // está parado — resetar a rotação para 0 (norte) nesse momento faria a
    // seta "voltar" para o norte a cada leitura parada, parecendo se mover
    // sozinha mesmo com o veículo desligado. Mantém o último heading real.
    if (headingDegrees !== null) {
      originMarkerRef.current.setRotation(headingDegrees);
      // Contra-rotaciona o selo de velocidade: ele é filho do elemento que o
      // Marker gira via setRotation, então sem isso o "0 km/h" ficaria de
      // lado/de cabeça para baixo junto com o ícone do veículo.
      if (speedBadgeRef.current) {
        speedBadgeRef.current.style.transform = `translateX(-50%) rotate(${-headingDegrees}deg)`;
      }
    }

    // Só recentraliza no GPS aqui no estado ocioso, sem rota nenhuma ainda
    // (ex.: assim que o app abre) — uma vez que existe uma rota planejada, é
    // o `fitBounds` do efeito de rota, mais abaixo, quem manda no
    // enquadramento da câmera (mostrando a rota inteira). Sem esse `!route`,
    // qualquer atualização de GPS enquanto o usuário olha o cartão de
    // destino chamava `setCenter` e desfazia esse enquadramento,
    // recentralizando o mapa só no ponto do usuário — o sintoma reportado
    // (cartão "cobrindo" o trajeto mesmo com o padding do fitBounds certo).
    if (!isNavigating && !route) {
      map.setCenter([origin.lng, origin.lat]);
    }
  }, [origin, isNavigating, headingDegrees, route]);

  // Redesenha o ícone do puck quando o modo de transporte selecionado muda
  // (só antes de iniciar a navegação, por regra do produto — spec §2). O
  // marcador em si só é criado uma vez pelo efeito acima, então a troca de
  // modo precisa reescrever o conteúdo do container separadamente. A moldura
  // do container e a posição do selo de velocidade não mudam por modo (todo
  // avatar usa o mesmo tratamento "solto", sem disco de fundo).
  useEffect(() => {
    if (puckIconContainerRef.current) {
      puckIconContainerRef.current.innerHTML = getPuckIconMarkup(travelProfile);
    }
  }, [travelProfile]);

  // Mantém o selo "X km/h" do puck em dia com o que o GPS reporta — sempre
  // visível, com "0 km/h" antes de qualquer velocidade real ser reportada,
  // igual ao avatar do Waze na tela inicial (ver `formatSpeedKmh`).
  useEffect(() => {
    if (speedBadgeRef.current) {
      speedBadgeRef.current.textContent = formatSpeedKmh(speedMetersPerSecond);
    }
  }, [speedMetersPerSecond]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    // Remove o pino do mapa quando o destino é limpo (cancelar trajeto, sair
    // da navegação) — sem isso ele ficava preso ali para sempre, já que o
    // resto deste efeito só cria/atualiza o marcador, nunca o remove.
    if (!destination) {
      if (destinationMarkerRef.current) {
        destinationMarkerRef.current.remove();
        destinationMarkerRef.current = null;
      }
      return;
    }

    if (!destinationMarkerRef.current) {
      destinationMarkerRef.current = new mapboxgl.Marker({ color: '#dc2626' })
        .setLngLat([destination.lng, destination.lat])
        .addTo(map);
    } else {
      destinationMarkerRef.current.setLngLat([destination.lng, destination.lat]);
    }
  }, [destination]);

  // Runs before the route effect below (hook declaration order — both depend on
  // `theme`, and effects fire in the order they're declared within a commit) so
  // that when theme changes, setStyle() has already been called by the time the
  // route effect checks `styleReadyRef`. That ordering is what makes the route
  // effect correctly see the style as "not loaded" and register a 'style.load'
  // listener instead of racing to redraw onto the style that's about to be torn
  // down by setStyle.
  //
  // Pula a primeira rodada deste efeito (logo no mount): a instância criada no
  // efeito acima já nasce com o estilo certo, então chamar `setStyle` de novo
  // aqui seria um reload redundante do mesmo estilo.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }
    if (skipInitialStyleEffectRef.current) {
      skipInitialStyleEffectRef.current = false;
      return;
    }
    styleReadyRef.current = false;
    map.setStyle(theme === 'dark' ? NIGHT_STYLE : DAY_STYLE);
    map.once('style.load', () => {
      styleReadyRef.current = true;
    });
  }, [theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    if (!route) {
      lastRouteFitRef.current = null;
      const clearRoute = () => {
        if (map.getSource(ROUTE_SOURCE_ID)) {
          if (map.getLayer(ROUTE_LAYER_ID)) {
            map.removeLayer(ROUTE_LAYER_ID);
          }
          if (map.getLayer(ROUTE_CASING_LAYER_ID)) {
            map.removeLayer(ROUTE_CASING_LAYER_ID);
          }
          map.removeSource(ROUTE_SOURCE_ID);
        }
      };

      if (styleReadyRef.current) {
        clearRoute();
      } else {
        map.once('style.load', clearRoute);
      }
      return;
    }

    const geojson = buildRouteGeojson(route, originRef.current);

    const applyRoute = () => {
      const source = map.getSource(ROUTE_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
      if (source) {
        source.setData(geojson);
      } else {
        map.addSource(ROUTE_SOURCE_ID, { type: 'geojson', data: geojson });
        // Contorno branco por baixo da linha da rota: garante contraste
        // contra os estilos navigation-day/night (que já usam tons de azul
        // nas próprias vias) tanto no claro quanto no escuro.
        map.addLayer({
          id: ROUTE_CASING_LAYER_ID,
          type: 'line',
          source: ROUTE_SOURCE_ID,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': '#ffffff',
            'line-width': ['interpolate', ['linear'], ['zoom'], 10, 6, 18, 13],
            'line-opacity': 0.95,
          },
        });
        map.addLayer({
          id: ROUTE_LAYER_ID,
          type: 'line',
          source: ROUTE_SOURCE_ID,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': '#2563eb',
            'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3, 18, 8],
          },
        });
      }

      // Enquadra a rota inteira só no planejamento. Durante a navegação, o
      // efeito de câmera de condução abaixo é quem manda no zoom/pitch/bearing
      // (visão de perto, seguindo o usuário) — deixar o fitBounds rodar aqui
      // também fazia a câmera saltar para a visão geral por cima da visão de
      // condução sempre que a rota era (re)desenhada durante a navegação.
      if (!isNavigating && route.geometry.length > 0) {
        const [first, ...rest] = route.geometry;
        const bounds = rest.reduce(
          (acc, point) => acc.extend([point.lng, point.lat]),
          new mapboxgl.LngLatBounds([first.lng, first.lat], [first.lng, first.lat]),
        );
        // Padding assimétrico (em vez de um valor fixo): soma a altura real
        // do cabeçalho/cartão de destino (ver `chromeInsets`, medidos em
        // PlanningView) para que a rota inteira caiba no vão livre entre
        // eles, em vez de nascer/terminar atrás desses painéis.
        const padding = {
          top: chromeInsets.top + FIT_BOUNDS_BREATHING_ROOM_PX,
          bottom: chromeInsets.bottom + FIT_BOUNDS_BREATHING_ROOM_PX,
          left: FIT_BOUNDS_BREATHING_ROOM_PX,
          right: FIT_BOUNDS_BREATHING_ROOM_PX,
        };
        // Guardado para o botão "Centralizar" (recenter, abaixo) poder
        // reenquadrar a rota inteira de novo depois que o usuário arrasta o
        // mapa durante o planejamento, em vez de só saber centralizar num
        // ponto — à la Waze/Google Maps.
        lastRouteFitRef.current = { bounds, padding };
        map.fitBounds(bounds, { padding });
      }
    };

    if (styleReadyRef.current) {
      applyRoute();
    } else {
      map.once('style.load', applyRoute);
    }
    // `chromeInsets` entra nas deps de propósito (ao contrário de `origin`,
    // que só é lido via ref neste arquivo): o cartão de destino só monta (e
    // só então reporta sua altura real) depois que a rota já está em tela,
    // então esse efeito precisa rodar de novo assim que a medição chegar
    // para reenquadrar a rota com o padding correto — sem isso, o primeiro
    // fitBounds usaria a altura antiga (0) e a rota nasceria atrás do
    // cartão mesmo assim.
  }, [route, theme, isNavigating, chromeInsets]);

  // Mantém o trecho de conexão puck→rota grudado na posição real do usuário
  // conforme o GPS atualiza, sem repetir fitBounds/criação de camadas (que já
  // rodaram no efeito acima) — só atualiza a source, se ela já existir.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !route) {
      return;
    }
    const source = map.getSource(ROUTE_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    if (source) {
      source.setData(buildRouteGeojson(route, origin));
    }
  }, [route, origin]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !origin) {
      return;
    }

    if (isNavigating) {
      if (!isFollowingUser) {
        return;
      }
      map.easeTo({
        center: [origin.lng, origin.lat],
        zoom: 17,
        pitch: 60,
        bearing: headingDegrees ?? map.getBearing(),
        duration: 500,
      });
    } else {
      map.easeTo({ pitch: 0, bearing: 0, duration: 500 });
    }
  }, [origin, isNavigating, headingDegrees, isFollowingUser]);

  // Fora da navegação (planejamento), recentralizar volta a mostrar a rota
  // inteira (o mesmo enquadramento do fitBounds), não um zoom de perto no
  // usuário — à la Waze/Google Maps, onde o botão de centralizar durante a
  // prévia da rota reenquadra o trajeto, e só passa a seguir de perto o
  // usuário depois que a navegação começa de fato.
  const recenter = useCallback(() => {
    setIsFollowingUser(true);
    const map = mapRef.current;
    if (!map) {
      return;
    }

    if (isNavigating) {
      if (!origin) {
        return;
      }
      map.easeTo({
        center: [origin.lng, origin.lat],
        zoom: 17,
        pitch: 60,
        bearing: headingDegrees ?? map.getBearing(),
        duration: 500,
      });
      return;
    }

    if (lastRouteFitRef.current) {
      map.fitBounds(lastRouteFitRef.current.bounds, {
        padding: lastRouteFitRef.current.padding,
      });
      return;
    }

    if (origin) {
      map.easeTo({ center: [origin.lng, origin.lat], pitch: 0, bearing: 0, duration: 500 });
    }
  }, [origin, headingDegrees, isNavigating]);

  return { mapRef, mapInstance, isFollowingUser, recenter };
}
