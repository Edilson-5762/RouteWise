import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SavedPlacesShortcuts } from './SavedPlacesShortcuts';

describe('SavedPlacesShortcuts', () => {
  it('sempre mostra o atalho de Novo', () => {
    render(<SavedPlacesShortcuts places={[]} onSelect={vi.fn()} onAddNew={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Novo/ })).toBeInTheDocument();
  });

  it('lista os locais salvos e chama onSelect ao clicar', () => {
    const onSelect = vi.fn();
    const place = { id: '1', label: 'Casa', coordinates: { lat: -23.55, lng: -46.63 } };
    render(<SavedPlacesShortcuts places={[place]} onSelect={onSelect} onAddNew={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Casa' }));

    expect(onSelect).toHaveBeenCalledWith(place);
  });

  it('chama onAddNew ao clicar em Novo', () => {
    const onAddNew = vi.fn();
    render(<SavedPlacesShortcuts places={[]} onSelect={vi.fn()} onAddNew={onAddNew} />);

    fireEvent.click(screen.getByRole('button', { name: /Novo/ }));

    expect(onAddNew).toHaveBeenCalled();
  });
});
