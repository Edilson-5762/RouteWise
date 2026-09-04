import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { RoundaboutDiagram } from './RoundaboutDiagram';

describe('RoundaboutDiagram', () => {
  it('gira a seta da saída pelo ângulo informado', () => {
    const { container } = render(<RoundaboutDiagram degrees={135} exitNumber={2} />);
    const exit = container.querySelector('[data-testid="roundabout-exit"]');
    expect(exit).not.toBeNull();
    expect(exit?.getAttribute('transform')).toBe('rotate(135 22 22)');
  });

  it('mostra o selo com o número da saída', () => {
    const { getByText } = render(<RoundaboutDiagram degrees={90} exitNumber={3} />);
    expect(getByText('3')).toBeInTheDocument();
  });

  it('sem exitNumber, não há selo', () => {
    const { queryByTestId } = render(<RoundaboutDiagram degrees={90} exitNumber={null} />);
    expect(queryByTestId('roundabout-exit-badge')).toBeNull();
  });

  it('degrees null → sem grupo girado (glifo genérico), selo ainda aparece', () => {
    const { container, getByText } = render(<RoundaboutDiagram degrees={null} exitNumber={2} />);
    expect(container.querySelector('[data-testid="roundabout-exit"]')).toBeNull();
    expect(container.querySelector('[data-testid="roundabout-generic"]')).not.toBeNull();
    expect(getByText('2')).toBeInTheDocument();
  });

  it('aceita size', () => {
    const { container } = render(<RoundaboutDiagram degrees={90} exitNumber={null} size={60} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('60');
  });
});
