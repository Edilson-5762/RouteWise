import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ArrivalScreen } from './ArrivalScreen';

describe('ArrivalScreen', () => {
  it('mostra o nome do destino e chama onDone ao concluir', () => {
    const onDone = vi.fn();
    render(<ArrivalScreen placeName="Av. Paulista, São Paulo" onDone={onDone} />);

    expect(screen.getByText('Você chegou!')).toBeInTheDocument();
    expect(screen.getByText('Av. Paulista, São Paulo')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Concluir'));

    expect(onDone).toHaveBeenCalled();
  });
});
