import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { LaneGuidance } from './LaneGuidance';

describe('LaneGuidance', () => {
  it('renderiza uma marca por faixa', () => {
    const { container } = render(
      <LaneGuidance
        lanes={[
          { active: false, directions: ['left'] },
          { active: true, directions: ['straight', 'right'] },
          { active: false, directions: ['right'] },
        ]}
      />,
    );
    expect(container.querySelectorAll('[data-testid="lane"]')).toHaveLength(3);
  });

  it('faixas ativas e inativas se distinguem por data-active', () => {
    const { container } = render(
      <LaneGuidance
        lanes={[
          { active: true, directions: ['straight'] },
          { active: false, directions: ['left'] },
        ]}
      />,
    );
    const lanes = container.querySelectorAll('[data-testid="lane"]');
    expect(lanes[0].getAttribute('data-active')).toBe('true');
    expect(lanes[1].getAttribute('data-active')).toBe('false');
  });
});
