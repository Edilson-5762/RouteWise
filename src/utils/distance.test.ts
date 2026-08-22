import { describe, it, expect } from 'vitest';
import { haversineDistanceMeters, findNearestPointIndex } from './distance';

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
