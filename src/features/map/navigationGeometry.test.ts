import { describe, it, expect } from 'vitest';
import {
  buildRouteGeojson,
  buildNavigationRouteGeojson,
  buildManeuverArrowGeojson,
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
    const fc = buildManeuverArrowGeojson(turningRoute, { lat: 0, lng: 0 }, true, 1);
    expect(fc.features).toHaveLength(0);
  });

  it('não desenha nada enquanto a manobra não está BEM perto (some longe da curva)', () => {
    // ~220 m antes da esquina — além do limite curto de visibilidade.
    const fc = buildManeuverArrowGeojson(turningRoute, { lat: 0, lng: 0 }, true, 0);
    expect(fc.features).toHaveLength(0);
  });

  it('desenha UMA seta (Point) em cima da curva ao chegar bem perto, com glifo do lado e azimute de chegada', () => {
    // ~22 m antes da esquina (lat 0.0018 → manobra em lat 0.002).
    const fc = buildManeuverArrowGeojson(turningRoute, { lat: 0.0018, lng: 0 }, true, 0);
    expect(fc.features).toHaveLength(1);
    const feature = fc.features[0];
    expect(feature.geometry.type).toBe('Point');
    // No ponto exato da manobra.
    expect(feature.geometry.coordinates).toEqual([0, 0.002]);
    // Curva à direita → glifo "↱".
    expect(feature.properties?.glyph).toBe('↱');
    // Chegada vinda do sul (rumo norte) → azimute ~0°.
    expect(feature.properties?.bearing).toBeCloseTo(0, 0);
  });

  it('nada fora da navegação', () => {
    const fc = buildManeuverArrowGeojson(turningRoute, { lat: 0.0018, lng: 0 }, false, 0);
    expect(fc.features).toHaveLength(0);
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
