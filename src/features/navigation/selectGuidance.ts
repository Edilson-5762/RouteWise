import type { BannerInstruction, ManeuverLane, Route } from '../../types';

// Distância (m) da manobra abaixo da qual as setas de faixa aparecem.
export const LANE_GUIDANCE_DISTANCE_M = 450;
// A manobra seguinte só entra no preview "e depois" se vier até esta
// distância (m) depois da próxima — ou seja, manobras "coladas".
export const THEN_PREVIEW_DISTANCE_M = 400;

export interface ThenView {
  maneuverType: string;
  maneuverModifier: string | null;
  text: string;
}

export interface GuidanceView {
  maneuverType: string;
  maneuverModifier: string | null;
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
    then = {
      maneuverType: afterBanner?.maneuverType ?? after.maneuverType,
      maneuverModifier: afterBanner?.maneuverModifier ?? after.maneuverModifier,
      text: afterBanner?.primaryText ?? after.instruction,
    };
  }

  return {
    maneuverType: activeBanner?.maneuverType ?? upcoming.maneuverType,
    maneuverModifier: activeBanner?.maneuverModifier ?? upcoming.maneuverModifier,
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
