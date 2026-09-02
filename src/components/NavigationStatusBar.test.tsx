import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NavigationStatusBar } from './NavigationStatusBar';

describe('NavigationStatusBar', () => {
  it('mostra tempo restante e distância', () => {
    render(
      <NavigationStatusBar
        durationSeconds={780}
        distanceMeters={6300}
        isVoiceSupported
        isVoiceMuted={false}
        onToggleVoice={vi.fn()}
        onExit={vi.fn()}
        onExitApp={vi.fn()}
      />,
    );

    expect(screen.getByText('13 min')).toBeInTheDocument();
    expect(screen.getByText('6.3 km')).toBeInTheDocument();
  });

  it('chama onExit ao clicar em sair', () => {
    const onExit = vi.fn();
    render(
      <NavigationStatusBar
        durationSeconds={780}
        distanceMeters={6300}
        isVoiceSupported
        isVoiceMuted={false}
        onToggleVoice={vi.fn()}
        onExit={onExit}
        onExitApp={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sair da navegação' }));

    expect(onExit).toHaveBeenCalled();
  });

  it('chama onExitApp ao clicar em sair da página', () => {
    const onExitApp = vi.fn();
    render(
      <NavigationStatusBar
        durationSeconds={780}
        distanceMeters={6300}
        isVoiceSupported
        isVoiceMuted={false}
        onToggleVoice={vi.fn()}
        onExit={vi.fn()}
        onExitApp={onExitApp}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sair da página' }));

    expect(onExitApp).toHaveBeenCalled();
  });

  it('não mostra o botão de voz quando não suportado', () => {
    render(
      <NavigationStatusBar
        durationSeconds={780}
        distanceMeters={6300}
        isVoiceSupported={false}
        isVoiceMuted={false}
        onToggleVoice={vi.fn()}
        onExit={vi.fn()}
        onExitApp={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /voz/i })).not.toBeInTheDocument();
  });
});
