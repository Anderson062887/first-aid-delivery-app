import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../src/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ user: { _id: 'r1', name: 'Riley Rep', roles: ['rep'] } })
}));

const items = [
  { _id: 'gl', name: 'Gloves', packaging: 'case', unitsPerPack: 50, pricePerPack: 10 },
  { _id: 'wp', name: 'Wipes', packaging: 'each', unitsPerPack: 1, pricePerPack: 0.5 },
];
const lastRefill = vi.fn();
const myOpen = vi.fn();
vi.mock('../../src/api', () => ({
  api: {
    items: { list: vi.fn(async () => items) },
    locations: { list: vi.fn(async () => [
      { _id: 'L1', name: 'Plant' }, { _id: 'L2', name: 'Office' }, { _id: 'L3', name: 'School' }
    ]) },
    boxes: {
      list: vi.fn(async () => [{ _id: 'B1', label: 'Box 1', size: 'M', location: 'L1' }]),
      one: vi.fn(async () => ({ _id: 'B1', label: 'Box 1', size: 'M', location: { _id: 'L1' } })),
      lastRefill: (...a) => lastRefill(...a),
    },
    deliveries: { create: vi.fn() },
  },
  visitApi: {
    get: vi.fn(async () => ({ visit: { _id: 'V1', rep: { name: 'Riley Rep' }, location: { _id: 'L1' } } })),
    myOpen: (...a) => myOpen(...a),
    recentByLocation: vi.fn(async () => ({
      L1: [{ status: 'submitted', submittedAt: '2026-10-14T12:00:00Z' }],
      L2: [{ status: 'submitted', submittedAt: '2026-08-01T12:00:00Z' }],
    })),
    start: vi.fn(),
  },
}));
vi.mock('../../src/cache.js', () => ({ getVisit: vi.fn(), getBoxes: vi.fn(async () => []), getLocations: vi.fn(async () => []) }));
vi.mock('../../src/components/OfflineBanner.jsx', () => ({ default: () => null }));

import NewDelivery from '../../src/pages/NewDelivery.jsx';
import RepHome from '../../src/pages/RepHome.jsx';
import { ToastProvider } from '../../src/components/Toast.jsx';
import { ConfirmProvider } from '../../src/components/Confirm.jsx';
import { lastVisitText, daysSince, byDue } from '../../src/visitDue.js';

const wrap = (ui, url = '/') => render(
  <MemoryRouter initialEntries={[url]}><ToastProvider><ConfirmProvider>{ui}</ConfirmProvider></ToastProvider></MemoryRouter>
);

describe('Refilling a box', () => {
  beforeEach(() => {
    localStorage.clear();
    lastRefill.mockReset().mockResolvedValue({
      source: 'last-refill', date: '2026-10-01T12:00:00Z',
      lines: [{ item: 'gl', packaging: 'case', quantity: 2 }, { item: 'wp', packaging: 'each', quantity: 10 }]
    });
  });

  it('starts from the last refill; - / + change amounts; Start empty clears it', async () => {
    wrap(<NewDelivery />, '/deliveries/new?visit=V1&box=B1');

    expect(await screen.findByText(/Filled in from this box's last refill/)).toBeInTheDocument();
    expect(lastRefill).toHaveBeenCalledWith('B1');
    const gloves = (await screen.findByText('Gloves')).closest('li');
    expect(within(gloves).getByText('2')).toBeInTheDocument();
    expect(within(gloves).getByText('$20.00')).toBeInTheDocument();

    fireEvent.click(within(gloves).getByRole('button', { name: 'More Gloves' }));
    expect(within(gloves).getByText('3')).toBeInTheDocument();
    expect(within(gloves).getByText('$30.00')).toBeInTheDocument();
    fireEvent.click(within(gloves).getByRole('button', { name: 'Fewer Gloves' }));
    fireEvent.click(within(gloves).getByRole('button', { name: 'Fewer Gloves' }));
    expect(within(gloves).getByText('1')).toBeInTheDocument();
    expect(within(gloves).getByRole('button', { name: 'Fewer Gloves' })).toBeDisabled(); // never below 1

    fireEvent.click(screen.getByRole('button', { name: 'Remove Wipes' }));
    expect(screen.queryByText('Wipes')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Start empty' }));
    expect(screen.getByText('No items added yet.')).toBeInTheDocument();
  });

  it('starts empty when the box has no history', async () => {
    lastRefill.mockResolvedValue({ source: null, date: null, lines: [] });
    wrap(<NewDelivery />, '/deliveries/new?visit=V1&box=B1');
    expect(await screen.findByText('No items added yet.')).toBeInTheDocument();
    expect(screen.queryByText(/Filled in/)).not.toBeInTheDocument();
  });
});

describe('Rep home', () => {
  it('shows visits in progress and the most overdue locations', async () => {
    myOpen.mockResolvedValue([{ _id: 'V1', location: { _id: 'L1', name: 'Plant' }, boxesDone: 1, boxesTotal: 3 }]);
    wrap(<RepHome />);

    expect(await screen.findByText('1 of 3 boxes refilled')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continue visit' })).toHaveAttribute('href', '/visits/V1');

    // Plant is in progress, so it isn't also listed as due; never-visited School comes first
    const due = (await screen.findByText('Due for a visit')).closest('.card');
    await within(due).findByText('School');
    expect(within(due).getAllByText(/^(School|Office|Plant)$/).map(e => e.textContent)).toEqual(['School', 'Office']);
    expect(within(due).getByText('Never visited')).toBeInTheDocument();
  });
});

describe('Last visit wording', () => {
  const now = new Date(2026, 9, 17, 10);
  it('counts calendar days', () => {
    expect(lastVisitText(null, now)).toBe('Never visited');
    expect(lastVisitText(new Date(2026, 9, 17, 8), now)).toBe('Last visit: today');
    expect(lastVisitText(new Date(2026, 9, 16, 23), now)).toBe('Last visit: yesterday');
    expect(daysSince(new Date(2026, 8, 17), now)).toBe(30);
  });
  it('sorts never-visited first, then longest since', () => {
    const map = { a: [{ submittedAt: '2026-10-10' }], b: [{ submittedAt: '2026-09-01' }] };
    const locs = [{ _id: 'a', name: 'A' }, { _id: 'b', name: 'B' }, { _id: 'c', name: 'C' }];
    expect([...locs].sort(byDue(map)).map(l => l.name)).toEqual(['C', 'B', 'A']);
  });
});
