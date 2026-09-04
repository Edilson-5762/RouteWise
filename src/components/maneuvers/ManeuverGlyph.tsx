export type ManeuverGlyphKind =
  'arrow' | 'fork' | 'merge' | 'ramp' | 'uturn' | 'arrive' | 'roundabout-generic';

interface ManeuverGlyphProps {
  kind: ManeuverGlyphKind;
  /** Graus de rotação horária aplicados ao desenho (0 = apontando p/ cima). */
  degrees?: number;
  size?: number;
  className?: string;
}

// Desenhos esquemáticos simples, em viewBox 24x24, traço em currentColor.
// Cada `path` aponta "para cima" no estado neutro; a rotação é aplicada no
// grupo externo.
const PATHS: Record<ManeuverGlyphKind, JSX.Element> = {
  arrow: (
    <path
      d="M12 21V5M12 5l-6 6M12 5l6 6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  fork: (
    <path
      d="M12 21v-6M12 15c0-4-4-5-5-8M12 15c0-4 4-5 5-8M7 7l0-3M7 7l3 0M17 7l0-3M17 7l-3 0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  merge: (
    <path
      d="M12 21v-7M12 14c0-4 4-6 4-10M16 4l0 3M16 4l-3 1M8 8c1 2 4 3 4 6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  ramp: (
    <path
      d="M8 21V9c0-2 1-4 4-5M12 4l0 4M12 4l-4 1"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  uturn: (
    <path
      d="M8 21V10a4 4 0 0 1 8 0v3M16 13l-2-3M16 13l2-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  arrive: (
    <>
      <path d="M7 21V4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path
        d="M7 5h9l-2 3 2 3H7z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </>
  ),
  'roundabout-generic': (
    <path
      d="M12 21v-6M12 15a4 4 0 1 0-3.5-2M12 9l-2 2M12 9l2 2"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
};

export function ManeuverGlyph({ kind, degrees = 0, size = 40, className }: ManeuverGlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      role="img"
      aria-hidden="true"
    >
      <g
        data-glyph-kind={kind}
        data-glyph-rotation={String(degrees)}
        transform={`rotate(${degrees} 12 12)`}
      >
        {PATHS[kind]}
      </g>
    </svg>
  );
}
