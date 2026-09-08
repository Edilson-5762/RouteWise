import type { Coordinates } from '../../types';
import {
  travelBearingAlong,
  locateAlongRoute,
  signedBearingDelta,
  type RouteProjection,
} from '../../utils/distance';
import {
  NAV_BEARING_TRAIL_METERS,
  NAV_BEARING_TRAIL_MIN_METERS,
  NAV_BEARING_LOOKAHEAD_METERS,
  NAV_BEARING_SMOOTHING_PER_FRAME,
  NAV_DR_DECAY_SECONDS,
  NAV_DR_EXTRAPOLATE_SECONDS,
  NAV_DR_MAX_CREEP_METERS,
  NAV_DR_MIN_SPEED_MPS,
  NAV_OFF_ROUTE_HEADING_DIVERGENCE_DEGREES,
  NAV_POSITION_SMOOTHING,
  NAV_PUCK_VERTICAL_OFFSET_RATIO,
} from './navConstants';

// Âncora do seguimento: a última projeção REAL do veículo sobre a rota (em
// metros ao longo dela), o instante em que foi medida e a velocidade estimada.
// Entre um fix de GPS e o próximo, `computeDriveStep` avança sozinho a partir
// daqui.
export interface DriveAnchor {
  alongMeters: number;
  atMs: number;
  speedMps: number;
}

export interface DriveStepInput {
  geometry: Coordinates[];
  routeLengthMeters: number;
  anchor: DriveAnchor;
  nowMs: number;
  /** Ponto renderizado no quadro anterior (m ao longo da rota). `null` = 1º quadro (encaixa direto). */
  renderedAlongMeters: number | null;
  /** Rumo suavizado no quadro anterior. `null` = encaixa direto no rumo-alvo. */
  smoothedBearingDegrees: number | null;
  headingDegrees: number | null;
  clientHeightPx: number;
  /**
   * Distância (m ao longo da geometria) até o vértice da próxima manobra.
   * Quando o ponto renderizado passa desse vértice, a trilha da corda de rumo
   * encolhe para NAV_BEARING_TRAIL_MIN_METERS — a câmera termina de girar para a
   * perna nova logo na quina, em vez de ~16 m depois. `null`/ausente = trilha
   * cheia sempre (comportamento anterior).
   */
  maneuverAlongMeters?: number | null;
}

export interface DriveStepOutput {
  center: Coordinates;
  /** Rumo da CÂMERA (suavizado) — o quanto o mapa girou neste quadro. */
  bearingDegrees: number;
  /**
   * Rumo de DESLOCAMENTO do veículo (rota à frente, sem a suavização da
   * câmera). Numa curva fechada a câmera fica para trás dele por um instante;
   * `bearingDegrees - vehicleBearingDegrees` é o quanto o ícone do carro deve
   * pivotar na tela (Waze: o carro vira a frente na quina, o mapa alcança
   * depois).
   */
  vehicleBearingDegrees: number;
  paddingTopPx: number;
  renderedAlongMeters: number;
  lineProjection: RouteProjection;
}

// Um passo do seguimento quadro a quadro. Puro (sem Mapbox, sem tempo real) —
// `useMapboxMap` só chama isto num laço de requestAnimationFrame e repassa o
// resultado para `map.jumpTo` + `setData` da linha.
export function computeDriveStep(input: DriveStepInput): DriveStepOutput | null {
  const {
    geometry,
    routeLengthMeters,
    anchor,
    nowMs,
    renderedAlongMeters: prevRendered,
    smoothedBearingDegrees,
    headingDegrees,
    clientHeightPx,
    maneuverAlongMeters,
  } = input;

  if (geometry.length < 2) {
    return null;
  }

  // Avanço por conta própria desde o último fix:
  //  - até NAV_DR_EXTRAPOLATE_SECONDS: extrapola à frente na velocidade medida
  //    (prevê onde o veículo estará no próximo fix — cancela o atraso do GPS);
  //  - depois disso o GPS ficou quieto (parado / fix suprimido): o avanço
  //    RECOLHE de volta ao ponto real da âncora ao longo de NAV_DR_DECAY_SECONDS.
  // Blindado por um teto absoluto em metros.
  const ageSec = Math.max(0, (nowMs - anchor.atMs) / 1000);
  let creepMeters = 0;
  if (anchor.speedMps >= NAV_DR_MIN_SPEED_MPS) {
    const extrapolateSec = Math.min(ageSec, NAV_DR_EXTRAPOLATE_SECONDS);
    const decay =
      ageSec <= NAV_DR_EXTRAPOLATE_SECONDS
        ? 1
        : Math.max(0, 1 - (ageSec - NAV_DR_EXTRAPOLATE_SECONDS) / NAV_DR_DECAY_SECONDS);
    creepMeters = Math.min(anchor.speedMps * extrapolateSec * decay, NAV_DR_MAX_CREEP_METERS);
  }
  const targetAlong = Math.min(Math.max(0, anchor.alongMeters + creepMeters), routeLengthMeters);

  let renderedAlong =
    prevRendered == null
      ? targetAlong
      : prevRendered + (targetAlong - prevRendered) * NAV_POSITION_SMOOTHING;
  // Não recua de forma perceptível (ruído de fix), mas deixa corrigir um
  // overshoot pequeno do dead-reckoning.
  if (prevRendered != null && renderedAlong < prevRendered - 3) {
    renderedAlong = prevRendered - 3;
  }
  renderedAlong = Math.min(Math.max(0, renderedAlong), routeLengthMeters);

  const loc = locateAlongRoute(geometry, renderedAlong);

  // Trilha da corda de rumo: cheia (NAV_BEARING_TRAIL_METERS) enquanto se
  // aproxima da manobra e enquanto não há vértice informado — segura a perna
  // atual e não corta a curva em "L". Depois de cruzar o vértice, encolhe
  // proporcionalmente ao que já se andou além dele (piso NAV_BEARING_TRAIL_MIN_METERS)
  // para a câmera travar na perna nova logo na quina, sem "andar de lado".
  const metersPastManeuver =
    maneuverAlongMeters != null ? renderedAlong - maneuverAlongMeters : -1;
  const bearingTrailMeters =
    metersPastManeuver > 0
      ? Math.max(NAV_BEARING_TRAIL_MIN_METERS, Math.min(NAV_BEARING_TRAIL_METERS, metersPastManeuver))
      : NAV_BEARING_TRAIL_METERS;

  const routeBearing =
    travelBearingAlong(geometry, renderedAlong, bearingTrailMeters, NAV_BEARING_LOOKAHEAD_METERS) ??
    smoothedBearingDegrees ??
    headingDegrees ??
    0;
  const targetBearing =
    headingDegrees != null &&
    Math.abs(signedBearingDelta(routeBearing, headingDegrees)) >
      NAV_OFF_ROUTE_HEADING_DIVERGENCE_DEGREES
      ? headingDegrees
      : routeBearing;
  const prevBearing = smoothedBearingDegrees ?? targetBearing;
  const bearingDegrees =
    (prevBearing +
      signedBearingDelta(prevBearing, targetBearing) * NAV_BEARING_SMOOTHING_PER_FRAME +
      360) %
    360;

  return {
    center: loc.point,
    bearingDegrees,
    vehicleBearingDegrees: (targetBearing + 360) % 360,
    // O centro do mapa cai a (0.5 + ratio) da altura da tela — mesma posição do
    // ícone fixo do veículo em MapView. `padding` não roda com o bearing (ao
    // contrário do antigo `offset` do easeTo), então a linha encosta no ícone em
    // qualquer rotação.
    paddingTopPx: clientHeightPx * 2 * NAV_PUCK_VERTICAL_OFFSET_RATIO,
    renderedAlongMeters: renderedAlong,
    lineProjection: {
      distanceMeters: 0,
      segmentIndex: loc.segmentIndex,
      alongMeters: loc.alongMeters,
      point: loc.point,
    },
  };
}
