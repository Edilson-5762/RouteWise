import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import mapboxgl from 'mapbox-gl';
import type { Coordinates, MapChromeInsets, Route, TravelProfile } from '../../types';
import { getPuckIconMarkup } from '../../utils/vehicleAvatar';
import { formatSpeedKmh } from '../../utils/format';
import {
  haversineDistanceMeters,
  signedBearingDelta,
  travelBearingAlong,
  polylineLengthMeters,
  findNearestPointIndex,
  type RouteProjection,
} from '../../utils/distance';
import {
  buildRouteGeojson,
  buildNavigationRouteGeojson,
  buildManeuverArrowGeojson,
  projectVehicleOntoRoute,
  bearingBetween,
} from './navigationGeometry';
import { computeDriveStep, type DriveAnchor } from './driveCamera';
import {
  NAV_PUCK_VERTICAL_OFFSET_RATIO,
  NAV_DR_MIN_SPEED_MPS,
  NAV_DR_MAX_DERIVED_SPEED_MPS,
  NAV_BEARING_TRAIL_METERS,
  NAV_BEARING_LOOKAHEAD_METERS,
  NAV_OFF_ROUTE_HEADING_DIVERGENCE_DEGREES,
  NAV_CAMERA_ENTRY_EASE_MS,
  NAV_CAMERA_APPLY_MIN_MS,
  NAV_LINE_UPDATE_MIN_MS,
  NAV_CAMERA_MIN_MOVE_METERS,
  NAV_CAMERA_MIN_TURN_DEGREES,
} from './navConstants';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

const ROUTE_SOURCE_ID = 'route-source';
const ROUTE_CASING_LAYER_ID = 'route-casing-layer';
const ROUTE_LAYER_ID = 'route-layer';
const MANEUVER_ARROW_SOURCE_ID = 'maneuver-arrow-source';
// Linha branca no formato da curva (role: 'shape'), com contorno escuro por
// baixo, + cabeça da seta na ponta (role: 'head') — tudo em cima da linha azul.
const MANEUVER_ARROW_OUTLINE_LAYER_ID = 'maneuver-arrow-outline-layer';
const MANEUVER_ARROW_SHAPE_LAYER_ID = 'maneuver-arrow-shape-layer';
const MANEUVER_ARROW_HEAD_LAYER_ID = 'maneuver-arrow-head-layer';
const DAY_STYLE = 'mapbox://styles/mapbox/navigation-day-v1';
const NIGHT_STYLE = 'mapbox://styles/mapbox/navigation-night-v1';

// Zoom/pitch da câmera de condução — visão "no capô", bem de perto.
const NAV_ZOOM = 19;
const NAV_PITCH = 60;
// Deslocamento mínimo entre dois fixes para deles derivar uma direção de
// deslocamento confiável (abaixo disso é ruído de GPS parado).
const TRAVEL_BEARING_MIN_METERS = 4;
// Suavização exponencial da rotação no easeTo pontual de ENTRADA na navegação /
// "Centralizar" (o seguimento contínuo é o laço rAF em driveCamera).
const CAMERA_BEARING_SMOOTHING = 0.4;
// Quantos segmentos por tick o progresso pode RECUAR para se recuperar de um
// fix ruim de GPS (ver `lastRouteSegmentRef`).
const PROGRESS_MAX_RECEDE_SEGMENTS = 12;
// Depois de um gesto do usuário durante a navegação, quanto tempo até a câmera
// voltar a seguir sozinha (igual Waze).
const RESUME_FOLLOW_DELAY_MS = 4000;

interface UseMapboxMapOptions {
  containerRef: RefObject<HTMLDivElement>;
  origin: Coordinates | null;
  destination: Coordinates | null;
  route: Route | null;
  isNavigating: boolean;
  currentStepIndex?: number;
  routeProgressIndex?: number;
  distanceToManeuverMeters?: number | null;
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
  currentStepIndex = 0,
  routeProgressIndex = 0,
  distanceToManeuverMeters = null,
  headingDegrees,
  theme,
  travelProfile,
  speedMetersPerSecond,
  chromeInsets = DEFAULT_CHROME_INSETS,
}: UseMapboxMapOptions) {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const originMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const puckElementRef = useRef<HTMLDivElement | null>(null);
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
  // Lido via ref pela câmera de condução (driveCameraTo) para calcular a
  // tangente da rota sem recriar o callback a cada (re)desenho da linha.
  const routeRef = useRef(route);
  routeRef.current = route;
  // Lido via ref na criação das camadas da rota (a seta de manobra); as
  // atualizações a cada tick são responsabilidade do efeito dedicado abaixo.
  const currentStepIndexRef = useRef(currentStepIndex);
  currentStepIndexRef.current = currentStepIndex;
  const distanceToManeuverMetersRef = useRef(distanceToManeuverMeters);
  distanceToManeuverMetersRef.current = distanceToManeuverMeters;
  // Progresso ao longo da rota vindo do estado (sobrevive a um remount do mapa,
  // ao contrário do ref local abaixo) — âncora da janela de projeção.
  const routeProgressIndexRef = useRef(routeProgressIndex);
  routeProgressIndexRef.current = routeProgressIndex;
  // Velocidade do GPS (m/s), lida via ref pela antecipação da câmera/linha
  // (leadProjection) sem recriar callbacks a cada leitura.
  const speedMetersPerSecondRef = useRef(speedMetersPerSecond);
  speedMetersPerSecondRef.current = speedMetersPerSecond;
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
  // Posição usada no último ajuste de câmera de condução e a última direção de
  // deslocamento derivada dela — para girar a câmera na direção do movimento
  // quando o GPS não reporta `heading`.
  const lastCameraPositionRef = useRef<Coordinates | null>(null);
  const lastTravelBearingRef = useRef<number | null>(null);
  // Direção da câmera após a suavização (ver CAMERA_BEARING_SMOOTHING) — é ela
  // que a câmera realmente usa, aproximando-se da direção-alvo aos poucos.
  const smoothedBearingRef = useRef<number | null>(null);
  // Segmento da rota em que o veículo estava projetado no último tick — âncora
  // da janela de projeção. NÃO é estritamente monotônico: pode recuar até
  // PROGRESS_MAX_RECEDE_SEGMENTS por tick, para a projeção se recuperar de um
  // fix ruim de GPS que tenha empurrado o progresso à frente (senão a linha
  // ficava permanentemente adiantada em relação ao veículo).
  const lastRouteSegmentRef = useRef(0);
  // Última projeção do veículo sobre a rota (ponto "grudado na pista" + segmento
  // + tangente). Calculada uma vez por tick pelo efeito de redesenho da linha e
  // reaproveitada pela câmera de condução (que roda logo depois, no mesmo
  // commit) — assim linha e câmera concordam no mesmo ponto.
  const lastProjectionRef = useRef<RouteProjection | null>(null);

  // --- Seguimento quadro a quadro (rAF) — ver driveCamera.ts ---
  // Âncora: última projeção REAL do veículo (m ao longo da rota) + instante +
  // velocidade estimada. O laço rAF avança sozinho a partir daqui entre fixes.
  const drAnchorRef = useRef<DriveAnchor | null>(null);
  // Ponto de fato renderizado no último quadro (m ao longo da rota) e velocidade
  // suavizada (EMA) — mantidos entre quadros pelo laço.
  const renderedAlongRef = useRef<number | null>(null);
  const emaSpeedRef = useRef(0);
  const rafIdRef = useRef<number | null>(null);
  const routeLengthMetersRef = useRef(0);
  // Distância (m ao longo da geometria) até o vértice da próxima manobra —
  // cacheada por rota + passo atual; o laço rAF a usa para encolher a trilha da
  // corda de rumo assim que o carro cruza a quina (ver computeDriveStep).
  const maneuverAlongMetersRef = useRef<number | null>(null);
  // Estrangulamento do laço: quando a câmera/linha foram aplicadas pela última
  // vez, e o último ponto/rumo de fato passados ao `jumpTo` (para pular quadros
  // sem mudança perceptível — parado no semáforo o laço então não emite eventos).
  const lastCameraApplyMsRef = useRef(0);
  const lastLineApplyMsRef = useRef(0);
  const lastAppliedCenterRef = useRef<Coordinates | null>(null);
  const lastAppliedBearingRef = useRef<number | null>(null);
  const lastLineAlongRef = useRef<number | null>(null);
  const lastPaddingTopRef = useRef<number | null>(null);
  // Gesto do usuário em andamento (pan/zoom) — o laço rAF respeita na hora.
  const userPannedRef = useRef(false);
  // Espelhos em ref de props/estado lidos dentro do laço rAF sem recriá-lo.
  const headingDegreesRef = useRef(headingDegrees);
  headingDegreesRef.current = headingDegrees;
  const isFollowingUserRef = useRef(isFollowingUser);
  isFollowingUserRef.current = isFollowingUser;
  const wasNavigatingRef = useRef(false);

  // Projeção do veículo sobre a rota, com janela restrita ao progresso real.
  // Atualiza os refs de progresso e de última projeção (monotônico).
  const projectVehicle = useCallback((position: Coordinates | null): RouteProjection | null => {
    const currentRoute = routeRef.current;
    if (!position || !currentRoute || currentRoute.geometry.length < 2) {
      lastProjectionRef.current = null;
      return null;
    }
    const anchor = Math.max(routeProgressIndexRef.current, lastRouteSegmentRef.current);
    // Banda por distância-ao-longo: impede que um fix ruidoso numa rotatória /
    // retorno "grude" o veículo no outro lado da dobra (linha some, veículo
    // teleporta). Centro = último avanço conhecido; teto à frente acompanha a
    // velocidade medida com folga; sem referência ainda (início), fica livre.
    const bandCenter = drAnchorRef.current?.alongMeters ?? lastProjectionRef.current?.alongMeters;
    const bandSpeed = Math.max(drAnchorRef.current?.speedMps ?? 0, emaSpeedRef.current, 0);
    const projection = projectVehicleOntoRoute(currentRoute, position, anchor, {
      around: bandCenter,
      maxAheadMeters: Math.min(140, Math.max(25, bandSpeed * 3 + 20)),
      maxBehindMeters: 20,
    });
    // Segue o segmento projetado, mas só deixa RECUAR até
    // PROGRESS_MAX_RECEDE_SEGMENTS por tick — assim se recupera de um fix ruim
    // sem "voltar" de uma vez para um trecho anterior fisicamente próximo.
    lastRouteSegmentRef.current = Math.max(
      projection.segmentIndex,
      lastRouteSegmentRef.current - PROGRESS_MAX_RECEDE_SEGMENTS,
    );
    lastProjectionRef.current = projection;
    return projection;
  }, []);

  // A cada fix de GPS (durante a navegação), reposiciona a âncora do seguimento:
  // metros REAIS ao longo da rota + agora + velocidade. A velocidade vem do GPS
  // quando confiável; senão é derivada do avanço em `alongMeters` entre fixes.
  // É a partir daqui que o laço rAF avança sozinho, quadro a quadro.
  const updateDriveAnchor = useCallback((projection: RouteProjection | null) => {
    if (!projection) {
      return;
    }
    const now =
      typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    const prev = drAnchorRef.current;
    const gpsSpeed = speedMetersPerSecondRef.current;
    let speed = gpsSpeed ?? 0;
    // Só deriva a velocidade de dois fixes quando o GPS NÃO reporta `coords.speed`
    // (celular parado costuma reportar; alguns navegadores no polling não). Exige
    // um intervalo mínimo (fixes muito juntos = derivada explode) e limita o
    // resultado — um salto grande de `alongMeters` é recálculo de rota, não
    // movimento real.
    if (prev && (gpsSpeed == null || gpsSpeed < NAV_DR_MIN_SPEED_MPS)) {
      const dtSeconds = (now - prev.atMs) / 1000;
      if (dtSeconds > 0.3 && dtSeconds < 6) {
        const derived = (projection.alongMeters - prev.alongMeters) / dtSeconds;
        if (derived > NAV_DR_MIN_SPEED_MPS) {
          speed = Math.min(derived, NAV_DR_MAX_DERIVED_SPEED_MPS);
        }
      }
    }
    emaSpeedRef.current = prev ? emaSpeedRef.current * 0.6 + speed * 0.4 : speed;
    drAnchorRef.current = {
      alongMeters: projection.alongMeters,
      atMs: now,
      speedMps: Math.max(0, emaSpeedRef.current),
    };
  }, []);

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
      zoom: isNavigating ? NAV_ZOOM : 12,
      pitch: isNavigating ? NAV_PITCH : 0,
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
      puckElementRef.current = null;
      puckIconContainerRef.current = null;
      speedBadgeRef.current = null;
      destinationMarkerRef.current = null;
      setMapInstance(null);
    };
  }, [containerRef]);

  // Um gesto do usuário (arrastar/girar/zoom) sempre carrega `originalEvent`;
  // movimentos programáticos (o `jumpTo` do laço rAF, easeTo etc.) não. Isso
  // distingue "usuário mexeu" de "o app recentralizou" e liga/desliga o botão
  // de recentralizar.
  //
  // Escutamos os eventos ESPECÍFICOS de gesto (`dragstart`, `rotatestart`, …) e
  // não só `movestart`: durante a navegação o laço rAF mantém a câmera SEMPRE em
  // movimento, então `movestart` (que só dispara na transição parado→movendo)
  // nunca mais vinha do gesto do usuário — o mapa nunca fica parado. Os
  // `*start` de gesto disparam a cada gesto, independentemente disso.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const handleUserGesture = (event: { originalEvent?: unknown }) => {
      if (event.originalEvent) {
        // Ref síncrono (além do estado, que só reflete no próximo render): o laço
        // rAF consulta isto no MESMO frame e para de aplicar `jumpTo` na hora,
        // sem "brigar" com o gesto do usuário por um ou dois quadros.
        userPannedRef.current = true;
        setIsFollowingUser(false);
      }
    };

    // Cast: alguns desses eventos não declaram `originalEvent` no .d.ts desta
    // versão do mapbox-gl, mas todos o carregam quando o movimento vem de um
    // gesto do usuário — é justamente o que checamos.
    type GestureListener = (event: { originalEvent?: unknown }) => void;
    const on = map.on.bind(map) as (type: string, listener: GestureListener) => void;
    const off = map.off.bind(map) as (type: string, listener: GestureListener) => void;
    const gestureEvents = ['movestart', 'dragstart', 'rotatestart', 'pitchstart', 'zoomstart'];
    gestureEvents.forEach((name) => on(name, handleUserGesture));
    return () => {
      gestureEvents.forEach((name) => off(name, handleUserGesture));
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
      puckElementRef.current = element;
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

  // Durante a navegação o veículo é um ícone FIXO na tela, desenhado por
  // MapView por cima do mapa (ver `NAV_PUCK_VERTICAL_OFFSET_RATIO`) — isso é o
  // que faz o carro ficar parado na tela enquanto o mapa rola por baixo, sem os
  // "coices" que dava quando o marcador (posição instantânea) corria à frente
  // da câmera (animada). Aqui só escondemos o marcador do mapa nesse modo; no
  // planejamento ele volta, mostrando a posição real sobre a prévia da rota.
  useEffect(() => {
    if (puckElementRef.current) {
      puckElementRef.current.style.visibility = isNavigating ? 'hidden' : 'visible';
    }
  }, [isNavigating, origin]);

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
        for (const id of [
          MANEUVER_ARROW_HEAD_LAYER_ID,
          MANEUVER_ARROW_SHAPE_LAYER_ID,
          MANEUVER_ARROW_OUTLINE_LAYER_ID,
        ]) {
          if (map.getLayer(id)) {
            map.removeLayer(id);
          }
        }
        if (map.getSource(MANEUVER_ARROW_SOURCE_ID)) {
          map.removeSource(MANEUVER_ARROW_SOURCE_ID);
        }
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

    const geojson = isNavigating
      ? buildNavigationRouteGeojson(
          route,
          lastProjectionRef.current ?? projectVehicle(originRef.current),
        )
      : buildRouteGeojson(route, originRef.current);
    const maneuverArrowGeojson = buildManeuverArrowGeojson(
      route,
      isNavigating,
      currentStepIndexRef.current,
      distanceToManeuverMetersRef.current,
      originRef.current,
    );

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
          // `line-join: round` + linha mais grossa no zoom de navegação = canto
          // arredondado (não "esquadro") nas curvas.
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': '#ffffff',
            'line-width': ['interpolate', ['linear'], ['zoom'], 10, 8, 18, 22, 22, 30],
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
            'line-width': ['interpolate', ['linear'], ['zoom'], 10, 4, 18, 15, 22, 21],
          },
        });
      }

      const arrowSource = map.getSource(MANEUVER_ARROW_SOURCE_ID) as
        mapboxgl.GeoJSONSource | undefined;
      if (arrowSource) {
        arrowSource.setData(maneuverArrowGeojson);
      } else {
        map.addSource(MANEUVER_ARROW_SOURCE_ID, {
          type: 'geojson',
          data: maneuverArrowGeojson,
        });
        // Contorno azul-escuro por baixo da seta branca: destaca a seta contra
        // o contorno branco da própria rota (senão branco-no-branco some).
        map.addLayer({
          id: MANEUVER_ARROW_OUTLINE_LAYER_ID,
          type: 'line',
          source: MANEUVER_ARROW_SOURCE_ID,
          filter: ['==', ['get', 'role'], 'shape'],
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': '#172554',
            // Fina: um filete de contraste, não uma faixa por cima da rota.
            'line-width': ['interpolate', ['linear'], ['zoom'], 12, 4, 18, 8, 22, 11],
            'line-opacity': 0.9,
          },
        });
        // Seta BRANCA no formato exato da curva/rotatória/desvio, POR CIMA da
        // linha azul da rota — traça a geometria real da manobra (ver
        // buildManeuverArrowGeojson) e aparece já a ~150 m dela. Estreita de
        // propósito: só realça o traçado da manobra, sem cobrir a linha da rota.
        map.addLayer({
          id: MANEUVER_ARROW_SHAPE_LAYER_ID,
          type: 'line',
          source: MANEUVER_ARROW_SOURCE_ID,
          filter: ['==', ['get', 'role'], 'shape'],
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': '#ffffff',
            'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2.5, 18, 5, 22, 7],
          },
        });
        // Cabeça da seta na ponta (direção de saída da curva).
        map.addLayer({
          id: MANEUVER_ARROW_HEAD_LAYER_ID,
          type: 'symbol',
          source: MANEUVER_ARROW_SOURCE_ID,
          filter: ['==', ['get', 'role'], 'head'],
          layout: {
            'text-field': '▲',
            'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Regular'],
            // Cabeça pequena — só marca o sentido da saída, sem dominar a curva.
            'text-size': ['interpolate', ['linear'], ['zoom'], 12, 12, 18, 22, 22, 30],
            'text-rotate': ['get', 'bearing'],
            'text-rotation-alignment': 'map',
            'text-pitch-alignment': 'map',
            'text-allow-overlap': true,
            'text-ignore-placement': true,
          },
          paint: {
            'text-color': '#ffffff',
            'text-halo-color': '#172554',
            'text-halo-width': 1.75,
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
  }, [route, theme, isNavigating, chromeInsets, projectVehicle]);

  // Redesenha a linha da rota e a seta de manobra conforme o GPS atualiza, sem
  // repetir fitBounds/criação de camadas (que já rodaram no efeito acima) — só
  // o setData. Na navegação isso "consome" o trecho já percorrido a cada avanço
  // e faz a seta aparecer/sumir conforme a curva se aproxima.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !route) {
      return;
    }
    // Projeção REAL do veículo (sem antecipar). É a base da âncora do laço rAF
    // (que faz o seguimento contínuo) e a pintura de fallback da linha — o laço
    // rAF sobrescreve a linha no quadro seguinte.
    const projection = isNavigating ? projectVehicle(origin) : null;
    if (isNavigating) {
      lastProjectionRef.current = projection;
      updateDriveAnchor(projection);
    }
    const source = map.getSource(ROUTE_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    if (source) {
      source.setData(
        isNavigating
          ? buildNavigationRouteGeojson(route, projection)
          : buildRouteGeojson(route, origin),
      );
    }
    const arrowSource = map.getSource(MANEUVER_ARROW_SOURCE_ID) as
      mapboxgl.GeoJSONSource | undefined;
    if (arrowSource) {
      arrowSource.setData(
        buildManeuverArrowGeojson(
          route,
          isNavigating,
          currentStepIndex,
          distanceToManeuverMeters,
          origin,
        ),
      );
    }
  }, [
    route,
    origin,
    isNavigating,
    currentStepIndex,
    distanceToManeuverMeters,
    projectVehicle,
    updateDriveAnchor,
  ]);

  // Comprimento total da geometria da rota — cacheado por rota (o laço rAF
  // precisa dele a cada quadro para fixar o avanço no fim da rota).
  useEffect(() => {
    routeLengthMetersRef.current = route ? polylineLengthMeters(route.geometry) : 0;
  }, [route]);

  // Vértice da próxima manobra, em metros ao longo da geometria — recalculado só
  // quando a rota ou o passo mudam (não a cada quadro). A manobra do passo `i`
  // acontece no início dele, então a próxima é a do passo currentStepIndex + 1.
  useEffect(() => {
    const next = route?.steps[currentStepIndex + 1];
    if (!route || !next || route.geometry.length < 2) {
      maneuverAlongMetersRef.current = null;
      return;
    }
    const idx = findNearestPointIndex(next.maneuverLocation, route.geometry);
    maneuverAlongMetersRef.current = polylineLengthMeters(route.geometry.slice(0, idx + 1));
  }, [route, currentStepIndex]);

  // easeTo PONTUAL: só a entrada na navegação e o botão "Centralizar". O
  // seguimento contínuo é o laço rAF abaixo. `padding.top` (não `offset`, que
  // rodava com o bearing e jogava o carro para fora da linha nas curvas) fixa o
  // centro do mapa a (0.5 + ratio) da altura da tela, onde MapView desenha o
  // ícone do veículo.
  const driveCameraTo = useCallback(
    (map: mapboxgl.Map, position: Coordinates) => {
      const previous = lastCameraPositionRef.current;
      if (previous && haversineDistanceMeters(previous, position) >= TRAVEL_BEARING_MIN_METERS) {
        lastTravelBearingRef.current = bearingBetween(previous, position);
      }
      lastCameraPositionRef.current = position;

      const projection = projectVehicle(position);
      const routeGeometry = routeRef.current?.geometry;
      const center = isNavigating && projection ? projection.point : position;

      let targetBearing: number;
      if (isNavigating && projection && routeGeometry && routeGeometry.length >= 2) {
        const routeBearing =
          travelBearingAlong(
            routeGeometry,
            projection.alongMeters,
            NAV_BEARING_TRAIL_METERS,
            NAV_BEARING_LOOKAHEAD_METERS,
          ) ??
          bearingBetween(
            routeGeometry[projection.segmentIndex],
            routeGeometry[Math.min(projection.segmentIndex + 1, routeGeometry.length - 1)],
          );
        targetBearing =
          headingDegrees != null &&
          Math.abs(signedBearingDelta(routeBearing, headingDegrees)) >
            NAV_OFF_ROUTE_HEADING_DIVERGENCE_DEGREES
            ? headingDegrees
            : routeBearing;
      } else {
        targetBearing = headingDegrees ?? lastTravelBearingRef.current ?? map.getBearing();
      }

      const previousBearing = smoothedBearingRef.current ?? targetBearing;
      const smoothedBearing =
        (previousBearing +
          signedBearingDelta(previousBearing, targetBearing) * CAMERA_BEARING_SMOOTHING +
          360) %
        360;
      smoothedBearingRef.current = smoothedBearing;

      // Semeia o estado do laço rAF para ele continuar de onde este snap parou.
      if (isNavigating && projection) {
        renderedAlongRef.current = projection.alongMeters;
        if (!drAnchorRef.current) {
          updateDriveAnchor(projection);
        }
      }

      const paddingTop =
        (containerRef.current?.clientHeight ?? 0) * 2 * NAV_PUCK_VERTICAL_OFFSET_RATIO;

      map.easeTo({
        center: [center.lng, center.lat],
        zoom: NAV_ZOOM,
        pitch: NAV_PITCH,
        bearing: smoothedBearing,
        padding: isNavigating
          ? { top: paddingTop, bottom: 0, left: 0, right: 0 }
          : { top: 0, bottom: 0, left: 0, right: 0 },
        duration: NAV_CAMERA_ENTRY_EASE_MS,
      });
    },
    [headingDegrees, containerRef, isNavigating, projectVehicle, updateDriveAnchor],
  );

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !origin) {
      return;
    }

    if (isNavigating) {
      // Snap único ao ENTRAR na navegação; daí em diante o laço rAF assume.
      if (!wasNavigatingRef.current) {
        wasNavigatingRef.current = true;
        if (isFollowingUser) {
          driveCameraTo(map, origin);
        }
      }
    } else {
      wasNavigatingRef.current = false;
      lastCameraPositionRef.current = null;
      lastTravelBearingRef.current = null;
      smoothedBearingRef.current = null;
      lastRouteSegmentRef.current = 0;
      lastProjectionRef.current = null;
      drAnchorRef.current = null;
      renderedAlongRef.current = null;
      emaSpeedRef.current = 0;
      lastAppliedCenterRef.current = null;
      lastAppliedBearingRef.current = null;
      lastLineAlongRef.current = null;
      lastPaddingTopRef.current = null;
      userPannedRef.current = false;
      map.easeTo({
        pitch: 0,
        bearing: 0,
        padding: { top: 0, bottom: 0, left: 0, right: 0 },
        duration: 500,
      });
    }
  }, [origin, isNavigating, headingDegrees, isFollowingUser, driveCameraTo]);

  // Seguimento quadro a quadro: enquanto navega (e seguindo o usuário), a cada
  // frame avança o ponto renderizado ao longo da rota pela velocidade medida
  // (dead-reckoning entre fixes), gira a câmera aos poucos até o rumo à frente e
  // aplica tudo com `jumpTo` — sem depender de um `easeTo` terminar. É o que faz
  // o carro do desenho acompanhar o carro real em tempo real e fazer a curva
  // grudado na linha. Ver `computeDriveStep`.
  useEffect(() => {
    if (!isNavigating || !route) {
      return;
    }
    let stopped = false;

    const frame = () => {
      if (stopped) {
        return;
      }
      const now =
        typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
      const map = mapRef.current;
      const geometry = routeRef.current?.geometry;
      const anchor = drAnchorRef.current;
      if (
        map &&
        typeof map.jumpTo === 'function' &&
        anchor &&
        geometry &&
        geometry.length >= 2 &&
        isFollowingUserRef.current &&
        !userPannedRef.current &&
        containerRef.current &&
        // Estrangula a ~30 fps: só recalcula/aplica a cada NAV_CAMERA_APPLY_MIN_MS
        // (a 60 fps a cascata de eventos do jumpTo travava os botões da UI).
        now - lastCameraApplyMsRef.current >= NAV_CAMERA_APPLY_MIN_MS
      ) {
        const step = computeDriveStep({
          geometry,
          routeLengthMeters: routeLengthMetersRef.current,
          anchor,
          nowMs: now,
          renderedAlongMeters: renderedAlongRef.current,
          smoothedBearingDegrees: smoothedBearingRef.current,
          headingDegrees: headingDegreesRef.current,
          clientHeightPx: containerRef.current.clientHeight,
          maneuverAlongMeters: maneuverAlongMetersRef.current,
        });
        if (step) {
          renderedAlongRef.current = step.renderedAlongMeters;
          smoothedBearingRef.current = step.bearingDegrees;
          lastProjectionRef.current = step.lineProjection;

          // Pula o jumpTo se nada mudou de forma perceptível desde o último
          // aplicado — com o veículo parado, a câmera assenta e o laço deixa de
          // emitir eventos, devolvendo a thread para a UI (botões voltam a
          // responder no semáforo).
          const prevCenter = lastAppliedCenterRef.current;
          const prevBearing = lastAppliedBearingRef.current;
          const centerMoved =
            !prevCenter ||
            haversineDistanceMeters(prevCenter, step.center) >= NAV_CAMERA_MIN_MOVE_METERS;
          const turned =
            prevBearing == null ||
            Math.abs(signedBearingDelta(prevBearing, step.bearingDegrees)) >=
              NAV_CAMERA_MIN_TURN_DEGREES;

          if (centerMoved || turned) {
            lastCameraApplyMsRef.current = now;
            lastAppliedCenterRef.current = step.center;
            lastAppliedBearingRef.current = step.bearingDegrees;
            // `padding` só entra no jumpTo quando muda (praticamente só no 1º
            // quadro — a altura da tela é constante). Passá-lo todo quadro força
            // o Mapbox a recompor a transform inteira e pesa à toa.
            const paddingChanged = lastPaddingTopRef.current !== step.paddingTopPx;
            if (paddingChanged) {
              lastPaddingTopRef.current = step.paddingTopPx;
            }
            map.jumpTo({
              center: [step.center.lng, step.center.lat],
              zoom: NAV_ZOOM,
              pitch: NAV_PITCH,
              bearing: step.bearingDegrees,
              ...(paddingChanged
                ? { padding: { top: step.paddingTopPx, bottom: 0, left: 0, right: 0 } }
                : {}),
            });

            // A linha da rota é mais cara que o jumpTo (re-serializa GeoJSON) —
            // redesenha numa cadência menor e só se o ponto avançou de fato.
            const lineAlong = lastLineAlongRef.current;
            if (
              now - lastLineApplyMsRef.current >= NAV_LINE_UPDATE_MIN_MS &&
              (lineAlong == null || Math.abs(lineAlong - step.renderedAlongMeters) >= 1)
            ) {
              const routeSource = map.getSource(ROUTE_SOURCE_ID) as
                mapboxgl.GeoJSONSource | undefined;
              if (routeSource && routeRef.current) {
                lastLineApplyMsRef.current = now;
                lastLineAlongRef.current = step.renderedAlongMeters;
                routeSource.setData(
                  buildNavigationRouteGeojson(routeRef.current, step.lineProjection),
                );
              }
            }
          }
        }
      }
      rafIdRef.current = requestAnimationFrame(frame);
    };

    rafIdRef.current = requestAnimationFrame(frame);
    return () => {
      stopped = true;
      if (rafIdRef.current != null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [isNavigating, route, containerRef]);

  // Uma rota nova (plano/recálculo) recomeça o progresso do zero.
  useEffect(() => {
    lastRouteSegmentRef.current = 0;
    lastProjectionRef.current = null;
    drAnchorRef.current = null;
    renderedAlongRef.current = null;
    emaSpeedRef.current = 0;
    lastAppliedCenterRef.current = null;
    lastAppliedBearingRef.current = null;
    lastLineAlongRef.current = null;
    lastPaddingTopRef.current = null;
  }, [route]);

  // Durante a navegação, se um gesto do usuário desligar o "seguir" (ex.: um
  // toque sem querer com o celular na mão), a câmera volta a seguir sozinha
  // depois de alguns segundos — igual Waze/Maps.
  useEffect(() => {
    if (!isNavigating || isFollowingUser) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      userPannedRef.current = false;
      setIsFollowingUser(true);
    }, RESUME_FOLLOW_DELAY_MS);
    return () => window.clearTimeout(timeoutId);
  }, [isNavigating, isFollowingUser]);

  // Fora da navegação (planejamento), recentralizar volta a mostrar a rota
  // inteira (o mesmo enquadramento do fitBounds), não um zoom de perto no
  // usuário — à la Waze/Google Maps, onde o botão de centralizar durante a
  // prévia da rota reenquadra o trajeto, e só passa a seguir de perto o
  // usuário depois que a navegação começa de fato.
  const recenter = useCallback(() => {
    userPannedRef.current = false;
    setIsFollowingUser(true);
    const map = mapRef.current;
    if (!map) {
      return;
    }

    if (isNavigating) {
      if (!origin) {
        return;
      }
      driveCameraTo(map, origin);
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
  }, [origin, isNavigating, driveCameraTo]);

  return { mapRef, mapInstance, isFollowingUser, recenter };
}
