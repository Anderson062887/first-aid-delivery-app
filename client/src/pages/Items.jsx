import { useEffect, useState, useMemo } from 'react';
import { listItems } from '../api';
import { Link } from 'react-router-dom';
import Skeleton from '../components/Skeleton.jsx';

export default function Items() {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    listItems()
      .then(setItems)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(i =>
      i.name?.toLowerCase().includes(q) ||
      i.sku?.toLowerCase().includes(q)
    );
  }, [items, search]);

  return (
    <div className="page items-page">
      <h2>Items</h2>
      <div style={{ marginBottom: 12, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <Link className="btn" to="/items/new">+ New Item</Link>
        <input
          type="search"
          className="input"
          placeholder="Search by name or SKU..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ minWidth: 200 }}
          aria-label="Search items"
        />
        {search && (
          <span style={{ fontSize: 14, opacity: 0.7 }}>
            {filteredItems.length} of {items.length} items
          </span>
        )}
      </div>

      {loading && <Skeleton.Table rows={6} cols={7} />}

      {!loading && (
      <table className="items-table">
        <thead>
          <tr>
            <th>Name</th><th>SKU</th><th>Packaging</th><th>Units/Pack</th><th>Price/Pack</th><th>Active</th><th></th>
          </tr>
        </thead>
        <tbody>
          {filteredItems.map(i => (
            <tr key={i._id}>
              <td data-label="Name">{i.name}</td>
              <td data-label="SKU">{i.sku}</td>
              <td data-label="Packaging">{i.packaging}</td>
              <td data-label="Units/Pack">{i.unitsPerPack}</td>
              <td data-label="Price/Pack">${Number(i.pricePerPack).toFixed(2)}</td>
              <td data-label="Active">{i.active ? 'Yes' : 'No'}</td>
              <td>
                <Link to={`/items/${i._id}/edit`} className="btn btn-sm">Edit</Link>
              </td>
            </tr>
          ))}
          {filteredItems.length === 0 && (
            <tr>
              <td colSpan={7} style={{ textAlign: 'center', padding: 20, opacity: 0.7 }}>
                {search ? 'No items match your search' : 'No items found'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      )}
    </div>
  );
}
