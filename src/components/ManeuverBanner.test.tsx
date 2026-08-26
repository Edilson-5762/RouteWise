import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ManeuverBanner } from './ManeuverBanner';

describe('ManeuverBanner', () => {
  it('mostra a instrução e a distância do passo atual', () => {
    render(
      <ManeuverBanner
        step={{
          instruction: 'Vire à direita na Rua Augusta',
          distanceMeters: 250,
          durationSeconds: 30,
          maneuverLocation: { lat: 0, lng: 0 },
          maneuverType: 'turn',
          maneuverModifier: 'right',
        }}
      />,
    );

    expect(screen.getByText('Vire à direita na Rua Augusta')).toBeInTheDocument();
    expect(screen.getByText('250 m')).toBeInTheDocument();
  });
});
