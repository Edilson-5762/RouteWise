import { getManeuverIcon } from '../utils/maneuverIcon';
import { formatDistance } from '../utils/format';
import type { RouteStep } from '../types';

interface ManeuverBannerProps {
  step: RouteStep;
}

export function ManeuverBanner({ step }: ManeuverBannerProps) {
  const Icon = getManeuverIcon(step.maneuverType, step.maneuverModifier);

  return (
    <div className="flex items-center gap-4 bg-surface-foreground px-4 py-3 text-surface shadow-lg">
      <Icon size={40} aria-hidden="true" />
      <div>
        <p className="text-lg font-semibold">{step.instruction}</p>
        <p className="text-sm opacity-80">{formatDistance(step.distanceMeters)}</p>
      </div>
    </div>
  );
}
