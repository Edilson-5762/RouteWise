import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SearchBar } from './SearchBar';
import * as mapboxClient from '../services/mapboxClient';

describe('SearchBar', () => {
  it('mostra sugestões retornadas pela busca e chama onSelect com as coordenadas resolvidas', async () => {
    vi.spyOn(mapboxClient, 'searchPlaces').mockResolvedValue([
      { id: '1', placeName: 'Av. Paulista, São Paulo' },
    ]);
    vi.spyOn(mapboxClient, 'retrievePlace').mockResolvedValue({ lat: -23.5613, lng: -46.6564 });
    const onSelect = vi.fn();

    render(<SearchBar onSelect={onSelect} />);

    fireEvent.change(screen.getByLabelText('Buscar destino'), {
      target: { value: 'Paulista' },
    });

    const option = await screen.findByText('Av. Paulista, São Paulo', {}, { timeout: 1000 });
    fireEvent.click(option);

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith({
        id: '1',
        placeName: 'Av. Paulista, São Paulo',
        coordinates: { lat: -23.5613, lng: -46.6564 },
      });
    });
  });

  it('fecha a lista de sugestões após selecionar uma opção', async () => {
    vi.spyOn(mapboxClient, 'searchPlaces').mockResolvedValue([
      { id: '1', placeName: 'Av. Paulista, São Paulo' },
    ]);
    vi.spyOn(mapboxClient, 'retrievePlace').mockResolvedValue({ lat: -23.5613, lng: -46.6564 });
    const onSelect = vi.fn();

    render(<SearchBar onSelect={onSelect} />);

    fireEvent.change(screen.getByLabelText('Buscar destino'), {
      target: { value: 'Paulista' },
    });

    const option = await screen.findByText('Av. Paulista, São Paulo', {}, { timeout: 1000 });
    fireEvent.click(option);

    expect(screen.queryByText('Av. Paulista, São Paulo')).not.toBeInTheDocument();
  });

  it('mostra um erro e não chama onSelect quando não consegue obter as coordenadas', async () => {
    vi.spyOn(mapboxClient, 'searchPlaces').mockResolvedValue([
      { id: '1', placeName: 'Av. Paulista, São Paulo' },
    ]);
    vi.spyOn(mapboxClient, 'retrievePlace').mockRejectedValue(new Error('falhou'));
    const onSelect = vi.fn();

    render(<SearchBar onSelect={onSelect} />);

    fireEvent.change(screen.getByLabelText('Buscar destino'), {
      target: { value: 'Paulista' },
    });

    const option = await screen.findByText('Av. Paulista, São Paulo', {}, { timeout: 1000 });
    fireEvent.click(option);

    await screen.findByText('Não foi possível obter a localização deste endereço. Tente novamente.');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('repassa a localização atual para a busca como viés de proximidade', async () => {
    const spy = vi.spyOn(mapboxClient, 'searchPlaces').mockResolvedValue([]);
    const onSelect = vi.fn();

    render(<SearchBar onSelect={onSelect} proximity={{ lat: -23.5613, lng: -46.6564 }} />);

    fireEvent.change(screen.getByLabelText('Buscar destino'), {
      target: { value: 'Paulista' },
    });

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith(
        'Paulista',
        expect.any(String),
        { lat: -23.5613, lng: -46.6564 },
      );
    });
  });
});
