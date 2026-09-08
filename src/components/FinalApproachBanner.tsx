import { MapPin } from 'lucide-react';
import { formatDistance } from '../utils/format';

interface FinalApproachBannerProps {
  meters: number;
}

// Substitui o painel de manobra no "trecho final": a rota (via) já acabou e o
// veículo segue pelo tracejado até o pino (rampa/estacionamento). Mesma moldura
// do ManeuverBanner para não "pular" visualmente na troca.
export function FinalApproachBanner({ meters }: FinalApproachBannerProps) {
  return (
    <div className="mx-2 overflow-hidden rounded-b-3xl bg-maneuver text-maneuver-foreground shadow-xl">
      <div className="flex items-center gap-5 px-5 py-7">
        <MapPin size={64} className="shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-4xl font-bold leading-tight">{formatDistance(meters)}</p>
          <p className="text-2xl font-semibold leading-snug">até o destino</p>
        </div>
      </div>
    </div>
  );
}
