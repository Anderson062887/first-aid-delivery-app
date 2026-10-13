import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../src/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ user: { _id: 'u1', name: 'Ann', roles: ['rep'] }, logout: vi.fn() })
}));

import NavBar from '../../src/components/NavBar.jsx';
import { enqueue, clearQueue } from '../../src/offline.js';

describe('Offline Queue menu link', () => {
  it('is shown to reps and counts waiting changes as they are queued', () => {
    render(<MemoryRouter><NavBar /></MemoryRouter>);
    const link = screen.getByRole('link', { name: /Offline Queue/ });
    expect(link).toHaveAttribute('href', '/offline-queue');
    expect(link).toHaveTextContent(/^Offline Queue$/);

    act(() => {
      enqueue({ path: '/api/deliveries', method: 'POST', body: {} });
      enqueue({ path: '/api/deliveries', method: 'POST', body: {} });
    });
    expect(link).toHaveTextContent('Offline Queue (2)');

    act(() => clearQueue());
    expect(link).toHaveTextContent(/^Offline Queue$/);
  });
});
