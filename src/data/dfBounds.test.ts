import { describe, it, expect } from 'vitest';
import { DF_BOUNDING_BOX, DF_CENTER, isWithinDf } from './dfBounds';

describe('DF_BOUNDING_BOX', () => {
  it('tem sul < norte e oeste < leste', () => {
    expect(DF_BOUNDING_BOX.south).toBeLessThan(DF_BOUNDING_BOX.north);
    expect(DF_BOUNDING_BOX.west).toBeLessThan(DF_BOUNDING_BOX.east);
  });

  it('usa os mesmos limites de scripts/lib/unidadesSaude.mjs', () => {
    expect(DF_BOUNDING_BOX).toEqual({
      south: -16.1,
      west: -48.35,
      north: -15.4,
      east: -47.3,
    });
  });
});

describe('isWithinDf', () => {
  it('aceita pontos conhecidos do DF', () => {
    expect(isWithinDf(DF_CENTER)).toBe(true);
    expect(isWithinDf({ lat: -15.8333, lng: -47.9733 })).toBe(true); // Guará II
    expect(isWithinDf({ lat: -15.8155, lng: -48.109 })).toBe(true); // Ceilândia
  });

  it('rejeita um ponto fora do DF', () => {
    expect(isWithinDf({ lat: -16.6869, lng: -49.2648 })).toBe(false); // Goiânia
  });
});
