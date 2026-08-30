import { describe, it, expect } from 'vitest';
import {
  haversineDistanceMeters,
  findNearestPointIndex,
  bearingBetween,
  signedBearingDelta,
  polylineLengthMeters,
  projectOntoRoute,
} from './distance';

describe('haversineDistanceMeters', () => {
  it('retorna 0 para pontos idênticos', () => {
    const point = { lat: -23.5505, lng: -46.6333 };
    expect(haversineDistanceMeters(point, point)).toBe(0);
  });

  it('retorna aproximadamente a distância conhecida entre duas cidades', () => {
    const saoPaulo = { lat: -23.5505, lng: -46.6333 };
    const rioDeJaneiro = { lat: -22.9068, lng: -43.1729 };
    const distance = haversineDistanceMeters(saoPaulo, rioDeJaneiro);
    expect(distance).toBeGreaterThan(350000);
    expect(distance).toBeLessThan(365000);
  });
});

describe('findNearestPointIndex', () => {
  it('encontra o índice do ponto mais próximo em uma linha', () => {
    const line = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 1 },
      { lat: 0, lng: 2 },
    ];
    const point = { lat: 0.1, lng: 1.05 };
    expect(findNearestPointIndex(point, line)).toBe(1);
  });
});

describe('bearingBetween', () => {
  it('aponta ~90° (leste) e ~0° (norte)', () => {
    expect(bearingBetween({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(90, 0);
    expect(bearingBetween({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(0, 0);
  });
});

describe('signedBearingDelta', () => {
  it('positivo quando o alvo está à direita', () => {
    expect(signedBearingDelta(90, 180)).toBeCloseTo(90);
  });

  it('negativo quando o alvo está à esquerda', () => {
    expect(signedBearingDelta(90, 0)).toBeCloseTo(-90);
  });

  it('lida com a virada dos 360°', () => {
    expect(signedBearingDelta(350, 10)).toBeCloseTo(20);
    expect(signedBearingDelta(10, 350)).toBeCloseTo(-20);
  });
});

describe('polylineLengthMeters', () => {
  it('soma o comprimento de todos os segmentos', () => {
    const line = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 0.001 },
      { lat: 0, lng: 0.002 },
    ];
    const total = polylineLengthMeters(line);
    const single = haversineDistanceMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 0.001 });
    expect(total).toBeCloseTo(single * 2, 1);
  });
});

describe('projectOntoRoute', () => {
  // Linha reta indo para leste, ~111m entre vértices consecutivos.
  const line = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 0.001 },
    { lat: 0, lng: 0.002 },
    { lat: 0, lng: 0.003 },
  ];

  it('mede a distância PERPENDICULAR ao segmento, não até o vértice mais próximo', () => {
    // No meio de um segmento longo e ~11m ao lado: a distância até o vértice
    // mais próximo seria ~55m, mas a perpendicular é ~11m.
    const projection = projectOntoRoute({ lat: 0.0001, lng: 0.0005 }, line);
    expect(projection.distanceMeters).toBeGreaterThan(9);
    expect(projection.distanceMeters).toBeLessThan(13);
    expect(projection.segmentIndex).toBe(0);
  });

  it('reporta a distância acumulada ao longo da rota até a projeção do ponto', () => {
    const projection = projectOntoRoute({ lat: 0, lng: 0.0015 }, line);
    const half = polylineLengthMeters(line) / 2;
    expect(projection.alongMeters).toBeCloseTo(half, 0);
  });

  it('a janela impede casar com um trecho distante de uma rota que passa perto de si mesma', () => {
    // Rota que volta rente a si mesma: o ponto está colado no trecho de volta
    // (índice ~3), mas dentro da janela inicial (0–1) o mais próximo é o trecho
    // de ida, ~22m à frente.
    const uTurn = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 0.001 },
      { lat: 0.0002, lng: 0.001 },
      { lat: 0.0002, lng: 0 },
    ];
    const point = { lat: 0.0002, lng: 0.0005 };
    const semJanela = projectOntoRoute(point, uTurn);
    expect(semJanela.segmentIndex).toBe(2);

    const comJanela = projectOntoRoute(point, uTurn, { fromIndex: 0, toIndex: 1 });
    expect(comJanela.segmentIndex).toBe(0);
    expect(comJanela.distanceMeters).toBeGreaterThan(15);
  });
});
