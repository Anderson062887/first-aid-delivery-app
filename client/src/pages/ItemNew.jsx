import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createItem } from '../api';
import { useToast } from '../components/ToastContext.jsx';
import Breadcrumbs from '../components/Breadcrumbs.jsx';

export default function ItemNew() {
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState({
    name: '',
    sku: '',
    packaging: 'each',
    unitsPerPack: 1,
    pricePerPack: 0,
    active: true
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function update(e) {
    const { name, value, type, checked } = e.target;
    setForm(f => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await createItem({
        ...form,
        unitsPerPack: Number(form.unitsPerPack),
        pricePerPack: Number(form.pricePerPack)
      });
      toast.success('Item created successfully');
      navigate('/items');
    } catch (err) {
      setError(err.message);
      toast.error('Failed to create item');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <Breadcrumbs items={[
        { label: 'Items', to: '/items' },
        { label: 'New Item' }
      ]} />
      <h2>New Item</h2>
      {error && <div style={{ color: 'red', marginBottom: 12 }}>{error}</div>}
      <form className="card form-card" onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
        <div>
          <label>Name</label>
          <input className="input" required name="name" value={form.name} onChange={update} />
        </div>

        <div>
          <label>SKU</label>
          <input className="input" name="sku" value={form.sku} onChange={update} />
        </div>

        <div className="row">
          <div>
            <label>Packaging</label>
            <select className="input" name="packaging" value={form.packaging} onChange={update}>
              <option value="each">each</option>
              <option value="case">case</option>
            </select>
          </div>
          <div>
            <label>Units per pack</label>
            <input className="input" type="number" min="1" name="unitsPerPack" value={form.unitsPerPack} onChange={update} />
          </div>
        </div>

        <div>
          <label>Price per pack ($)</label>
          <input className="input" type="number" step="0.01" min="0" name="pricePerPack" value={form.pricePerPack} onChange={update} />
        </div>

        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" name="active" checked={form.active} onChange={update} />
            Active
          </label>
        </div>

        <button className="btn primary" disabled={saving} type="submit">
          {saving ? 'Creating...' : 'Create Item'}
        </button>
      </form>
    </div>
  );
}
