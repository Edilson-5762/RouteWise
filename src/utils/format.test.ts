import { describe, it, expect } from 'vitest';
import { formatDistance, formatDuration, formatSpeedKmh } from './format';

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

describe('formatSpeedKmh', () => {
  it('converte m/s para km/h arredondado', () => {
    expect(formatSpeedKmh(5.5)).toBe('20 km/h');
  });

  it('mostra 0 km/h quando a velocidade ainda não foi reportada pelo GPS (parado/sem fix)', () => {
    expect(formatSpeedKmh(null)).toBe('0 km/h');
  });

  it('mostra 0 km/h quando o veículo está parado', () => {
    expect(formatSpeedKmh(0)).toBe('0 km/h');
  });
});
