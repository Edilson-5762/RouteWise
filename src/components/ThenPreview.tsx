import type { ThenView } from '../features/navigation/selectGuidance';
import { getManeuverIcon } from './maneuvers/getManeuverIcon';

interface ThenPreviewProps {
  then: ThenView;
}

// Segunda manobra do percurso, quando vem logo colada na primeira. Não é um
// rodapé apagado: é o próximo passo, mostrado por inteiro — gancho "↳" ligando
// ao passo de cima, a seta no sentido REAL da curva (mesma geometria da seta
// grande) e, quando dá, a frase do sentido ("à esquerda", "retorno"…) para o
// motorista ler o que vem, não só decifrar o desenho.
export function ThenPreview({ then }: ThenPreviewProps) {
  const Icon = getManeuverIcon(then.maneuverType, then.maneuverModifier, then.geometryTurnDegrees);
  return (
    <div className="flex items-start gap-3 px-5 py-3">
      <span aria-hidden className="mt-1 text-xl leading-none opacity-45">
        ↳
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 leading-tight">
          <span className="text-sm font-semibold opacity-60">Depois</span>
          <Icon size={26} />
          {then.turnLabel && <span className="text-lg font-semibold">{then.turnLabel}</span>}
        </p>
        <p className="truncate text-base opacity-80">{then.text}</p>
      </div>
    </div>
  );
}
