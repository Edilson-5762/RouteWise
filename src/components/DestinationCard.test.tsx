import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DestinationCard } from './DestinationCard';

const baseProps = {
  placeName: 'Av. Paulista, São Paulo',
  distanceMeters: 5000,
  durationSeconds: 600,
  travelProfile: 'driving' as const,
  onTravelProfileChange: vi.fn(),
  onSave: vi.fn(),
  onShare: vi.fn(),
  onStartNavigation: vi.fn(),
  onCancel: vi.fn(),
  isSaved: false,
};

describe('DestinationCard', () => {
  it('mostra nome, distância e ETA reais, sem nota nem telefone', () => {
    render(<DestinationCard {...baseProps} />);

    expect(screen.getByText('Av. Paulista, São Paulo')).toBeInTheDocument();
    expect(screen.getByText('5.0 km')).toBeInTheDocument();
    expect(screen.getByText('10 min')).toBeInTheDocument();
    expect(screen.queryByText(/★/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ligar' })).not.toBeInTheDocument();
  });

  it('chama onStartNavigation ao clicar em Iniciar navegação', () => {
    const onStartNavigation = vi.fn();
    render(<DestinationCard {...baseProps} onStartNavigation={onStartNavigation} />);

    fireEvent.click(screen.getByText('Iniciar navegação'));

    expect(onStartNavigation).toHaveBeenCalled();
  });

  it('chama onSave ao clicar em Salvar', () => {
    const onSave = vi.fn();
    render(<DestinationCard {...baseProps} onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(onSave).toHaveBeenCalled();
  });

  it('chama onTravelProfileChange ao trocar o modo de transporte', () => {
    const onTravelProfileChange = vi.fn();
    render(<DestinationCard {...baseProps} onTravelProfileChange={onTravelProfileChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'A pé' }));

    expect(onTravelProfileChange).toHaveBeenCalledWith('walking');
  });

  it('chama onCancel ao clicar em Cancelar trajeto', () => {
    const onCancel = vi.fn();
    render(<DestinationCard {...baseProps} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar trajeto' }));

    expect(onCancel).toHaveBeenCalled();
  });
});
