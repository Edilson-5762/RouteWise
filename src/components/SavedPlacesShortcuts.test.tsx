import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SavedPlacesShortcuts } from './SavedPlacesShortcuts';

describe('SavedPlacesShortcuts', () => {
  it('não renderiza nada quando não há locais salvos', () => {
    const { container } = render(<SavedPlacesShortcuts places={[]} onSelect={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lista os locais salvos e chama onSelect ao clicar', () => {
    const onSelect = vi.fn();
    const place = { id: '1', label: 'Casa', coordinates: { lat: -23.55, lng: -46.63 } };
    render(<SavedPlacesShortcuts places={[place]} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole('button', { name: 'Casa' }));

    expect(onSelect).toHaveBeenCalledWith(place);
  });
});
