import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useToast } from '../components/ToastContext.jsx';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import Skeleton from '../components/Skeleton.jsx';

export default function ItemEdit() {
  const { id } = useParams();
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
  const [originalName, setOriginalName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const item = await api.items.get(id);
        if (cancelled) return;
        setForm({
          name: item.name || '',
          sku: item.sku || '',
          packaging: item.packaging || 'each',
          unitsPerPack: item.unitsPerPack ?? 1,
          pricePerPack: item.pricePerPack ?? 0,
          active: item.active !== false
        });
        setOriginalName(item.name || 'Item');
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load item');
          toast.error('Failed to load item');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id, toast]);

  function update(e) {
    const { name, value, type, checked } = e.target;
    setForm(f => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.items.update(id, {
        ...form,
        unitsPerPack: Number(form.unitsPerPack),
        pricePerPack: Number(form.pricePerPack)
      });
      toast.success('Item updated successfully');
      navigate('/items');
    } catch (err) {
      setError(err.message);
      toast.error('Failed to update item');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div>
        <Breadcrumbs items={[
          { label: 'Items', to: '/items' },
          { label: 'Edit' }
        ]} />
        <h2>Edit Item</h2>
        <div style={{ maxWidth: 500, margin: '0 auto' }}>
          <Skeleton.Form fields={6} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <Breadcrumbs items={[
        { label: 'Items', to: '/items' },
        { label: `Edit: ${originalName}` }
      ]} />
      <h2>Edit Item</h2>
      {error && <div style={{ color: 'red', marginBottom: 12 }}>{error}</div>}
      <form className="card" onSubmit={onSubmit} style={{ display: 'grid', gap: 12, maxWidth: 500, margin: '0 auto' }}>
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
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </form>
    </div>
  );
}
