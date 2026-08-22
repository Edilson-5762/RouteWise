import { formatDistance, formatDuration } from '../utils/format';

interface RouteSummaryProps {
  distanceMeters: number;
  durationSeconds: number;
}

export function RouteSummary({ distanceMeters, durationSeconds }: RouteSummaryProps) {
  return (
    <div className="flex items-center gap-4 rounded-lg bg-blue-600 px-4 py-3 text-white">
      <span className="text-lg font-bold">{formatDuration(durationSeconds)}</span>
      <span className="text-sm text-blue-100">{formatDistance(distanceMeters)}</span>
    </div>
  );
}
