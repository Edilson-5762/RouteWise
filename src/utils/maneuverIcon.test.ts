import { describe, it, expect } from 'vitest';
import {
  ArrowUp,
  ArrowUpRight,
  ArrowUpLeft,
  ArrowRight,
  ArrowLeft,
  RotateCw,
  Flag,
} from 'lucide-react';
import { getManeuverIcon } from './maneuverIcon';

describe('getManeuverIcon', () => {
  it('retorna seta reta para continue sem modificador', () => {
    expect(getManeuverIcon('continue', null)).toBe(ArrowUp);
  });

  it('retorna seta de virar à direita para turn/right', () => {
    expect(getManeuverIcon('turn', 'right')).toBe(ArrowRight);
  });

  it('retorna seta de virar à esquerda para turn/left', () => {
    expect(getManeuverIcon('turn', 'left')).toBe(ArrowLeft);
  });

  it('retorna seta diagonal para slight right', () => {
    expect(getManeuverIcon('turn', 'slight right')).toBe(ArrowUpRight);
  });

  it('retorna seta diagonal para slight left', () => {
    expect(getManeuverIcon('turn', 'slight left')).toBe(ArrowUpLeft);
  });

  it('retorna ícone de rotatória para roundabout', () => {
    expect(getManeuverIcon('roundabout', null)).toBe(RotateCw);
  });

  it('retorna ícone de bandeira para arrive', () => {
    expect(getManeuverIcon('arrive', null)).toBe(Flag);
  });

  it('usa seta reta como fallback para combinações desconhecidas', () => {
    expect(getManeuverIcon('unknown-type', 'unknown-modifier')).toBe(ArrowUp);
  });
});
