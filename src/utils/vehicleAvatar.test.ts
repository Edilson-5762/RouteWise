import { describe, it, expect } from 'vitest';
import { getPuckIconMarkup } from './vehicleAvatar';

describe('getPuckIconMarkup', () => {
  it('retorna um avatar SVG ilustrado próprio para cada modo de transporte (não o glifo genérico do Lucide)', () => {
    expect(getPuckIconMarkup('driving')).toContain('data-vehicle-avatar="car"');
    expect(getPuckIconMarkup('motorcycling')).toContain('data-vehicle-avatar="motorcycle"');
    expect(getPuckIconMarkup('cycling')).toContain('data-vehicle-avatar="bicycle"');
    expect(getPuckIconMarkup('walking')).toContain('data-vehicle-avatar="pedestrian"');
  });

  it('não usa mais os glifos genéricos do Lucide para nenhum modo', () => {
    (['driving', 'motorcycling', 'cycling', 'walking'] as const).forEach((profile) => {
      expect(getPuckIconMarkup(profile)).not.toContain('lucide');
    });
  });
});
