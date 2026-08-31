import { describe, it, expect } from 'vitest';
import {
  buildRouteGeojson,
  buildNavigationRouteGeojson,
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
  it('começa a linha no ponto PROJETADO sobre a rota (colado na pista), não na posição crua do GPS', () => {
    // GPS ~1 m a leste da rota (que é reta em lng 0): a linha tem que começar
    // em lng 0 (na pista), na mesma latitude — nunca no lng 0.00001 do GPS.
    const feature = buildNavigationRouteGeojson(route, { lat: 0.00205, lng: 0.00001 });
    const [lng, lat] = feature.geometry.coordinates[0];
    expect(lng).toBeCloseTo(0, 6);
    expect(lat).toBeCloseTo(0.00205, 4);
  });

  it('descarta o trecho já percorrido (do ponto mais próximo até o fim)', () => {
    // Perto do 3º ponto (lat 0.002): sobra ele + os 2 seguintes.
    const feature = buildNavigationRouteGeojson(route, { lat: 0.002, lng: 0 });
    expect(feature.geometry.coordinates).toHaveLength(3);
    expect(feature.geometry.coordinates[feature.geometry.coordinates.length - 1]).toEqual([
      0, 0.004,
    ]);
  });

  it('mantém pelo menos 2 pontos mesmo colado no destino', () => {
    const feature = buildNavigationRouteGeojson(route, { lat: 0.004, lng: 0 });
    expect(feature.geometry.coordinates.length).toBeGreaterThanOrEqual(2);
  });

  it('sem posição atual, devolve a rota inteira', () => {
    const feature = buildNavigationRouteGeojson(route, null);
    expect(feature.geometry.coordinates).toHaveLength(route.geometry.length);
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
