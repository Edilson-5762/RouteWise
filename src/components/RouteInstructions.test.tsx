import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RouteInstructions } from './RouteInstructions';

const steps = [
  {
    instruction: 'Siga em frente',
    distanceMeters: 500,
    durationSeconds: 60,
    maneuverLocation: { lat: 0, lng: 0 },
  },
  {
    instruction: 'Vire à direita',
    distanceMeters: 200,
    durationSeconds: 30,
    maneuverLocation: { lat: 0, lng: 1 },
  },
];

describe('RouteInstructions', () => {
  it('renderiza cada passo', () => {
    render(<RouteInstructions steps={steps} currentStepIndex={0} />);
    expect(screen.getAllByTestId('route-step')).toHaveLength(2);
  });

  it('destaca o passo atual', () => {
    render(<RouteInstructions steps={steps} currentStepIndex={1} />);
    expect(screen.getByText('Vire à direita').closest('li')).toHaveAttribute(
      'aria-current',
      'step',
    );
  });
});
