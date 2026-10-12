import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

const auth = { user: null, loading: false, login: vi.fn() };
vi.mock('../../src/auth/AuthContext.jsx', () => ({ useAuth: () => auth }));

import ProtectedRoute from '../../src/auth/ProtectedRoute.jsx';
import Login from '../../src/pages/Login.jsx';

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname + loc.search}</div>;
}

function renderAt(path, state) {
  return render(
    <MemoryRouter initialEntries={[state ? { pathname: path, state } : path]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute />}>
          <Route path="*" element={<Where />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

async function signIn() {
  auth.login.mockImplementation(async () => { auth.user = { name: 'Ann', roles: ['rep'] }; });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('login redirect', () => {
  it('returns to the page the user originally opened', async () => {
    auth.user = null;
    renderAt('/visits/abc?tab=boxes');
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();

    await signIn();
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/visits/abc?tab=boxes'));
  });

  it('ignores a "from" that points off-site', async () => {
    auth.user = null;
    renderAt('/login', { from: '//evil.example.com' });
    await signIn();
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/));
  });
});
