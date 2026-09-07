import type { BannerInstruction, ManeuverLane, Route } from '../../types';
import { turnAngleAtPoint } from '../../utils/distance';

// Distância (m) da manobra abaixo da qual as setas de faixa aparecem.
export const LANE_GUIDANCE_DISTANCE_M = 450;
// A manobra seguinte só entra no preview "e depois" se vier até esta
// distância (m) depois da próxima — ou seja, manobras "coladas".
export const THEN_PREVIEW_DISTANCE_M = 400;

// Frase curta em pt-BR para o sentido da curva, a partir do ângulo REAL da
// geometria (graus assinados: + = direita, - = esquerda). Acompanha a seta no
// painel para o motorista LER o percurso, não só interpretar o desenho. Via
// reta (ou sem ângulo) → `null`: não há o que dizer.
export function describeTurn(geometryTurnDegrees: number | null): string | null {
  if (geometryTurnDegrees == null) {
    return null;
  }
  const magnitude = Math.abs(geometryTurnDegrees);
  if (magnitude <= 18) {
    return null;
  }
  if (magnitude >= 160) {
    return 'retorno';
  }
  const side = geometryTurnDegrees > 0 ? 'à direita' : 'à esquerda';
  if (magnitude <= 60) {
    return `levemente ${side}`;
  }
  if (magnitude >= 115) {
    return `fechada ${side}`;
  }
  return side;
}

export interface ThenView {
  maneuverType: string;
  maneuverModifier: string | null;
  // Quanto a via gira nessa manobra, pela geometria real (graus assinados,
  // + = direita, - = esquerda). `null` sem geometria. Fonte de verdade da seta.
  geometryTurnDegrees: number | null;
  // Frase pronta do sentido ("à direita", "retorno"…) — ver describeTurn.
  turnLabel: string | null;
  text: string;
}

export interface GuidanceView {
  maneuverType: string;
  maneuverModifier: string | null;
  // Quanto a via gira na próxima manobra, pela geometria real (graus assinados,
  // + = direita, - = esquerda). `null` sem geometria. É o que gira a seta do
  // painel — mesma fonte que a seta branca sobre a linha azul —, para o painel
  // nunca apontar ao contrário da curva desenhada no mapa.
  geometryTurnDegrees: number | null;
  // Frase pronta do sentido ("à direita", "retorno"…) — ver describeTurn.
  turnLabel: string | null;
  roundaboutDegrees: number | null;
  roundaboutExit: number | null;
  distanceMeters: number | null;
  primaryText: string;
  secondaryText: string | null;
  lanes: ManeuverLane[];
  then: ThenView | null;
  currentRoadName: string;
}

// `banners` chega ordenado por triggerDistanceMeters DESC (ver getDirections).
// O banner "ativo" é o de menor gatilho que já valeu para a distância atual.
function pickActiveBanner(
  banners: BannerInstruction[],
  distanceToManeuverMeters: number | null,
): BannerInstruction | null {
  if (banners.length === 0) {
    return null;
  }
  const remaining = distanceToManeuverMeters ?? Number.POSITIVE_INFINITY;
  let active = banners[0];
  for (const banner of banners) {
    if (banner.triggerDistanceMeters >= remaining) {
      active = banner;
    }
  }
  return active;
}

export function selectGuidance(
  route: Route | null,
  currentStepIndex: number,
  distanceToManeuverMeters: number | null,
): GuidanceView | null {
  if (!route || route.steps.length === 0) {
    return null;
  }

  const stepCount = route.steps.length;
  const upcomingIndex = Math.min(currentStepIndex + 1, stepCount - 1);
  const upcoming = route.steps[upcomingIndex];
  const activeBanner = pickActiveBanner(upcoming.banners ?? [], distanceToManeuverMeters);

  const geometry = route.geometry ?? [];
  const geometryTurnDegrees =
    geometry.length >= 2 ? turnAngleAtPoint(geometry, upcoming.maneuverLocation) : null;

  const lanes =
    distanceToManeuverMeters != null &&
    distanceToManeuverMeters <= LANE_GUIDANCE_DISTANCE_M &&
    activeBanner != null &&
    activeBanner.lanes.length > 0
      ? activeBanner.lanes
      : [];

  let then: ThenView | null = null;
  const afterIndex = upcomingIndex + 1;
  if (afterIndex <= stepCount - 1 && upcoming.distanceMeters <= THEN_PREVIEW_DISTANCE_M) {
    const after = route.steps[afterIndex];
    const afterBanner = (after.banners ?? [])[0] ?? null;
    const afterTurnDegrees =
      geometry.length >= 2 ? turnAngleAtPoint(geometry, after.maneuverLocation) : null;
    then = {
      maneuverType: afterBanner?.maneuverType ?? after.maneuverType,
      maneuverModifier: afterBanner?.maneuverModifier ?? after.maneuverModifier,
      geometryTurnDegrees: afterTurnDegrees,
      turnLabel: describeTurn(afterTurnDegrees),
      text: afterBanner?.primaryText ?? after.instruction,
    };
  }

  return {
    maneuverType: activeBanner?.maneuverType ?? upcoming.maneuverType,
    maneuverModifier: activeBanner?.maneuverModifier ?? upcoming.maneuverModifier,
    geometryTurnDegrees,
    turnLabel: describeTurn(geometryTurnDegrees),
    roundaboutDegrees: activeBanner?.roundaboutDegrees ?? null,
    roundaboutExit: upcoming.roundaboutExit ?? null,
    distanceMeters: distanceToManeuverMeters ?? upcoming.distanceMeters,
    primaryText: activeBanner?.primaryText ?? upcoming.instruction,
    secondaryText: activeBanner?.secondaryText ?? null,
    lanes,
    then,
    currentRoadName: route.steps[currentStepIndex]?.roadName ?? '',
  };
}
