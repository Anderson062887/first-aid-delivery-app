import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

let currentUser;
vi.mock('../../src/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ user: currentUser, logout: vi.fn() })
}));
vi.mock('../../src/api', () => ({
  usersApi: { list: vi.fn(async () => [{ _id: 'u1' }, { _id: 'u2', active: false }]) },
  api: {
    items: { list: vi.fn(async () => [{ _id: 'i1' }, { _id: 'i2' }, { _id: 'i3' }]) },
    locations: { list: vi.fn(async () => [{ _id: 'L1', name: 'Plant' }]) },
    boxes: { list: vi.fn(async () => [{ _id: 'b1', location: 'L1' }, { _id: 'b2', location: 'L1' }]) },
  },
}));

import Settings from '../../src/pages/settings/Settings.jsx';
import NavBar from '../../src/components/NavBar.jsx';
import { ToastProvider } from '../../src/components/Toast.jsx';
import { ConfirmProvider } from '../../src/components/Confirm.jsx';

describe('Settings', () => {
  beforeEach(() => { currentUser = { _id: 'a1', name: 'Admin', roles: ['admin'] }; });

  it('groups users, items and locations with counts and their main actions', async () => {
    render(<MemoryRouter><Settings /></MemoryRouter>);
    expect(await screen.findByText('2 users, 1 inactive')).toBeInTheDocument();
    expect(await screen.findByText('3 items')).toBeInTheDocument();
    expect(await screen.findByText('1 locations, 2 boxes')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '+ New user' })).toHaveAttribute('href', '/settings/users/new');
    expect(screen.getByRole('link', { name: '+ New item' })).toHaveAttribute('href', '/settings/items/new');
    expect(screen.getByRole('link', { name: '+ New location' })).toHaveAttribute('href', '/settings/locations/new');
  });
});

describe('Menu', () => {
  const renderNav = () => render(
    <MemoryRouter><ToastProvider><ConfirmProvider><NavBar /></ConfirmProvider></ToastProvider></MemoryRouter>
  );
  const menu = () => within(screen.getByRole('navigation', { name: 'Primary' }));

  it('admins get Settings instead of Items and Users', () => {
    currentUser = { _id: 'a1', name: 'Admin', roles: ['admin'] };
    renderNav();
    expect(menu().getAllByRole('link').map(a => a.textContent))
      .toEqual(['Dashboard', 'Locations', 'Deliveries', 'Reports', 'Settings', 'Offline Queue']);
  });

  it('reps never see Settings', () => {
    currentUser = { _id: 'r1', name: 'Rep', roles: ['rep'] };
    renderNav();
    expect(menu().getAllByRole('link').map(a => a.textContent))
      .toEqual(['Home', 'Locations', 'Deliveries', 'Offline Queue']);
  });
});

import { Routes, Route, useLocation } from 'react-router-dom';
import MovedTo from '../../src/components/MovedTo.jsx';

describe('Old setup addresses', () => {
  function Where() { return <div data-testid="where">{useLocation().pathname}</div>; }
  const go = (url) => render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/users" element={<MovedTo to="/settings/users" />} />
        <Route path="/items/:id/edit" element={<MovedTo to="/settings/items/:id/edit" />} />
        <Route path="/locations/:id/edit" element={<MovedTo to="/settings/locations/:id/edit" />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  );

  it.each([
    ['/users', '/settings/users'],
    ['/items/i9/edit', '/settings/items/i9/edit'],
    ['/locations/L1/edit', '/settings/locations/L1/edit'],
  ])('%s moves to %s', (from, to) => {
    go(from);
    expect(screen.getByTestId('where')).toHaveTextContent(to);
  });
});
