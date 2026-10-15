import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const logout = vi.fn(async () => {});
vi.mock('../../src/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ user: { _id: 'u1', name: 'Ann', roles: ['rep'] }, logout })
}));

import { ConfirmProvider } from '../../src/components/Confirm.jsx';
import { useConfirm } from '../../src/components/ConfirmContext.jsx';
import { ToastProvider } from '../../src/components/Toast.jsx';
import NavBar from '../../src/components/NavBar.jsx';
import { enqueue, clearQueue } from '../../src/offline.js';

function Asker({ onAnswer }) {
  const confirm = useConfirm();
  return (
    <button onClick={async () => onAnswer(await confirm({
      title: 'Delete it?', message: 'Gone for good.', confirmLabel: 'Delete', danger: true
    }))}>Ask</button>
  );
}

const renderAsker = (onAnswer) => render(<ConfirmProvider><Asker onAnswer={onAnswer} /></ConfirmProvider>);

describe('Confirm dialog', () => {
  it('shows the question with Cancel focused, and resolves true on confirm', async () => {
    const onAnswer = vi.fn();
    renderAsker(onAnswer);
    fireEvent.click(screen.getByText('Ask'));

    const dialog = screen.getByRole('alertdialog', { name: 'Delete it?' });
    expect(dialog).toHaveTextContent('Gone for good.');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass('btn', 'danger', 'solid');

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Delete' })));
    expect(onAnswer).toHaveBeenCalledWith(true);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('Cancel, Escape and clicking outside all resolve false', async () => {
    const onAnswer = vi.fn();
    renderAsker(onAnswer);

    fireEvent.click(screen.getByText('Ask'));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' })));

    fireEvent.click(screen.getByText('Ask'));
    await act(async () => fireEvent.keyDown(document, { key: 'Escape' }));

    fireEvent.click(screen.getByText('Ask'));
    await act(async () => fireEvent.click(document.querySelector('.confirm-backdrop')));

    expect(onAnswer.mock.calls).toEqual([[false], [false], [false]]);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

describe('Logging out with unsynced changes', () => {
  const renderNav = () => render(
    <MemoryRouter><ToastProvider><ConfirmProvider><NavBar /></ConfirmProvider></ToastProvider></MemoryRouter>
  );

  it('asks in the app, and only logs out on "Log out anyway"', async () => {
    const browserConfirm = vi.spyOn(window, 'confirm');
    enqueue({ path: '/api/deliveries', method: 'POST', body: {} });
    renderNav();

    fireEvent.click(screen.getAllByRole('button', { name: /log ?out/i })[0]);
    expect(screen.getByRole('alertdialog')).toHaveTextContent("1 change on this device haven't synced yet");
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' })));
    expect(logout).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole('button', { name: /log ?out/i })[0]);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Log out anyway' })));
    expect(logout).toHaveBeenCalledTimes(1);
    expect(browserConfirm).not.toHaveBeenCalled();

    clearQueue();
    browserConfirm.mockRestore();
  });
});
