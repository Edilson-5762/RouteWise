import { describe, it, expect } from 'vitest';
import {
  buildRouteGeojson,
  buildNavigationRouteGeojson,
  buildManeuverArrowGeojson,
  buildDestinationConnectorGeojson,
  projectVehicleOntoRoute,
  bearingBetween,
} from './navigationGeometry';
import type { Route } from '../../types';

const route: Route = {
  // Linha reta indo para o norte (lng fixo, lat crescente), ~111m entre pontos.
  geometry: [
    { lat: 0, lng: 0 },
    { lat: 0.001, lng: 0 },
    { lat: 0.002, lng: 0 },
    { lat: 0.003, lng: 0 },
    { lat: 0.004, lng: 0 },
  ],
  steps: [],
  distanceMeters: 444,
  durationSeconds: 60,
};

describe('buildRouteGeojson (planejamento)', () => {
  it('prepende a origem informada como primeiro ponto da linha', () => {
    const feature = buildRouteGeojson(route, { lat: -0.001, lng: 0 });
    expect(feature.geometry.coordinates[0]).toEqual([0, -0.001]);
    expect(feature.geometry.coordinates).toHaveLength(route.geometry.length + 1);
  });

  it('não duplica quando a origem já é o primeiro ponto', () => {
    const feature = buildRouteGeojson(route, { lat: 0, lng: 0 });
    expect(feature.geometry.coordinates).toHaveLength(route.geometry.length);
  });

  it('sem origem, usa a geometria da rota como está', () => {
    const feature = buildRouteGeojson(route, null);
    expect(feature.geometry.coordinates).toHaveLength(route.geometry.length);
  });
});

describe('buildNavigationRouteGeojson (navegação)', () => {
  it('fica toda colada na pista (lng ~0) e passa pelo ponto projetado, não pela posição crua do GPS', () => {
    // GPS ~1 m a leste da rota (que é reta em lng 0).
    const projection = projectVehicleOntoRoute(route, { lat: 0.00205, lng: 0.00001 }, 0);
    const feature = buildNavigationRouteGeojson(route, projection);
    // Nenhum ponto da linha sai da pista (o lng 0.00001 do GPS nunca entra).
    for (const [lng] of feature.geometry.coordinates) {
      expect(lng).toBeCloseTo(0, 6);
    }
    // O ponto projetado (na latitude do veículo) está na linha.
    const hasProjected = feature.geometry.coordinates.some(
      ([, lat]) => Math.abs(lat - 0.00205) < 0.0001,
    );
    expect(hasProjected).toBe(true);
  });

  it('desenha um pouco do trecho JÁ PERCORRIDO atrás do veículo, e vai até o fim da rota', () => {
    // Veículo perto do meio da rota (lat ~0.002).
    const projection = projectVehicleOntoRoute(route, { lat: 0.002, lng: 0 }, 0);
    const feature = buildNavigationRouteGeojson(route, projection);
    const coords = feature.geometry.coordinates;
    // Vai até o destino.
    expect(coords[coords.length - 1]).toEqual([0, 0.004]);
    // E começa ANTES da posição do veículo (há ponto com lat < 0.002 — o
    // "backtrack" que faz a linha alcançar o ícone do veículo).
    expect(coords[0][1]).toBeLessThan(0.002);
  });

  it('mantém pelo menos 2 pontos mesmo colado no destino', () => {
    const projection = projectVehicleOntoRoute(route, { lat: 0.004, lng: 0 }, 0);
    const feature = buildNavigationRouteGeojson(route, projection);
    expect(feature.geometry.coordinates.length).toBeGreaterThanOrEqual(2);
  });

  it('ancorada no progresso, a projeção não "volta" para um trecho anterior fisicamente próximo', () => {
    // Rota que sobe e depois desce rente à subida (ruas paralelas num grid).
    const crossing: Route = {
      geometry: [
        { lat: 0, lng: 0 }, // v0
        { lat: 0.001, lng: 0 }, // v1  seg 0 (subida)
        { lat: 0.002, lng: 0 }, // v2  seg 1 (subida)
        { lat: 0.002, lng: 0.0002 }, // v3  seg 2 (leste)
        { lat: 0.0004, lng: 0.0002 }, // v4  seg 3 (descida, rente à subida)
      ],
      steps: [],
      distanceMeters: 500,
      durationSeconds: 60,
    };
    // Veículo já na descida (perto de v4), mas fisicamente colado à subida
    // (lng ~0). Ancorado no progresso 3, a janela começa no segmento 0 (=3-3),
    // mas a projeção fica no segmento 3 (o mais próximo do ponto) — e não
    // "volta" para o segmento 0/1 quando o progresso avança.
    const projection = projectVehicleOntoRoute(crossing, { lat: 0.0006, lng: 0.00018 }, 3);
    expect(projection.segmentIndex).toBe(3);
    const feature = buildNavigationRouteGeojson(crossing, projection);
    expect(feature.geometry.coordinates.length).toBeGreaterThanOrEqual(2);
  });

  it('sem projeção, devolve a rota inteira', () => {
    const feature = buildNavigationRouteGeojson(route, null);
    expect(feature.geometry.coordinates).toHaveLength(route.geometry.length);
  });
});

describe('buildManeuverArrowGeojson', () => {
  const turningRoute: Route = {
    // Segue para o norte até (0.002, 0), vira à direita (leste) até (0.002, 0.002).
    geometry: [
      { lat: 0, lng: 0 },
      { lat: 0.001, lng: 0 },
      { lat: 0.002, lng: 0 },
      { lat: 0.002, lng: 0.001 },
      { lat: 0.002, lng: 0.002 },
    ],
    steps: [
      {
        instruction: 'Siga para o norte',
        distanceMeters: 222,
        durationSeconds: 30,
        maneuverLocation: { lat: 0, lng: 0 },
        maneuverType: 'depart',
        maneuverModifier: null,
      },
      {
        instruction: 'Vire à direita',
        distanceMeters: 222,
        durationSeconds: 30,
        maneuverLocation: { lat: 0.002, lng: 0 },
        maneuverType: 'turn',
        maneuverModifier: 'right',
      },
    ],
    distanceMeters: 444,
    durationSeconds: 60,
  };

  it('não desenha nada quando não há manobra à frente (último passo)', () => {
    const fc = buildManeuverArrowGeojson(turningRoute, true, 1, 10);
    expect(fc.features).toHaveLength(0);
  });

  it('não desenha nada enquanto a manobra ainda está longe (> ~150 m)', () => {
    const fc = buildManeuverArrowGeojson(turningRoute, true, 0, 220);
    expect(fc.features).toHaveLength(0);
  });

  it('ao entrar na faixa de visibilidade, desenha a LINHA no formato da curva + a CABEÇA na ponta', () => {
    const fc = buildManeuverArrowGeojson(turningRoute, true, 0, 40);
    expect(fc.features).toHaveLength(2);

    const shape = fc.features.find((f) => f.properties?.role === 'shape');
    const head = fc.features.find((f) => f.properties?.role === 'head');
    expect(shape).toBeDefined();
    expect(head).toBeDefined();

    // A linha traça a geometria real: passa pela quina (0, 0.002) e tem um
    // ponto ANTES (mais ao sul) e um DEPOIS (mais a leste).
    expect(shape!.geometry.type).toBe('LineString');
    const coords = (shape!.geometry as unknown as { coordinates: [number, number][] }).coordinates;
    expect(coords.length).toBeGreaterThanOrEqual(3);
    expect(coords.some(([lng, lat]) => Math.abs(lng) < 1e-9 && Math.abs(lat - 0.002) < 1e-9)).toBe(
      true,
    );
    expect(coords[0][1]).toBeLessThan(0.002); // começa antes da quina (ao sul)
    expect(coords[coords.length - 1][0]).toBeGreaterThan(0); // termina depois (a leste)

    // A cabeça fica na ponta e aponta para a SAÍDA da curva (~leste = 90°).
    expect(head!.geometry.type).toBe('Point');
    expect((head!.properties as { bearing: number }).bearing).toBeCloseTo(90, 0);
  });

  it('não desenha para manobra de seguir reto (continue / sem curva)', () => {
    const straightRoute: Route = {
      ...turningRoute,
      steps: [
        turningRoute.steps[0],
        { ...turningRoute.steps[1], maneuverType: 'continue', maneuverModifier: 'straight' },
      ],
    };
    expect(buildManeuverArrowGeojson(straightRoute, true, 0, 40).features).toHaveLength(0);
  });

  it('nada fora da navegação', () => {
    expect(buildManeuverArrowGeojson(turningRoute, false, 0, 40).features).toHaveLength(0);
  });

  it('sem distanceToManeuverMeters, cai na distância crua da posição informada', () => {
    // Longe: nada.
    expect(
      buildManeuverArrowGeojson(turningRoute, true, 0, null, { lat: 0, lng: 0 }).features,
    ).toHaveLength(0);
    // Perto (~30 m antes da quina): desenha.
    expect(
      buildManeuverArrowGeojson(turningRoute, true, 0, null, { lat: 0.00173, lng: 0 }).features
        .length,
    ).toBeGreaterThan(0);
  });

  // Rotatória modelada em 3 passos: aproximação → 'roundabout' (arco entrada→
  // saída, ~60 m) → 'continue'/'straight' (via depois, NÃO é curva).
  const roundaboutRoute: Route = {
    geometry: [
      { lat: 0, lng: 0 },
      { lat: 0.0009, lng: 0 }, // aproximação (~100 m ao norte)
      { lat: 0.001, lng: 0 }, // ENTRADA da rotatória
      { lat: 0.00114, lng: 0.00005 },
      { lat: 0.0012, lng: 0.0002 },
      { lat: 0.00112, lng: 0.00034 },
      { lat: 0.001, lng: 0.0004 }, // SAÍDA da rotatória
      { lat: 0.001, lng: 0.0016 }, // via depois (~130 m a leste)
    ],
    steps: [
      {
        instruction: 'Siga ao norte',
        distanceMeters: 111,
        durationSeconds: 15,
        maneuverLocation: { lat: 0, lng: 0 },
        maneuverType: 'depart',
        maneuverModifier: null,
      },
      {
        instruction: 'Na rotatória, pegue a 2ª saída',
        distanceMeters: 63,
        durationSeconds: 10,
        maneuverLocation: { lat: 0.001, lng: 0 }, // entrada
        maneuverType: 'roundabout',
        maneuverModifier: 'right',
        roundaboutExit: 2,
      },
      {
        instruction: 'Siga em frente',
        distanceMeters: 133,
        durationSeconds: 18,
        maneuverLocation: { lat: 0.001, lng: 0.0004 }, // saída
        maneuverType: 'continue',
        maneuverModifier: 'straight',
      },
    ],
    distanceMeters: 307,
    durationSeconds: 43,
  };

  it('rotatória: enquanto se PERCORRE o balão (passo atual é rotatória), a seta continua na tela mesmo que o passo seguinte não seja curva', () => {
    // currentStepIndex = 1 → passo atual é 'roundabout', seguinte é 'continue/straight'.
    // Antes: upcoming (continue/straight) não é curva → sumia. Agora: desenha o balão.
    const fc = buildManeuverArrowGeojson(roundaboutRoute, true, 1, 20);
    expect(fc.features.length).toBe(2);
  });

  it('rotatória: a seta traça o balão INTEIRO, da entrada até a saída', () => {
    const fc = buildManeuverArrowGeojson(roundaboutRoute, true, 1, 20);
    const shape = fc.features.find((f) => f.properties?.role === 'shape');
    const coords = (shape!.geometry as unknown as { coordinates: [number, number][] }).coordinates;
    // Passa pelo topo do balão (lat ~0.0012) E chega perto da saída (lng ~0.0004).
    expect(coords.some(([, lat]) => lat > 0.00118)).toBe(true);
    expect(coords.some(([lng]) => lng > 0.00038)).toBe(true);
  });

  it('rotatória: aproximando (passo SEGUINTE é rotatória) também desenha o balão inteiro', () => {
    // currentStepIndex = 0, dentro da faixa de visibilidade.
    const fc = buildManeuverArrowGeojson(roundaboutRoute, true, 0, 40);
    expect(fc.features.length).toBe(2);
    const shape = fc.features.find((f) => f.properties?.role === 'shape');
    const coords = (shape!.geometry as unknown as { coordinates: [number, number][] }).coordinates;
    expect(coords.some(([lng]) => lng > 0.00038)).toBe(true);
  });

  it('rotatória: já na via de depois (passo atual não é mais rotatória) volta ao normal', () => {
    // currentStepIndex = 2: atual 'continue', seguinte não existe → nada.
    expect(buildManeuverArrowGeojson(roundaboutRoute, true, 2, 10).features).toHaveLength(0);
  });
});

describe('buildDestinationConnectorGeojson', () => {
  const routeEndingShortOfPin: Route = {
    geometry: [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 0.0009 }, // fim da rota (~100 m a leste)
    ],
    steps: [],
    distanceMeters: 100,
    durationSeconds: 20,
  };

  it('sem rota ou sem pino → vazio', () => {
    expect(buildDestinationConnectorGeojson(null, { lat: 0, lng: 0 }).features).toHaveLength(0);
    expect(buildDestinationConnectorGeojson(routeEndingShortOfPin, null).features).toHaveLength(0);
  });

  it('pino dentro da folga mínima (< 20 m) → vazio (não vale a pena)', () => {
    const pinoColado = { lat: 0, lng: 0.00091 }; // ~1 m do fim
    const pinoQuinzeMetros = { lat: 0, lng: 0.001035 }; // ~15 m do fim
    expect(
      buildDestinationConnectorGeojson(routeEndingShortOfPin, pinoColado).features,
    ).toHaveLength(0);
    expect(
      buildDestinationConnectorGeojson(routeEndingShortOfPin, pinoQuinzeMetros).features,
    ).toHaveLength(0);
  });

  it('pino dezenas de metros adentro → um segmento do fim da rota até o pino', () => {
    const pinoAdentro = { lat: 0.0004, lng: 0.0011 }; // ~50 m adiante/ao lado
    const fc = buildDestinationConnectorGeojson(routeEndingShortOfPin, pinoAdentro);
    expect(fc.features).toHaveLength(1);
    const coords = (fc.features[0].geometry as unknown as { coordinates: [number, number][] })
      .coordinates;
    expect(coords[0]).toEqual([0.0009, 0]); // começa no fim da rota
    expect(coords[coords.length - 1]).toEqual([0.0011, 0.0004]); // termina no pino
  });
});

describe('bearingBetween', () => {
  it('ao norte ≈ 0°', () => {
    expect(bearingBetween({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(0, 0);
  });

  it('a leste ≈ 90°', () => {
    expect(bearingBetween({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(90, 0);
  });

  it('ao sul ≈ 180°', () => {
    expect(bearingBetween({ lat: 0, lng: 0 }, { lat: -1, lng: 0 })).toBeCloseTo(180, 0);
  });

  it('a oeste ≈ 270°', () => {
    expect(bearingBetween({ lat: 0, lng: 0 }, { lat: 0, lng: -1 })).toBeCloseTo(270, 0);
  });
});
