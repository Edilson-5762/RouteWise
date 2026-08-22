export interface Coordinates {
  lat: number;
  lng: number;
}

export type TravelProfile = 'driving' | 'walking' | 'cycling';

export interface GeocodingSuggestion {
  id: string;
  placeName: string;
  coordinates: Coordinates;
}

export interface RouteStep {
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
  maneuverLocation: Coordinates;
}

export interface Route {
  geometry: Coordinates[];
  steps: RouteStep[];
  distanceMeters: number;
  durationSeconds: number;
}

export type NavigationStatus = 'idle' | 'routePlanned' | 'navigating';

export interface NavigationState {
  status: NavigationStatus;
  origin: Coordinates | null;
  destination: Coordinates | null;
  route: Route | null;
  currentStepIndex: number;
  travelProfile: TravelProfile;
}
