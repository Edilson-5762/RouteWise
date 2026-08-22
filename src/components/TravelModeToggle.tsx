import { Car, Footprints, Bike } from 'lucide-react';
import type { TravelProfile } from '../types';

interface TravelModeToggleProps {
  profile: TravelProfile;
  onChange: (profile: TravelProfile) => void;
}

const MODES: { profile: TravelProfile; label: string; Icon: typeof Car }[] = [
  { profile: 'driving', label: 'Carro', Icon: Car },
  { profile: 'walking', label: 'A pé', Icon: Footprints },
  { profile: 'cycling', label: 'Bicicleta', Icon: Bike },
];

export function TravelModeToggle({ profile, onChange }: TravelModeToggleProps) {
  return (
    <div className="flex gap-2" role="group" aria-label="Modo de transporte">
      {MODES.map(({ profile: modeProfile, label, Icon }) => {
        const isSelected = modeProfile === profile;
        return (
          <button
            key={modeProfile}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onChange(modeProfile)}
            className={`flex flex-1 flex-col items-center gap-1 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
              isSelected
                ? 'bg-primary text-primary-foreground'
                : 'bg-surface text-muted hover:bg-primary/10'
            }`}
          >
            <Icon size={20} aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
