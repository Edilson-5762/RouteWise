import { PartyPopper } from 'lucide-react';

interface ArrivalScreenProps {
  placeName: string | null;
  onDone: () => void;
}

export function ArrivalScreen({ placeName, onDone }: ArrivalScreenProps) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-surface p-6 text-center text-surface-foreground">
      <PartyPopper size={48} className="text-primary" aria-hidden="true" />
      <h1 className="text-2xl font-bold">Você chegou!</h1>
      {placeName && <p className="text-muted">{placeName}</p>}
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
