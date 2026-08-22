import type { Coordinates, GeocodingSuggestion, Route, RouteStep, TravelProfile } from '../types';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
const GEOCODING_BASE_URL = 'https://api.mapbox.com/geocoding/v5/mapbox.places';
const DIRECTIONS_BASE_URL = 'https://api.mapbox.com/directions/v5/mapbox';

export class MapboxRequestError extends Error {}

interface GeocodingFeature {
  id: string;
  place_name: string;
  center: [number, number];
}

interface GeocodingResponse {
  features: GeocodingFeature[];
}

export async function searchPlaces(query: string): Promise<GeocodingSuggestion[]> {
  const url = `${GEOCODING_BASE_URL}/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&autocomplete=true&limit=5`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new MapboxRequestError(`Falha na busca de endereço: ${response.status}`);
  }

  const data = (await response.json()) as GeocodingResponse;

  return data.features.map((feature) => ({
    id: feature.id,
    placeName: feature.place_name,
    coordinates: { lng: feature.center[0], lat: feature.center[1] },
  }));
}

interface DirectionsManeuver {
  instruction: string;
  location: [number, number];
}

interface DirectionsStep {
  maneuver: DirectionsManeuver;
  distance: number;
  duration: number;
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

export async function getDirections(
  origin: Coordinates,
  destination: Coordinates,
  profile: TravelProfile,
): Promise<Route> {
  const coordinates = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const url = `${DIRECTIONS_BASE_URL}/${profile}/${coordinates}?geometries=geojson&steps=true&overview=full&access_token=${MAPBOX_TOKEN}`;
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
    })),
  );

  return {
    geometry: mapboxRoute.geometry.coordinates.map(([lng, lat]) => ({ lng, lat })),
    steps,
    distanceMeters: mapboxRoute.distance,
    durationSeconds: mapboxRoute.duration,
  };
}
