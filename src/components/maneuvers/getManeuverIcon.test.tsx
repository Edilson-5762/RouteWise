import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { getManeuverIcon } from './getManeuverIcon';

function rotationOf(type: string, modifier: string | null): string | null {
  const Icon = getManeuverIcon(type, modifier);
  const { container } = render(<Icon />);
  const rotated = container.querySelector('[data-glyph-rotation]');
  return rotated?.getAttribute('data-glyph-rotation') ?? null;
}

function kindOf(type: string, modifier: string | null): string | null {
  const Icon = getManeuverIcon(type, modifier);
  const { container } = render(<Icon />);
  return container.querySelector('[data-glyph-kind]')?.getAttribute('data-glyph-kind') ?? null;
}

describe('getManeuverIcon', () => {
  it('turn/right → glifo arrow girado 90°', () => {
    expect(kindOf('turn', 'right')).toBe('arrow');
    expect(rotationOf('turn', 'right')).toBe('90');
  });

  it('turn/left → arrow girado -90°', () => {
    expect(rotationOf('turn', 'left')).toBe('-90');
  });

  it('turn/slight right → arrow girado 45°; sharp right → 135°', () => {
    expect(rotationOf('turn', 'slight right')).toBe('45');
    expect(rotationOf('turn', 'sharp right')).toBe('135');
  });

  it('continue / depart / null → arrow reto (0°)', () => {
    expect(kindOf('continue', null)).toBe('arrow');
    expect(rotationOf('continue', null)).toBe('0');
    expect(rotationOf('depart', 'straight')).toBe('0');
  });

  it('uturn → glifo uturn', () => {
    expect(kindOf('turn', 'uturn')).toBe('uturn');
  });

  it('fork/right e off ramp/right → glifos próprios', () => {
    expect(kindOf('fork', 'right')).toBe('fork');
    expect(kindOf('off ramp', 'slight right')).toBe('ramp');
  });

  it('merge/left → glifo merge', () => {
    expect(kindOf('merge', 'left')).toBe('merge');
  });

  it('roundabout / rotary → glifo roundabout-generic', () => {
    expect(kindOf('roundabout', null)).toBe('roundabout-generic');
    expect(kindOf('rotary', null)).toBe('roundabout-generic');
  });

  it('arrive → glifo arrive', () => {
    expect(kindOf('arrive', null)).toBe('arrive');
  });

  it('combinação desconhecida → arrow reto', () => {
    expect(kindOf('tipo-x', 'mod-y')).toBe('arrow');
    expect(rotationOf('tipo-x', 'mod-y')).toBe('0');
  });

  it('o componente aceita size e repassa para o svg', () => {
    const Icon = getManeuverIcon('turn', 'right');
    const { container } = render(<Icon size={48} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('48');
    expect(svg?.getAttribute('height')).toBe('48');
  });
});
