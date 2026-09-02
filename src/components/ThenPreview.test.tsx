import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ThenPreview } from './ThenPreview';

describe('ThenPreview', () => {
  it('mostra o rótulo "Depois", o texto e um ícone', () => {
    const { getByText, container } = render(
      <ThenPreview then={{ maneuverType: 'turn', maneuverModifier: 'left', text: 'Rua das Flores' }} />,
    );
    expect(getByText('Depois')).toBeInTheDocument();
    expect(getByText('Rua das Flores')).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
