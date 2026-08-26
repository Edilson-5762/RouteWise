import { describe, it, expect } from 'vitest';
import { normalize } from './text';

describe('normalize', () => {
  it('remove acentos e converte para minúsculas', () => {
    expect(normalize('Farmácia')).toBe('farmacia');
    expect(normalize('São Paulo')).toBe('sao paulo');
  });

  it('remove espaços nas extremidades', () => {
    expect(normalize('  Brasília  ')).toBe('brasilia');
  });
});
