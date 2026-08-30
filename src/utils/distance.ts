import type { Coordinates } from '../types';

const EARTH_RADIUS_METERS = 6371000;

export function haversineDistanceMeters(a: Coordinates, b: Coordinates): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

export function findNearestPointIndex(point: Coordinates, line: Coordinates[]): number {
  let nearestIndex = 0;
  let nearestDistance = Infinity;

  line.forEach((candidate, index) => {
    const distance = haversineDistanceMeters(point, candidate);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  return nearestIndex;
}

// Azimute (0–360°, 0 = norte, 90 = leste) de `from` para `to`. Usado para
// girar a câmera na direção de deslocamento e para saber de que lado o destino
// fica na chegada.
export function bearingBetween(from: Coordinates, to: Coordinates): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;

  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const dLng = toRad(to.lng - from.lng);

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// Diferença angular assinada mais curta entre dois azimutes, em (-180, 180].
// Positivo = alvo à direita do de referência; negativo = à esquerda.
export function signedBearingDelta(fromDegrees: number, toDegrees: number): number {
  return ((toDegrees - fromDegrees + 540) % 360) - 180;
}

// Comprimento total de uma polilinha (soma dos segmentos), em metros.
export function polylineLengthMeters(line: Coordinates[]): number {
  let total = 0;
  for (let i = 0; i < line.length - 1; i++) {
    total += haversineDistanceMeters(line[i], line[i + 1]);
  }
  return total;
}

// Projeção de lat/lng para um plano local em metros (equirretangular) em torno
// de `ref` — preciso o bastante para dezenas/centenas de metros e barato para
// rodar a cada tick de GPS.
function toLocalMeters(p: Coordinates, ref: Coordinates): { x: number; y: number } {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  return {
    x: toRad(p.lng - ref.lng) * Math.cos(toRad(ref.lat)) * EARTH_RADIUS_METERS,
    y: toRad(p.lat - ref.lat) * EARTH_RADIUS_METERS,
  };
}

export interface RouteProjection {
  /** Distância perpendicular do ponto à polilinha, em metros. */
  distanceMeters: number;
  /** Índice do segmento (i → i+1) mais próximo. */
  segmentIndex: number;
  /** Distância acumulada, ao longo da rota, até a projeção do ponto (metros). */
  alongMeters: number;
}

// Projeta `point` sobre a polilinha `line` medindo a distância PERPENDICULAR a
// cada segmento (não a distância até o vértice mais próximo, que superestima em
// trechos retos longos). A janela opcional de segmentos evita que uma rota que
// passa perto de si mesma (ruas paralelas num grid) "grude" o ponto num trecho
// distante — o que causava desvio falso e pulos de passo.
export function projectOntoRoute(
  point: Coordinates,
  line: Coordinates[],
  window?: { fromIndex?: number; toIndex?: number },
): RouteProjection {
  if (line.length < 2) {
    return { distanceMeters: 0, segmentIndex: 0, alongMeters: 0 };
  }

  const fromIndex = Math.max(0, Math.min(window?.fromIndex ?? 0, line.length - 2));
  const toIndex = Math.max(fromIndex, Math.min(window?.toIndex ?? line.length - 2, line.length - 2));

  // Comprimento dos segmentos antes da janela, para `alongMeters` ficar
  // relativo ao início da rota (não ao início da janela).
  let prefixMeters = 0;
  for (let i = 0; i < fromIndex; i++) {
    prefixMeters += haversineDistanceMeters(line[i], line[i + 1]);
  }

  let best: RouteProjection | null = null;
  for (let i = fromIndex; i <= toIndex; i++) {
    const a = line[i];
    const b = line[i + 1];
    const ap = toLocalMeters(point, a);
    const ab = toLocalMeters(b, a);
    const abLenSq = ab.x * ab.x + ab.y * ab.y;
    const t = abLenSq === 0 ? 0 : Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y) / abLenSq));
    const dx = ap.x - ab.x * t;
    const dy = ap.y - ab.y * t;
    const distanceMeters = Math.sqrt(dx * dx + dy * dy);
    const segLen = haversineDistanceMeters(a, b);

    if (!best || distanceMeters < best.distanceMeters) {
      best = { distanceMeters, segmentIndex: i, alongMeters: prefixMeters + t * segLen };
    }
    prefixMeters += segLen;
  }

  return best ?? { distanceMeters: 0, segmentIndex: fromIndex, alongMeters: 0 };
}
