import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBanner } from './ErrorBanner';

describe('ErrorBanner', () => {
  it('mostra a mensagem e chama onRetry ao clicar', () => {
    const onRetry = vi.fn();
    render(<ErrorBanner message="Falha ao buscar" onRetry={onRetry} />);

    fireEvent.click(screen.getByText('Tentar novamente'));

    expect(onRetry).toHaveBeenCalled();
  });
});
