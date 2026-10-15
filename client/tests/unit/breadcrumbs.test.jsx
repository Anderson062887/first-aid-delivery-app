import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import DeliveryDetail from '../../src/pages/DeliveryDetail.jsx';

const delivery = (visit) => ({
  _id: 'd1', createdAt: '2026-10-01T10:00:00Z', total: 10, lines: [],
  location: { name: 'Plant' }, box: { label: 'Box 1', size: 'M' }, visit
});

function renderDetail(d) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => d });
  return render(
    <MemoryRouter initialEntries={['/deliveries/d1']}>
      <Routes><Route path="/deliveries/:id" element={<DeliveryDetail />} /></Routes>
    </MemoryRouter>
  );
}

describe('Breadcrumbs instead of Back buttons', () => {
  afterEach(() => vi.restoreAllMocks());

  it('a delivery from a visit links back to Deliveries and to its visit', async () => {
    renderDetail(delivery({ _id: 'v1', rep: { name: 'Ann' } }));
    const crumbs = await screen.findByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByRole('link', { name: 'Deliveries' })).toHaveAttribute('href', '/deliveries');
    expect(within(crumbs).getByRole('link', { name: 'Visit Details' })).toHaveAttribute('href', '/deliveries/visit/v1');
    expect(within(crumbs).getByText('Delivery')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Back/ })).not.toBeInTheDocument();
  });

  it('a delivery without a visit skips the visit step', async () => {
    renderDetail(delivery(null));
    const crumbs = await screen.findByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getAllByRole('link').map(a => a.textContent)).toEqual(['Deliveries']);
  });
});
