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

export interface AlongRouteLocation {
  /** Ponto sobre a polilinha, a `alongMeters` do início. */
  point: Coordinates;
  /** Índice do segmento (i → i+1) em que o ponto caiu. */
  segmentIndex: number;
  /** A distância efetivamente usada, já fixada em [0, comprimento total]. */
  alongMeters: number;
}

// Caminha `alongMeters` a partir do início da polilinha, segmento a segmento, e
// devolve o ponto exato ali (interpolado no segmento) + o índice do segmento.
// `alongMeters` é fixado em [0, comprimento total]. Usado para "antecipar" a
// posição da câmera/linha da navegação alguns metros à frente do veículo, ao
// longo da rota, na velocidade medida pelo GPS — ver `useMapboxMap`.
export function locateAlongRoute(line: Coordinates[], alongMeters: number): AlongRouteLocation {
  if (line.length === 0) {
    return { point: { lat: 0, lng: 0 }, segmentIndex: 0, alongMeters: 0 };
  }
  if (line.length === 1) {
    return { point: line[0], segmentIndex: 0, alongMeters: 0 };
  }
  const total = polylineLengthMeters(line);
  const target = Math.max(0, Math.min(alongMeters, total));
  let accumulated = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const segLen = haversineDistanceMeters(line[i], line[i + 1]);
    if (accumulated + segLen >= target || i === line.length - 2) {
      const t = segLen === 0 ? 0 : Math.max(0, Math.min(1, (target - accumulated) / segLen));
      return {
        point: {
          lat: line[i].lat + (line[i + 1].lat - line[i].lat) * t,
          lng: line[i].lng + (line[i + 1].lng - line[i].lng) * t,
        },
        segmentIndex: i,
        alongMeters: target,
      };
    }
    accumulated += segLen;
  }
  const last = line.length - 1;
  return { point: line[last], segmentIndex: last - 1, alongMeters: target };
}

// Azimute do "rumo de deslocamento" num ponto da rota: a corda de `backMeters`
// ATRÁS do ponto até `aheadMeters` À FRENTE, ao longo da geometria. Com viés
// para trás, o rumo mantém a direção da PERNA em que o veículo está e só gira ao
// ATRAVESSAR o vértice — sem "cortar" uma curva fechada em "L" antes da hora
// (uma corda só para a frente já apontava para a outra perna do L bem antes de
// chegar na quina). Corda longa também tira o tremor da geometria decimada de
// rotatória. Perto do fim/começo da rota (corda degenerada), cai no último
// segmento com comprimento real.
export function travelBearingAlong(
  line: Coordinates[],
  alongMeters: number,
  backMeters: number,
  aheadMeters: number,
): number | null {
  if (line.length < 2) {
    return null;
  }
  const from = locateAlongRoute(line, alongMeters - backMeters);
  const to = locateAlongRoute(line, alongMeters + aheadMeters);
  if (haversineDistanceMeters(from.point, to.point) >= 0.5) {
    return bearingBetween(from.point, to.point);
  }
  for (let i = line.length - 2; i >= 0; i--) {
    if (haversineDistanceMeters(line[i], line[i + 1]) >= 0.5) {
      return bearingBetween(line[i], line[i + 1]);
    }
  }
  return null;
}

// Quanto a via GIRA num ponto de manobra, em graus assinados (-180, 180]:
// positivo = curva para a DIREITA, negativo = para a ESQUERDA, ~0 = reto.
// Mede o rumo de CHEGADA (corda de `sampleMeters` antes do ponto até o ponto) e
// o de SAÍDA (do ponto até `sampleMeters` depois) sobre a geometria real e tira
// a diferença. É a fonte de verdade para a seta do painel de manobra — a mesma
// geometria que a seta branca sobre a linha já usa —, em vez do texto
// "left"/"right" do provedor, que erra em vias de serviço/retornos.
// `null` quando a geometria é curta ou degenerada demais para um rumo confiável.
export function turnAngleAtPoint(
  line: Coordinates[],
  maneuverPoint: Coordinates,
  sampleMeters = 20,
): number | null {
  if (line.length < 2) {
    return null;
  }
  const cornerIndex = findNearestPointIndex(maneuverPoint, line);
  const cornerAlong = polylineLengthMeters(line.slice(0, cornerIndex + 1));

  const before = locateAlongRoute(line, cornerAlong - sampleMeters);
  const corner = locateAlongRoute(line, cornerAlong);
  const after = locateAlongRoute(line, cornerAlong + sampleMeters);

  if (
    haversineDistanceMeters(before.point, corner.point) < 2 ||
    haversineDistanceMeters(corner.point, after.point) < 2
  ) {
    return null;
  }

  const approach = bearingBetween(before.point, corner.point);
  const exit = bearingBetween(corner.point, after.point);
  return signedBearingDelta(approach, exit);
}

// Compat.: corda puramente para a frente (equivalente a travelBearingAlong com
// backMeters = 0).
export function forwardBearingAlong(
  line: Coordinates[],
  alongMeters: number,
  sampleMeters: number,
): number | null {
  return travelBearingAlong(line, alongMeters, 0, sampleMeters);
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
  /** O ponto projetado SOBRE a polilinha (o "grudado na pista"). */
  point: Coordinates;
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
    return {
      distanceMeters: 0,
      segmentIndex: 0,
      alongMeters: 0,
      point: line[0] ?? point,
    };
  }

  const fromIndex = Math.max(0, Math.min(window?.fromIndex ?? 0, line.length - 2));
  const toIndex = Math.max(
    fromIndex,
    Math.min(window?.toIndex ?? line.length - 2, line.length - 2),
  );

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
      best = {
        distanceMeters,
        segmentIndex: i,
        alongMeters: prefixMeters + t * segLen,
        // Interpolação linear em lat/lng no segmento — coerente com a
        // aproximação planar usada acima e suficiente nesta escala.
        point: {
          lat: a.lat + (b.lat - a.lat) * t,
          lng: a.lng + (b.lng - a.lng) * t,
        },
      };
    }
    prefixMeters += segLen;
  }

  return best ?? { distanceMeters: 0, segmentIndex: fromIndex, alongMeters: 0, point };
}
