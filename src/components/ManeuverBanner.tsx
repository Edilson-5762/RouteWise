import { formatDistance } from '../utils/format';
import type { GuidanceView } from '../features/navigation/selectGuidance';
import { getManeuverIcon, ROUNDABOUT_MANEUVER_TYPES } from './maneuvers/getManeuverIcon';
import { RoundaboutDiagram } from './maneuvers/RoundaboutDiagram';
import { LaneGuidance } from './LaneGuidance';
import { ThenPreview } from './ThenPreview';

interface ManeuverBannerProps {
  guidance: GuidanceView | null;
}

export function ManeuverBanner({ guidance }: ManeuverBannerProps) {
  if (!guidance) {
    return null;
  }

  const isRoundabout = ROUNDABOUT_MANEUVER_TYPES.has(guidance.maneuverType);
  const Icon = getManeuverIcon(guidance.maneuverType, guidance.maneuverModifier);

  return (
    <div className="mx-2 overflow-hidden rounded-b-2xl bg-maneuver text-maneuver-foreground shadow-xl">
      <div className="flex items-center gap-4 px-4 py-3">
        <div className="shrink-0">
          {isRoundabout ? (
            <RoundaboutDiagram
              degrees={guidance.roundaboutDegrees}
              exitNumber={guidance.roundaboutExit}
              size={48}
            />
          ) : (
            <Icon size={44} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-2xl font-bold leading-tight">
            {formatDistance(guidance.distanceMeters ?? 0)}
          </p>
          <p className="line-clamp-2 text-lg font-semibold leading-snug">{guidance.primaryText}</p>
          {guidance.secondaryText && (
            <p className="truncate text-sm opacity-70">{guidance.secondaryText}</p>
          )}
        </div>
      </div>

      {guidance.lanes.length > 0 && <LaneGuidance lanes={guidance.lanes} />}

      {guidance.then && (
        <>
          <div className="mx-4 border-t border-white/15" />
          <ThenPreview then={guidance.then} />
        </>
      )}
    </div>
  );
}
