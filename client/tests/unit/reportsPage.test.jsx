import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../src/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ user: { _id: 'a1', name: 'Admin', roles: ['admin'] } })
}));

const itemsSummary = vi.fn();
const locationHistory = vi.fn();
vi.mock('../../src/api', () => ({
  api: { locations: { list: vi.fn(async () => [{ _id: 'L1', name: 'Plant' }]) } },
  usersApi: { list: vi.fn(async () => []) },
  userTimeZone: () => 'UTC',
  reportsApi: { itemsSummary: (...a) => itemsSummary(...a), locationHistory: (...a) => locationHistory(...a) },
}));

import Reports from '../../src/pages/Reports.jsx';
import { DATE_PRESETS } from '../../src/reportDates.js';

const renderAt = (url) => render(<MemoryRouter initialEntries={[url]}><Reports /></MemoryRouter>);

describe('Date presets', () => {
  const today = new Date(2026, 9, 16); // Oct 16, 2026
  const range = (key) => DATE_PRESETS.find(p => p.key === key).range(today);
  it('give the expected ranges', () => {
    expect(range('this-month')).toEqual(['2026-10-01', '2026-10-16']);
    expect(range('last-month')).toEqual(['2026-09-01', '2026-09-30']);
    expect(range('last-30')).toEqual(['2026-09-17', '2026-10-16']);
    expect(range('this-year')).toEqual(['2026-01-01', '2026-10-16']);
    expect(range('all')).toEqual(['', '']);
  });
});

describe('Reports page', () => {
  beforeEach(() => {
    itemsSummary.mockReset().mockResolvedValue({
      rows: [{ itemId: 'i1', name: 'Gloves', sku: 'GLV', unitsPerPack: 50, cases: 2, each: 5, units: 105, amount: 21 }],
      totals: { cases: 2, each: 5, units: 105, amount: 21 }, deliveries: 1
    });
    locationHistory.mockReset().mockResolvedValue({
      location: { name: 'Plant' },
      rows: [{ visitId: 'v1', date: '2026-10-05T14:10:00Z', status: 'submitted', outcome: 'no_access', note: 'Gate locked', repName: 'Riley', boxes: [], items: [], total: 0 }]
    });
  });

  it('shows items delivered this month on screen, with totals', async () => {
    renderAt('/reports');
    const row = (await screen.findByText('Gloves')).closest('tr');
    expect(within(row).getByText('GLV')).toBeInTheDocument();
    expect(within(row).getByText('105')).toBeInTheDocument();
    expect(screen.getByText(/1 item · 105 units · \$21\.00/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'This month' })).toHaveAttribute('aria-pressed', 'true');
    expect(itemsSummary).toHaveBeenLastCalledWith(expect.objectContaining({ location: '' }));

    fireEvent.click(screen.getByRole('button', { name: 'All time' }));
    expect(itemsSummary).toHaveBeenLastCalledWith({ from: '', to: '', location: '' });
  });

  it('location history asks for a location, then lists visits including ones with nothing refilled', async () => {
    renderAt('/reports?tab=history');
    expect(await screen.findByText(/Pick a location above/)).toBeInTheDocument();
    expect(locationHistory).not.toHaveBeenCalled();

    await screen.findByRole('option', { name: 'Plant' });
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'L1' } });
    expect(await screen.findByText('no access')).toBeInTheDocument();
    expect(screen.getByText(/Riley · no boxes refilled/)).toBeInTheDocument();
    expect(screen.getByText('Gate locked')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Details' })).toHaveAttribute('href', '/deliveries/visit/v1');
    expect(locationHistory).toHaveBeenLastCalledWith(expect.objectContaining({ location: 'L1' }));
  });
});
