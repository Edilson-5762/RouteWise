import { MapPin, Send } from 'lucide-react';
import type { ArrivalSide, Coordinates } from '../types';

interface ArrivalScreenProps {
  placeName: string | null;
  side?: ArrivalSide;
  /** Coordenada do pino — habilita o botão "Enviar" (compartilhar localização). */
  destination?: Coordinates | null;
  onDone: () => void;
}

// Link de mapa que qualquer app (Google Maps, Waze, navegador) abre no ponto.
function mapsUrlFor(destination: Coordinates): string {
  return `https://www.google.com/maps/search/?api=1&query=${destination.lat},${destination.lng}`;
}

// Compartilha o destino: Web Share API quando existe (celular), senão copia o
// link para a área de transferência. Silencioso se o usuário cancelar ou se
// nenhum dos dois estiver disponível — é um atalho, não um fluxo crítico.
async function shareDestination(label: string, destination: Coordinates): Promise<void> {
  const url = mapsUrlFor(destination);
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  if (nav?.share) {
    try {
      await nav.share({ title: label, text: label, url });
    } catch {
      // usuário cancelou o menu de compartilhamento — sem problema
    }
    return;
  }
  if (nav?.clipboard?.writeText) {
    try {
      await nav.clipboard.writeText(`${label} — ${url}`);
    } catch {
      // sem permissão de clipboard — nada a fazer
    }
  }
}

// Cartão de chegada estilo Waze: assim que o veículo PARA na região do destino
// (ver navigationReducer — não basta cruzar o fim da linha azul), aparece
// ancorado no rodapé, SOBRE o mapa (a linha da rota já foi limpa). Mostra o
// nome do destino e o lado da rua, um botão para compartilhar a localização e
// outro para encerrar.
export function ArrivalScreen({
  placeName,
  side = 'ahead',
  destination,
  onDone,
}: ArrivalScreenProps) {
  const sideText =
    side === 'right'
      ? 'O destino fica à sua direita.'
      : side === 'left'
        ? 'O destino fica à sua esquerda.'
        : null;

  return (
    <div className="mx-auto w-full max-w-md rounded-t-3xl bg-surface px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-5 text-surface-foreground shadow-[0_-8px_30px_rgba(0,0,0,0.25)]">
      <div className="flex items-start gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/15">
          <MapPin size={30} className="text-primary" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-extrabold leading-tight">Você chegou ao seu destino</h1>
          {placeName && (
            <p className="mt-1 truncate text-sm font-medium text-surface-foreground/75">
              {placeName}
            </p>
          )}
          {sideText && <p className="mt-1 text-sm font-semibold text-primary">{sideText}</p>}
        </div>
      </div>

      <div className="mt-5 flex gap-3">
        {destination && (
          <button
            type="button"
            onClick={() => {
              void shareDestination(placeName ?? 'Destino', destination);
            }}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary/10 px-5 py-3.5 text-base font-semibold text-primary"
          >
            <Send size={18} aria-hidden="true" />
            Enviar
          </button>
        )}
        <button
          type="button"
          onClick={onDone}
          className="flex-1 rounded-xl bg-primary px-5 py-3.5 text-base font-semibold text-primary-foreground"
        >
          Concluir
        </button>
      </div>
    </div>
  );
}
