import type { LucideIcon } from 'lucide-react';
import {
  ArrowUp,
  ArrowUpRight,
  ArrowUpLeft,
  ArrowRight,
  ArrowLeft,
  RotateCw,
  Flag,
  CornerUpRight,
  CornerUpLeft,
} from 'lucide-react';

const MODIFIER_ICONS: Record<string, LucideIcon> = {
  straight: ArrowUp,
  right: ArrowRight,
  left: ArrowLeft,
  'slight right': ArrowUpRight,
  'slight left': ArrowUpLeft,
  'sharp right': CornerUpRight,
  'sharp left': CornerUpLeft,
  uturn: RotateCw,
};

export function getManeuverIcon(maneuverType: string, maneuverModifier: string | null): LucideIcon {
  if (maneuverType === 'arrive') {
    return Flag;
  }
  if (maneuverType === 'roundabout' || maneuverType === 'rotary') {
    return RotateCw;
  }
  if (maneuverModifier && MODIFIER_ICONS[maneuverModifier]) {
    return MODIFIER_ICONS[maneuverModifier];
  }
  return ArrowUp;
}
