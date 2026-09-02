import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Speedometer } from './Speedometer';

describe('Speedometer', () => {
  it('mostra a velocidade em km/h arredondada', () => {
    const { getByText } = render(<Speedometer speedMetersPerSecond={10} />);
    expect(getByText('36')).toBeInTheDocument();
    expect(getByText('km/h')).toBeInTheDocument();
  });

  it('mostra 0 quando não há leitura (estilo Waze)', () => {
    const { getByText } = render(<Speedometer speedMetersPerSecond={null} />);
    expect(getByText('0')).toBeInTheDocument();
  });
});
