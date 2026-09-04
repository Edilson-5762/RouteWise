import { describe, expect, it } from 'vitest';
import { isNight } from './sunPosition';
import type { Coordinates } from '../types';

const BRASILIA: Coordinates = { lat: -15.7939, lng: -47.8828 };

describe('isNight', () => {
  it('é dia ao meio-dia local em Brasília', () => {
    // 2026-06-15 12:00 em Brasília (UTC-3) = 15:00 UTC.
    const noonInBrasilia = new Date('2026-06-15T15:00:00Z');
    expect(isNight(noonInBrasilia, BRASILIA)).toBe(false);
  });

  it('é noite à meia-noite local em Brasília', () => {
    // 2026-06-15 00:00 em Brasília (UTC-3) = 2026-06-15T03:00:00Z.
    const midnightInBrasilia = new Date('2026-06-15T03:00:00Z');
    expect(isNight(midnightInBrasilia, BRASILIA)).toBe(true);
  });

  it('no mesmo instante, é noite no lado oposto do globo de onde é meio-dia', () => {
    const instant = new Date('2026-06-15T15:00:00Z'); // meio-dia local em Brasília
    // Ponto antípoda de Brasília: latitude invertida, longitude +180°.
    const antipode: Coordinates = { lat: 15.7939, lng: 132.1172 };
    expect(isNight(instant, BRASILIA)).toBe(false);
    expect(isNight(instant, antipode)).toBe(true);
  });
});
