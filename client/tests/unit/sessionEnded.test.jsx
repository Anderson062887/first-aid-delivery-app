import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

vi.mock('../../src/api', () => ({
  authApi: {
    me: vi.fn(async () => ({ _id: 'u1', name: 'Ann', roles: ['rep'] })),
    login: vi.fn(), logout: vi.fn()
  }
}));
vi.mock('../../src/offline', () => ({ clearUserData: vi.fn() }));

import { AuthProvider } from '../../src/auth/AuthContext.jsx';
import ProtectedRoute from '../../src/auth/ProtectedRoute.jsx';
import Login from '../../src/pages/Login.jsx';

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname}</div>;
}

function renderApp() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/visits/abc']}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route path="*" element={<Where />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  );
}

const respond = (status) => ({ ok: status < 300, status, json: async () => ({}) });

describe('session ended by the server', () => {
  // The network; the provider wraps window.fetch around it
  let backend;
  beforeEach(() => { backend = vi.fn(); global.fetch = backend; });

  it('a 401 from any API call sends the user to login with an explanation', async () => {
    renderApp();
    await screen.findByTestId('where');

    backend.mockResolvedValueOnce(respond(401));
    await act(async () => { await window.fetch('/api/visits/abc'); });

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument());
    expect(screen.getByText(/account was disabled/)).toBeInTheDocument();
  });

  it('ignores 401s from /api/auth (a wrong password) and other errors', async () => {
    renderApp();
    await screen.findByTestId('where');

    backend.mockResolvedValueOnce(respond(401)).mockResolvedValueOnce(respond(403));
    await act(async () => {
      await window.fetch('/api/auth/login', { method: 'POST' });
      await window.fetch('/api/users');
    });

    expect(screen.getByTestId('where')).toHaveTextContent('/visits/abc');
  });
});
