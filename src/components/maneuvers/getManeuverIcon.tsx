import { ManeuverGlyph, type ManeuverGlyphKind } from './ManeuverGlyph';

export interface ManeuverIconProps {
  size?: number;
  className?: string;
}

// Tipos de manobra que recebem o desenho da rotatória em vez de um glifo de seta.
export const ROUNDABOUT_MANEUVER_TYPES = new Set(['roundabout', 'rotary', 'roundabout turn']);

// Rotação horária, em graus, por modificador (0 = seguir reto).
const MODIFIER_DEGREES: Record<string, number> = {
  straight: 0,
  'slight right': 45,
  right: 90,
  'sharp right': 135,
  uturn: 180,
  'sharp left': -135,
  left: -90,
  'slight left': -45,
};

function degreesFor(modifier: string | null): number {
  if (modifier && modifier in MODIFIER_DEGREES) {
    return MODIFIER_DEGREES[modifier];
  }
  return 0;
}

function resolve(
  maneuverType: string,
  maneuverModifier: string | null,
): { kind: ManeuverGlyphKind; degrees: number } {
  if (maneuverType === 'arrive') {
    return { kind: 'arrive', degrees: 0 };
  }
  if (ROUNDABOUT_MANEUVER_TYPES.has(maneuverType)) {
    return { kind: 'roundabout-generic', degrees: 0 };
  }
  if (maneuverModifier === 'uturn' || maneuverType === 'uturn') {
    return { kind: 'uturn', degrees: 0 };
  }
  if (maneuverType === 'fork') {
    return { kind: 'fork', degrees: degreesFor(maneuverModifier) };
  }
  if (maneuverType === 'merge') {
    return { kind: 'merge', degrees: degreesFor(maneuverModifier) };
  }
  if (maneuverType === 'on ramp' || maneuverType === 'off ramp') {
    return { kind: 'ramp', degrees: degreesFor(maneuverModifier) };
  }
  return { kind: 'arrow', degrees: degreesFor(maneuverModifier) };
}

// eslint-disable-next-line react-refresh/only-export-components -- o módulo também exporta ROUNDABOUT_MANEUVER_TYPES de propósito
export function getManeuverIcon(
  maneuverType: string,
  maneuverModifier: string | null,
): (props: ManeuverIconProps) => JSX.Element {
  const { kind, degrees } = resolve(maneuverType, maneuverModifier);
  return function ManeuverIcon({ size, className }: ManeuverIconProps) {
    return <ManeuverGlyph kind={kind} degrees={degrees} size={size} className={className} />;
  };
}
