import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

let currentUser;
vi.mock('../../src/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ user: currentUser })
}));

const boxes = [
  { _id: 'b1', label: 'Box 1', size: 'M', active: true, location: { _id: 'L1', name: 'Plant' } },
  { _id: 'b2', label: 'Box 2', size: 'L', active: false, location: { _id: 'L1', name: 'Plant' } },
];
vi.mock('../../src/api', () => ({
  api: { boxes: { list: vi.fn(async () => boxes), create: vi.fn(), update: vi.fn(), remove: vi.fn() } },
  locationsApi: { get: vi.fn(async () => ({ name: 'Plant' })) }
}));

import Boxes, { BoxesPanel } from '../../src/pages/Boxes.jsx';

const renderPage = () => render(
  <MemoryRouter><BoxesPanel locationId="L1" /></MemoryRouter>
);

function Where() { const l = useLocation(); return <div data-testid="where">{l.pathname}{l.search}</div>; }
const renderOldUrl = (url) => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes><Route path="/boxes" element={<Boxes />} /><Route path="*" element={<Where />} /></Routes>
  </MemoryRouter>
);

describe('old /boxes links', () => {
  it("send one location's boxes to its detail page", () => {
    renderOldUrl('/boxes?location=L1');
    expect(screen.getByTestId('where')).toHaveTextContent('/locations/L1');
  });
  it('send the all-boxes list to the Boxes report', () => {
    renderOldUrl('/boxes');
    expect(screen.getByTestId('where')).toHaveTextContent('/reports?tab=boxes');
  });
});

describe('Box list on a location', () => {
  beforeEach(() => { currentUser = { _id: 'a1', name: 'Admin', roles: ['admin'] }; });

  it('opens view-only for admins; editing needs "Manage boxes"', async () => {
    renderPage();
    expect(await screen.findByText('Box 1')).toBeInTheDocument();
    expect(screen.getByText('Retired')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add box|Retire|Delete/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Manage boxes' }));
    expect(screen.getByRole('button', { name: 'Add box' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('button', { name: 'Add box' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('reps never get the editing controls', async () => {
    currentUser = { _id: 'r1', name: 'Rep', roles: ['rep'] };
    renderPage();
    expect(await screen.findByText('Box 1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Manage boxes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
