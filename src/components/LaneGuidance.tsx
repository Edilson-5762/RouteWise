import type { ManeuverLane } from '../types';
import { getManeuverIcon } from './maneuvers/getManeuverIcon';

interface LaneGuidanceProps {
  lanes: ManeuverLane[];
}

// Mapeia a direção de uma faixa para um ícone de seta reaproveitando a
// tabela de manobras (turn + modificador).
function laneIcon(direction: string) {
  return getManeuverIcon('turn', direction === 'straight' ? 'straight' : direction);
}

export function LaneGuidance({ lanes }: LaneGuidanceProps) {
  return (
    <div className="flex items-center justify-center gap-3 bg-black/25 px-4 py-1.5">
      {lanes.map((lane, laneIndex) => (
        <div
          key={laneIndex}
          data-testid="lane"
          data-active={String(lane.active)}
          className={lane.active ? 'flex opacity-100' : 'flex opacity-30'}
        >
          {lane.directions.map((direction, dirIndex) => {
            const Icon = laneIcon(direction);
            return <Icon key={dirIndex} size={18} />;
          })}
        </div>
      ))}
    </div>
  );
}
