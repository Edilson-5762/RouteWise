import { PartyPopper } from 'lucide-react';
import type { ArrivalSide } from '../types';

interface ArrivalScreenProps {
  placeName: string | null;
  side?: ArrivalSide;
  onDone: () => void;
}

export function ArrivalScreen({ placeName, side = 'ahead', onDone }: ArrivalScreenProps) {
  const sideText =
    side === 'right'
      ? 'Seu destino fica à direita.'
      : side === 'left'
        ? 'Seu destino fica à esquerda.'
        : null;

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-surface p-6 text-center text-surface-foreground">
      <PartyPopper size={48} className="text-primary" aria-hidden="true" />
      <h1 className="text-2xl font-bold">Você chegou!</h1>
      {placeName && <p className="text-muted">{placeName}</p>}
      {sideText && <p className="text-sm font-medium text-primary">{sideText}</p>}
      <button
        type="button"
        onClick={onDone}
        className="mt-4 rounded-xl bg-primary px-8 py-3 font-semibold text-primary-foreground"
      >
        Concluir
      </button>
    </div>
  );
}
