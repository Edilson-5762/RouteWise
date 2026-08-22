import { describe, it, expect } from 'vitest';
import { formatDistance, formatDuration } from './format';

describe('formatDistance', () => {
  it('formata distâncias abaixo de 1km em metros', () => {
    expect(formatDistance(850)).toBe('850 m');
  });

  it('formata distâncias de 1km ou mais em quilômetros com uma casa decimal', () => {
    expect(formatDistance(4230)).toBe('4.2 km');
  });
});

describe('formatDuration', () => {
  it('formata durações abaixo de 60 minutos em minutos', () => {
    expect(formatDuration(1500)).toBe('25 min');
  });

  it('formata durações de uma hora ou mais em horas e minutos', () => {
    expect(formatDuration(5400)).toBe('1h 30min');
  });
});
