import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CurrentRoadPill } from './CurrentRoadPill';

describe('CurrentRoadPill', () => {
  it('mostra o nome da via', () => {
    const { getByText } = render(<CurrentRoadPill name="2ª Avenida Norte" />);
    expect(getByText('2ª Avenida Norte')).toBeInTheDocument();
  });

  it('não renderiza nada quando o nome está vazio', () => {
    const { container } = render(<CurrentRoadPill name="" />);
    expect(container.firstChild).toBeNull();
  });
});
