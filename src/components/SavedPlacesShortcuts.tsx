import { Home, Briefcase, Plus, MapPin } from 'lucide-react';
import type { SavedPlace } from '../types';

interface SavedPlacesShortcutsProps {
  places: SavedPlace[];
  onSelect: (place: SavedPlace) => void;
  onAddNew: () => void;
}

function iconForLabel(label: string) {
  if (label === 'Casa') return Home;
  if (label === 'Trabalho') return Briefcase;
  return MapPin;
}

export function SavedPlacesShortcuts({ places, onSelect, onAddNew }: SavedPlacesShortcutsProps) {
  return (
    <div className="flex gap-2 overflow-x-auto">
      {places.map((place) => {
        const Icon = iconForLabel(place.label);
        return (
          <button
            key={place.id}
            type="button"
            onClick={() => onSelect(place)}
            className="flex shrink-0 items-center gap-2 rounded-xl bg-surface px-4 py-2 text-sm font-medium text-surface-foreground shadow"
          >
            <Icon size={16} aria-hidden="true" />
            {place.label}
          </button>
        );
      })}
      <button
        type="button"
        onClick={onAddNew}
        className="flex shrink-0 items-center gap-2 rounded-xl bg-surface px-4 py-2 text-sm font-medium text-primary shadow"
      >
        <Plus size={16} aria-hidden="true" />
        Novo
      </button>
    </div>
  );
}
