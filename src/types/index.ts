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

export interface ManeuverLane {
  // `active`: esta faixa faz parte do caminho da manobra.
  active: boolean;
  // Direções que a faixa serve, ex.: ['left'], ['straight', 'right'].
  directions: string[];
}

// Uma "instrução de banner" do Mapbox: o texto em duas linhas da manobra,
// o ângulo da saída (em rotatória) e a guia de faixa. A API entrega várias
// por passo, cada uma com sua distância de gatilho; guardamos todas.
export interface BannerInstruction {
  // Distância (m) antes da manobra a partir da qual este banner passa a valer.
  triggerDistanceMeters: number;
  primaryText: string;
  secondaryText: string | null;
  maneuverType: string;
  maneuverModifier: string | null;
  roundaboutDegrees: number | null;
  lanes: ManeuverLane[];
}

export interface RouteStep {
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
  maneuverLocation: Coordinates;
  maneuverType: string;
  maneuverModifier: string | null;
  // Campos do turn-by-turn estilo Waze. Opcionais no tipo, mas SEMPRE
  // populados por `getDirections` — opcionais só para não quebrar fixtures
  // de teste antigas que constroem `RouteStep` à mão.
  roadName?: string;
  roundaboutExit?: number | null;
  banners?: BannerInstruction[];
}

// Nível de congestionamento de um trecho da rota, vindo das anotações do perfil
// `driving-traffic` da Directions API (annotations=congestion).
export type CongestionLevel = 'unknown' | 'low' | 'moderate' | 'heavy' | 'severe';

export interface Route {
  geometry: Coordinates[];
  steps: RouteStep[];
  distanceMeters: number;
  durationSeconds: number;
  // Um nível por SEGMENTO da geometria (comprimento = geometry.length - 1).
  // Só é preenchido para perfis com trânsito (driving / motorcycling); a pé e
  // de bike vem vazio. Opcional para não quebrar fixtures de teste antigas.
  congestions?: CongestionLevel[];
}

export type NavigationStatus = 'idle' | 'routePlanned' | 'navigating' | 'arrived';

// De que lado da via o destino ficou, em relação à direção de chegada — usado
// no aviso de voz e na tela de chegada ("seu destino fica à direita").
export type ArrivalSide = 'left' | 'right' | 'ahead';

export interface NavigationState {
  status: NavigationStatus;
  origin: Coordinates | null;
  destination: Coordinates | null;
  route: Route | null;
  currentStepIndex: number;
  travelProfile: TravelProfile;
  routeDeviated: boolean;
  // Índice do segmento da rota em que o usuário está (monotônico) — limita a
  // janela de busca da projeção para uma rota que passa perto de si mesma não
  // confundir a detecção de desvio.
  routeProgressIndex: number;
  // Metros que ainda faltam até a próxima manobra (cai conforme você se
  // aproxima). `null` antes do primeiro fix de progresso.
  distanceToManeuverMeters: number | null;
  // Distância JÁ PERCORRIDA ao longo da GEOMETRIA da rota (metros), da última
  // projeção aceita. Centro da banda que impede a projeção de "pular" para o
  // outro lado de uma rotatória/retorno. 0 = ainda não estabelecida.
  routeAlongMeters: number;
  // Trecho final: distância em linha reta até o pino quando a rota (via) já
  // acabou mas o destino fica adentro (rampa/estacionamento) e o veículo ainda
  // não parou lá. `null` fora dessa situação. Alimenta o "Continue X m até o
  // destino" no painel, junto com a linha tracejada no mapa.
  finalApproachMeters: number | null;
  arrivalSide: ArrivalSide;
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
