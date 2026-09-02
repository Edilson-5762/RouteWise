import type {
  BannerInstruction,
  Coordinates,
  ManeuverLane,
  Route,
  RouteStep,
  TravelProfile,
} from '../types';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const DIRECTIONS_BASE_URL = 'https://api.mapbox.com/directions/v5/mapbox';

export class MapboxRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MapboxRequestError';
  }
}

/**
 * Verifica se um token do Mapbox foi configurado (via VITE_MAPBOX_TOKEN),
 * para que a aplicação possa exibir um aviso amigável em vez de disparar
 * requisições silenciosas com `access_token=undefined`.
 */
export function hasMapboxToken(): boolean {
  return typeof MAPBOX_TOKEN === 'string' && MAPBOX_TOKEN.trim().length > 0;
}

interface DirectionsManeuver {
  instruction: string;
  location: [number, number];
  type: string;
  modifier?: string;
  exit?: number;
}

interface BannerComponentRaw {
  type: string;
  active?: boolean;
  directions?: string[];
}

interface BannerTextRaw {
  text: string;
  type?: string;
  modifier?: string;
  degrees?: number;
  components?: BannerComponentRaw[];
}

interface BannerInstructionRaw {
  distanceAlongGeometry: number;
  primary: BannerTextRaw;
  secondary?: BannerTextRaw | null;
  sub?: BannerTextRaw | null;
}

interface DirectionsStep {
  maneuver: DirectionsManeuver;
  distance: number;
  duration: number;
  name?: string;
  bannerInstructions?: BannerInstructionRaw[];
}

interface DirectionsLeg {
  steps: DirectionsStep[];
}

interface DirectionsRoute {
  geometry: { coordinates: [number, number][] };
  legs: DirectionsLeg[];
  distance: number;
  duration: number;
}

interface DirectionsResponse {
  routes: DirectionsRoute[];
  code: string;
}

// A API de Directions do Mapbox não tem um perfil dedicado para motos;
// `driving` é o mais próximo (uso de vias veiculares), então mapeamos aqui
// mantendo `motorcycling` como perfil interno para UI, ETA e ícone distintos.
const MAPBOX_DIRECTIONS_PROFILE: Record<TravelProfile, string> = {
  driving: 'driving',
  motorcycling: 'driving',
  walking: 'walking',
  cycling: 'cycling',
};

function toBannerInstruction(raw: BannerInstructionRaw, step: DirectionsStep): BannerInstruction {
  const lanes: ManeuverLane[] = (raw.sub?.components ?? [])
    .filter((component) => component.type === 'lane')
    .map((component) => ({
      active: component.active === true,
      directions: component.directions ?? [],
    }));

  return {
    triggerDistanceMeters: raw.distanceAlongGeometry,
    primaryText: raw.primary.text,
    secondaryText: raw.secondary?.text ?? null,
    maneuverType: raw.primary.type ?? step.maneuver.type,
    maneuverModifier: raw.primary.modifier ?? null,
    roundaboutDegrees: typeof raw.primary.degrees === 'number' ? raw.primary.degrees : null,
    lanes,
  };
}

export async function getDirections(
  origin: Coordinates,
  destination: Coordinates,
  profile: TravelProfile,
): Promise<Route> {
  const coordinates = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const url = `${DIRECTIONS_BASE_URL}/${MAPBOX_DIRECTIONS_PROFILE[profile]}/${coordinates}?geometries=geojson&steps=true&banner_instructions=true&overview=full&language=pt&access_token=${MAPBOX_TOKEN}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new MapboxRequestError(`Falha ao calcular rota: ${response.status}`);
  }

  const data = (await response.json()) as DirectionsResponse;

  if (data.code !== 'Ok' || data.routes.length === 0) {
    throw new MapboxRequestError('Nenhuma rota encontrada para este modo de transporte');
  }

  const mapboxRoute = data.routes[0];

  const steps: RouteStep[] = mapboxRoute.legs.flatMap((leg) =>
    leg.steps.map((step) => ({
      instruction: step.maneuver.instruction,
      distanceMeters: step.distance,
      durationSeconds: step.duration,
      maneuverLocation: { lng: step.maneuver.location[0], lat: step.maneuver.location[1] },
      maneuverType: step.maneuver.type,
      maneuverModifier: step.maneuver.modifier ?? null,
      roadName: step.name ?? '',
      roundaboutExit: step.maneuver.exit ?? null,
      banners: [...(step.bannerInstructions ?? [])]
        .map((raw) => toBannerInstruction(raw, step))
        .sort((a, b) => b.triggerDistanceMeters - a.triggerDistanceMeters),
    })),
  );

  return {
    geometry: mapboxRoute.geometry.coordinates.map(([lng, lat]) => ({ lng, lat })),
    steps,
    distanceMeters: mapboxRoute.distance,
    durationSeconds: mapboxRoute.duration,
  };
}
