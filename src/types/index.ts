export interface Coordinates {
  lat: number;
  lng: number;
}

export type TravelProfile = 'driving' | 'motorcycling' | 'walking' | 'cycling';

export interface GeocodingSuggestion {
  id: string;
  placeName: string;
  coordinates: Coordinates;
}

// Resultado bruto do endpoint de sugestão (suggest) da Search Box API: em
// geral ainda não tem coordenadas, só é possível obtê-las chamando
// `retrievePlace` com o `id` da sugestão escolhida. A exceção são sugestões
// de fontes locais (gazetteer de regiões administrativas do DF, ver
// `data/dfAdministrativeRegions.ts`) que já nascem com `coordinates`
// conhecidas e pulam essa segunda chamada de rede.
export interface PlaceSuggestion {
  id: string;
  placeName: string;
  coordinates?: Coordinates;
}

export interface RouteStep {
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
  maneuverLocation: Coordinates;
  maneuverType: string;
  maneuverModifier: string | null;
}

export interface Route {
  geometry: Coordinates[];
  steps: RouteStep[];
  distanceMeters: number;
  durationSeconds: number;
}

export type NavigationStatus = 'idle' | 'routePlanned' | 'navigating' | 'arrived';

export interface NavigationState {
  status: NavigationStatus;
  origin: Coordinates | null;
  destination: Coordinates | null;
  route: Route | null;
  currentStepIndex: number;
  travelProfile: TravelProfile;
  routeDeviated: boolean;
}

export interface SavedPlace {
  id: string;
  label: string;
  coordinates: Coordinates;
}

// Altura (em px) de painéis sobrepostos ao mapa (cabeçalho de busca, cartão
// de destino) — usada para dar ao `fitBounds` um padding que reflete o
// espaço realmente coberto por eles, em vez de um valor fixo (ver
// `useElementHeight` e `PlanningView`).
export interface MapChromeInsets {
  top: number;
  bottom: number;
}
