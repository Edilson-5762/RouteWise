import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NavigationStatusBar } from './NavigationStatusBar';

describe('NavigationStatusBar', () => {
  it('mostra tempo restante e distância', () => {
    render(
      <NavigationStatusBar
        durationSeconds={780}
        distanceMeters={6300}
        speedMetersPerSecond={12}
        isVoiceSupported
        isVoiceMuted={false}
        onToggleVoice={vi.fn()}
        onExit={vi.fn()}
      />,
    );

    expect(screen.getByText('13 min')).toBeInTheDocument();
    expect(screen.getByText('6.3 km')).toBeInTheDocument();
    expect(screen.getByText('43 km/h')).toBeInTheDocument();
  });

  it('não mostra velocidade quando indisponível', () => {
    render(
      <NavigationStatusBar
        durationSeconds={780}
        distanceMeters={6300}
        speedMetersPerSecond={null}
        isVoiceSupported
        isVoiceMuted={false}
        onToggleVoice={vi.fn()}
        onExit={vi.fn()}
      />,
    );

    expect(screen.queryByText(/km\/h/)).not.toBeInTheDocument();
  });

  it('chama onExit ao clicar em sair', () => {
    const onExit = vi.fn();
    render(
      <NavigationStatusBar
        durationSeconds={780}
        distanceMeters={6300}
        speedMetersPerSecond={null}
        isVoiceSupported
        isVoiceMuted={false}
        onToggleVoice={vi.fn()}
        onExit={onExit}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sair da navegação' }));

    expect(onExit).toHaveBeenCalled();
  });

  it('não mostra o botão de voz quando não suportado', () => {
    render(
      <NavigationStatusBar
        durationSeconds={780}
        distanceMeters={6300}
        speedMetersPerSecond={null}
        isVoiceSupported={false}
        isVoiceMuted={false}
        onToggleVoice={vi.fn()}
        onExit={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /voz/i })).not.toBeInTheDocument();
  });
});
