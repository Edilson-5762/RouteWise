import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ManeuverBanner } from './ManeuverBanner';
import type { GuidanceView } from '../features/navigation/selectGuidance';

function guidance(overrides: Partial<GuidanceView> = {}): GuidanceView {
  return {
    maneuverType: 'turn',
    maneuverModifier: 'right',
    geometryTurnDegrees: null,
    turnLabel: null,
    roundaboutDegrees: null,
    roundaboutExit: null,
    distanceMeters: 250,
    primaryText: 'Qn 401/402 Conjunto L',
    secondaryText: '1ª Avenida Norte',
    lanes: [],
    then: null,
    currentRoadName: '2ª Avenida Norte',
    ...overrides,
  };
}

describe('ManeuverBanner', () => {
  it('mostra a distância e as duas linhas de texto', () => {
    render(<ManeuverBanner guidance={guidance()} />);
    expect(screen.getByText('250 m')).toBeInTheDocument();
    expect(screen.getByText('Qn 401/402 Conjunto L')).toBeInTheDocument();
    expect(screen.getByText('1ª Avenida Norte')).toBeInTheDocument();
  });

  it('usa o RoundaboutDiagram quando a manobra é rotatória', () => {
    const { container } = render(
      <ManeuverBanner
        guidance={guidance({
          maneuverType: 'roundabout',
          roundaboutDegrees: 135,
          roundaboutExit: 2,
        })}
      />,
    );
    expect(container.querySelector('[data-testid="roundabout-exit"]')).not.toBeNull();
  });

  it('mostra a fileira de faixas só quando lanes não está vazio', () => {
    const { rerender, container } = render(<ManeuverBanner guidance={guidance()} />);
    expect(container.querySelector('[data-testid="lane"]')).toBeNull();
    rerender(
      <ManeuverBanner
        guidance={guidance({ lanes: [{ active: true, directions: ['straight'] }] })}
      />,
    );
    expect(container.querySelector('[data-testid="lane"]')).not.toBeNull();
  });

  it('mostra a linha "Depois" só quando then existe', () => {
    const { rerender, queryByText } = render(<ManeuverBanner guidance={guidance()} />);
    expect(queryByText('Depois')).toBeNull();
    rerender(
      <ManeuverBanner
        guidance={guidance({
          then: {
            maneuverType: 'turn',
            maneuverModifier: 'left',
            geometryTurnDegrees: null,
            turnLabel: null,
            text: 'Rua X',
          },
        })}
      />,
    );
    expect(queryByText('Depois')).toBeInTheDocument();
  });

  it('gira a seta pelo ângulo da geometria, não pelo texto do provedor', () => {
    // Provedor rotulou "left", mas a via vira 95° à direita: a seta segue a via.
    const { container } = render(
      <ManeuverBanner
        guidance={guidance({ maneuverModifier: 'left', geometryTurnDegrees: 95 })}
      />,
    );
    expect(container.querySelector('[data-glyph-rotation]')?.getAttribute('data-glyph-rotation')).toBe(
      '95',
    );
  });

  it('mostra a frase do sentido ao lado da distância quando há turnLabel', () => {
    render(<ManeuverBanner guidance={guidance({ turnLabel: 'à esquerda' })} />);
    expect(screen.getByText('à esquerda')).toBeInTheDocument();
  });

  it('não renderiza nada quando guidance é null', () => {
    const { container } = render(<ManeuverBanner guidance={null} />);
    expect(container.firstChild).toBeNull();
  });
});
