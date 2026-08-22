import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchBar } from './SearchBar';
import * as mapboxClient from '../services/mapboxClient';

describe('SearchBar', () => {
  it('mostra sugestões retornadas pela busca e chama onSelect', async () => {
    vi.spyOn(mapboxClient, 'searchPlaces').mockResolvedValue([
      {
        id: '1',
        placeName: 'Av. Paulista, São Paulo',
        coordinates: { lat: -23.5613, lng: -46.6564 },
      },
    ]);
    const onSelect = vi.fn();

    render(<SearchBar onSelect={onSelect} />);

    fireEvent.change(screen.getByLabelText('Buscar destino'), {
      target: { value: 'Paulista' },
    });

    const option = await screen.findByText('Av. Paulista, São Paulo', {}, { timeout: 1000 });
    fireEvent.click(option);

    expect(onSelect).toHaveBeenCalledWith({
      id: '1',
      placeName: 'Av. Paulista, São Paulo',
      coordinates: { lat: -23.5613, lng: -46.6564 },
    });
  });

  it('fecha a lista de sugestões após selecionar uma opção', async () => {
    vi.spyOn(mapboxClient, 'searchPlaces').mockResolvedValue([
      {
        id: '1',
        placeName: 'Av. Paulista, São Paulo',
        coordinates: { lat: -23.5613, lng: -46.6564 },
      },
    ]);
    const onSelect = vi.fn();

    render(<SearchBar onSelect={onSelect} />);

    fireEvent.change(screen.getByLabelText('Buscar destino'), {
      target: { value: 'Paulista' },
    });

    const option = await screen.findByText('Av. Paulista, São Paulo', {}, { timeout: 1000 });
    fireEvent.click(option);

    expect(screen.queryByText('Av. Paulista, São Paulo')).not.toBeInTheDocument();
  });
});
