import { getManeuverIcon } from './maneuvers/getManeuverIcon';
import { formatDistance } from '../utils/format';
import type { RouteStep } from '../types';

interface ManeuverBannerProps {
  step: RouteStep;
  /** Metros que ainda faltam até a manobra; sem isso, cai para o comprimento
   *  total do passo (comportamento antigo, antes do primeiro fix de progresso). */
  distanceToManeuverMeters?: number | null;
}

export function ManeuverBanner({ step, distanceToManeuverMeters }: ManeuverBannerProps) {
  const Icon = getManeuverIcon(step.maneuverType, step.maneuverModifier);
  const distance = distanceToManeuverMeters ?? step.distanceMeters;

  return (
    <div className="flex items-center gap-4 bg-surface-foreground px-4 py-3 text-surface shadow-lg">
      <Icon size={40} aria-hidden="true" />
      <div>
        <p className="text-lg font-semibold">{step.instruction}</p>
        <p className="text-sm opacity-80">{formatDistance(distance)}</p>
      </div>
    </div>
  );
}
