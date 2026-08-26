import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExitedScreen } from './ExitedScreen';

describe('ExitedScreen', () => {
  it('chama onReturn ao clicar em "Voltar ao app"', () => {
    const onReturn = vi.fn();
    render(<ExitedScreen onReturn={onReturn} />);

    fireEvent.click(screen.getByText('Voltar ao app'));

    expect(onReturn).toHaveBeenCalled();
  });
});
