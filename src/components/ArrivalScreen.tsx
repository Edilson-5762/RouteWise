import { MapPin } from 'lucide-react';
import type { ArrivalSide } from '../types';

interface ArrivalScreenProps {
  placeName: string | null;
  side?: ArrivalSide;
  onDone: () => void;
}

// Tela de chegada estilo Waze: assim que o veículo PARA na região do destino
// (ver navigationReducer — não basta cruzar o fim da linha azul), ocupa a tela
// inteira com um aviso grande e inequívoco. O nome do destino e o lado da rua
// ficam logo abaixo; o botão encerra a navegação.
export function ArrivalScreen({ placeName, side = 'ahead', onDone }: ArrivalScreenProps) {
  const sideText =
    side === 'right'
      ? 'O destino fica à sua direita.'
      : side === 'left'
        ? 'O destino fica à sua esquerda.'
        : null;

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6 bg-surface px-6 text-center text-surface-foreground">
      <span className="flex h-24 w-24 items-center justify-center rounded-full bg-primary/15">
        <MapPin size={52} className="text-primary" aria-hidden="true" />
      </span>

      <h1 className="text-4xl font-extrabold leading-tight sm:text-5xl">
        Você chegou ao seu destino
      </h1>

      {placeName && (
        <p className="max-w-md text-lg font-medium leading-snug text-surface-foreground/80">
          {placeName}
        </p>
      )}

      {sideText && <p className="text-base font-semibold text-primary">{sideText}</p>}

      <button
        type="button"
        onClick={onDone}
        className="mt-4 w-full max-w-xs rounded-xl bg-primary px-8 py-4 text-lg font-semibold text-primary-foreground"
      >
        Concluir
      </button>
    </div>
  );
}
