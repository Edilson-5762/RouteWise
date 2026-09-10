import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ArrivalScreen } from './ArrivalScreen';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ArrivalScreen', () => {
  it('mostra o nome do destino e chama onDone ao concluir', () => {
    const onDone = vi.fn();
    render(<ArrivalScreen placeName="Av. Paulista, São Paulo" onDone={onDone} />);

    expect(screen.getByText('Você chegou ao seu destino')).toBeInTheDocument();
    expect(screen.getByText('Av. Paulista, São Paulo')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Concluir'));

    expect(onDone).toHaveBeenCalled();
  });

  it('compartilha a localização do destino ao tocar em Enviar', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share });

    render(
      <ArrivalScreen
        placeName="Atacadão Dia a Dia"
        destination={{ lat: -15.813558, lng: -48.016237 }}
        onDone={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Enviar'));

    expect(share).toHaveBeenCalledTimes(1);
    const payload = share.mock.calls[0][0];
    expect(payload.text).toContain('Atacadão Dia a Dia');
    expect(payload.url).toContain('-15.813558');
    expect(payload.url).toContain('-48.016237');
  });

  it('sem Web Share, cai para copiar o link para a área de transferência', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    render(
      <ArrivalScreen
        placeName="Atacadão Dia a Dia"
        destination={{ lat: -15.813558, lng: -48.016237 }}
        onDone={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Enviar'));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain('-15.813558');
  });

  it('não mostra Enviar quando não há coordenada de destino', () => {
    render(<ArrivalScreen placeName="Av. Paulista" onDone={vi.fn()} />);
    expect(screen.queryByText('Enviar')).not.toBeInTheDocument();
  });
});
