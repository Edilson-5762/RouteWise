import type { Coordinates } from '../../types';
import {
  forwardBearingAlong,
  locateAlongRoute,
  signedBearingDelta,
  type RouteProjection,
} from '../../utils/distance';
import {
  NAV_BEARING_SAMPLE_METERS,
  NAV_BEARING_SMOOTHING_PER_FRAME,
  NAV_DR_MAX_SECONDS,
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
}

export interface DriveStepOutput {
  center: Coordinates;
  bearingDegrees: number;
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
  } = input;

  if (geometry.length < 2) {
    return null;
  }

  // Avanço por conta própria desde o último fix, limitado no tempo (se o GPS
  // travar, para de correr em vez de "voar" rota afora).
  const elapsedSec = Math.min(Math.max(0, (nowMs - anchor.atMs) / 1000), NAV_DR_MAX_SECONDS);
  const creepMeters = anchor.speedMps >= NAV_DR_MIN_SPEED_MPS ? anchor.speedMps * elapsedSec : 0;
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

  const routeBearing =
    forwardBearingAlong(geometry, renderedAlong, NAV_BEARING_SAMPLE_METERS) ??
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
