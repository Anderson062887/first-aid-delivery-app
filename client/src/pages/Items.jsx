import { useEffect, useState } from 'react';
import { listItems } from '../api';
import { Link } from 'react-router-dom';

export default function Items() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    listItems().then(setItems).catch(console.error);
  }, []);

  return (
    <div className="page">
      <h2>Items</h2>
      <div style={{ marginBottom: 12 }}>
        <Link to="/items/new">+ New Item</Link>
      </div>
      <table>
        <thead>
          <tr>
            <th>Name</th><th>SKU</th><th>Packaging</th><th>Units/Pack</th><th>Price/Pack</th><th>Active</th>
          </tr>
        </thead>
        <tbody>
          {items.map(i => (
            <tr key={i._id}>
              <td>{i.name}</td>
              <td>{i.sku}</td>
              <td>{i.packaging}</td>
              <td>{i.unitsPerPack}</td>
              <td>${Number(i.pricePerPack).toFixed(2)}</td>
              <td>{i.active ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
