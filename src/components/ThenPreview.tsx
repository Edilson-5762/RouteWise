import type { ThenView } from '../features/navigation/selectGuidance';
import { getManeuverIcon } from './maneuvers/getManeuverIcon';

interface ThenPreviewProps {
  then: ThenView;
}

export function ThenPreview({ then }: ThenPreviewProps) {
  const Icon = getManeuverIcon(then.maneuverType, then.maneuverModifier);
  return (
    <div className="flex items-center gap-2 px-4 py-1.5 text-sm opacity-80">
      <span className="font-semibold uppercase tracking-wide">Depois</span>
      <Icon size={18} />
      <span className="truncate">{then.text}</span>
    </div>
  );
}
