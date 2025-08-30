import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createItem } from '../api';

export default function ItemNew() {
  const navigate = useNavigate();
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
      navigate('/items'); // redirect to the list
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <h2>New Item</h2>
      {error && <div style={{ color: 'red', marginBottom: 12 }}>{error}</div>}
      <form className='card' onSubmit={onSubmit} style={{ display: 'grid', gap: 12, maxWidth: 420 , margin:"0 auto"}}>
 
          <label>
          Name
          <input required name="name" value={form.name} onChange={update} />
        </label>
      
       

        <label>
          SKU
          <input name="sku" value={form.sku} onChange={update} />
        </label>

        <label>
          Packaging
          <select name="packaging" value={form.packaging} onChange={update}>
            <option value="each">each</option>
            <option value="case">case</option>
          </select>
        </label>

        <label>
          Units per pack
          <input type="number" min="1" name="unitsPerPack" value={form.unitsPerPack} onChange={update} />
        </label>

        <label>
          Price per pack
          <input type="number" step="0.01" min="0" name="pricePerPack" value={form.pricePerPack} onChange={update} />
        </label>

        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" name="active" checked={form.active} onChange={update} />
          Active
        </label>

        <button disabled={saving} type="submit">{saving ? 'Saving…' : 'Create Item'}</button>
      </form>
    </div>
  );
}
