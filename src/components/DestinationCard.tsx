import { Bookmark, Share2 } from 'lucide-react';
import { TravelModeToggle } from './TravelModeToggle';
import { formatDistance, formatDuration } from '../utils/format';
import type { TravelProfile } from '../types';

interface DestinationCardProps {
  placeName: string;
  distanceMeters: number;
  durationSeconds: number;
  travelProfile: TravelProfile;
  onTravelProfileChange: (profile: TravelProfile) => void;
  onSave: () => void;
  onShare: () => void;
  onStartNavigation: () => void;
  onCancel: () => void;
  isSaved: boolean;
}

export function DestinationCard({
  placeName,
  distanceMeters,
  durationSeconds,
  travelProfile,
  onTravelProfileChange,
  onSave,
  onShare,
  onStartNavigation,
  onCancel,
  isSaved,
}: DestinationCardProps) {
  return (
    <div className="space-y-4 rounded-2xl bg-surface p-4 text-surface-foreground shadow-lg">
      <div>
        <h2 className="text-lg font-bold">{placeName}</h2>
        <p className="text-sm text-muted">
          <span>{formatDistance(distanceMeters)}</span>
          <span className="mx-1">·</span>
          <span>{formatDuration(durationSeconds)}</span>
        </p>
      </div>

      <TravelModeToggle profile={travelProfile} onChange={onTravelProfileChange} />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onSave}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary/10 py-2 text-sm font-medium text-primary"
        >
          <Bookmark size={16} aria-hidden="true" />
          {isSaved ? 'Salvo' : 'Salvar'}
        </button>
        <button
          type="button"
          onClick={onShare}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary/10 py-2 text-sm font-medium text-primary"
        >
          <Share2 size={16} aria-hidden="true" />
          Compartilhar
        </button>
      </div>

      <button
        type="button"
        onClick={onStartNavigation}
        className="w-full rounded-xl bg-primary py-3 font-semibold text-primary-foreground"
      >
        Iniciar navegação
      </button>

      <button
        type="button"
        onClick={onCancel}
        className="w-full rounded-xl py-2 text-sm font-medium text-danger hover:bg-danger/10"
      >
        Cancelar trajeto
      </button>
    </div>
  );
}
