import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RouteSummary } from './RouteSummary';

describe('RouteSummary', () => {
  it('renderiza duração e distância formatadas', () => {
    render(<RouteSummary distanceMeters={4200} durationSeconds={1500} />);
    expect(screen.getByText('25 min')).toBeInTheDocument();
    expect(screen.getByText('4.2 km')).toBeInTheDocument();
  });
});
