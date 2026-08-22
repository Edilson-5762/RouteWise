// src/components/TravelModeToggle.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TravelModeToggle } from './TravelModeToggle';

describe('TravelModeToggle', () => {
  it('destaca o modo atualmente selecionado', () => {
    render(<TravelModeToggle profile="walking" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'A pé' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Carro' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('chama onChange com o novo modo ao clicar', () => {
    const onChange = vi.fn();
    render(<TravelModeToggle profile="driving" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Bicicleta' }));

    expect(onChange).toHaveBeenCalledWith('cycling');
  });
});
