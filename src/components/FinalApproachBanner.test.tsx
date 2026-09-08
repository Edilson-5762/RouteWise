import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FinalApproachBanner } from './FinalApproachBanner';

describe('FinalApproachBanner', () => {
  it('mostra a distância formatada e "até o destino"', () => {
    render(<FinalApproachBanner meters={48} />);
    expect(screen.getByText('48 m')).toBeInTheDocument();
    expect(screen.getByText('até o destino')).toBeInTheDocument();
  });
});
