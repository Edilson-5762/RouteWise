interface RoundaboutDiagramProps {
  // Ângulo horário (graus) da entrada até a saída. null → desenho genérico.
  // CONVENÇÃO A CONFIRMAR contra resposta real da API (ver plano, Task 4).
  degrees: number | null;
  exitNumber: number | null;
  size?: number;
  className?: string;
}

const CX = 22;
const CY = 22;

export function RoundaboutDiagram({
  degrees,
  exitNumber,
  size = 44,
  className,
}: RoundaboutDiagramProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 44 44"
      className={className}
      role="img"
      aria-hidden="true"
    >
      {/* Anel da rotatória */}
      <circle
        cx={CX}
        cy={CY}
        r={11}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        opacity="0.85"
      />
      {/* Entrada: stub a partir do fundo até o anel */}
      <path
        d={`M${CX} 44 L${CX} ${CY + 11}`}
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
      />

      {degrees == null ? (
        // Genérico: seta circular curta saindo pra cima.
        <g data-testid="roundabout-generic">
          <path
            d={`M${CX} ${CY - 11} L${CX} 3 M${CX} 3 l-3 4 M${CX} 3 l3 4`}
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      ) : (
        // Saída escolhida: seta saindo do anel pra fora, girada pelo ângulo.
        <g data-testid="roundabout-exit" transform={`rotate(${degrees} ${CX} ${CY})`}>
          <path
            d={`M${CX} ${CY - 11} L${CX} 4 M${CX} 4 l-3.5 4 M${CX} 4 l3.5 4`}
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      )}

      {/* Tracinhos decorativos das outras saídas (não são dados reais) */}
      <path
        d={`M${CX + 11} ${CY} l4 0`}
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.35"
        strokeLinecap="round"
      />
      <path
        d={`M${CX - 11} ${CY} l-4 0`}
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.35"
        strokeLinecap="round"
      />

      {exitNumber != null && (
        <g data-testid="roundabout-exit-badge">
          <circle cx={38} cy={7} r={6} fill="currentColor" />
          <text
            x={38}
            y={7}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="9"
            fontWeight="700"
            fill="var(--color-maneuver, #0c3b3f)"
          >
            {exitNumber}
          </text>
        </g>
      )}
    </svg>
  );
}
