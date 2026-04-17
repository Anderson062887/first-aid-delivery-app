import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { locationsApi } from '../api';
import { useToast } from '../components/ToastContext.jsx';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import Skeleton from '../components/Skeleton.jsx';

export default function LocationEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState({
    name: '',
    street: '',
    city: '',
    state: '',
    zip: ''
  });
  const [originalName, setOriginalName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const loc = await locationsApi.get(id);
        if (cancelled) return;
        setForm({
          name: loc.name || '',
          street: loc.address?.street || '',
          city: loc.address?.city || '',
          state: loc.address?.state || '',
          zip: loc.address?.zip || ''
        });
        setOriginalName(loc.name || 'Location');
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load location');
          toast.error('Failed to load location');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id, toast]);

  function update(e) {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await locationsApi.update(id, {
        name: form.name,
        address: {
          street: form.street,
          city: form.city,
          state: form.state,
          zip: form.zip
        }
      });
      toast.success('Location updated successfully');
      navigate('/locations');
    } catch (err) {
      setError(err.message);
      toast.error('Failed to update location');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (deleteConfirm !== originalName) {
      toast.error('Location name does not match');
      return;
    }
    setDeleting(true);
    try {
      await locationsApi.delete(id);
      toast.success(`"${originalName}" deleted permanently`);
      navigate('/locations');
    } catch (err) {
      toast.error(err.message || 'Failed to delete location');
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div>
        <Breadcrumbs items={[
          { label: 'Locations', to: '/locations' },
          { label: 'Edit' }
        ]} />
        <h2>Edit Location</h2>
        <div className="form-card">
          <Skeleton.Form fields={5} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <Breadcrumbs items={[
        { label: 'Locations', to: '/locations' },
        { label: `Edit: ${originalName}` }
      ]} />
      <h2>Edit Location</h2>
      {error && <div style={{ color: 'red', marginBottom: 12 }}>{error}</div>}
      <form className="card form-card" onSubmit={onSubmit} style={{ display: 'grid', gap: 12 }}>
        <div>
          <label>Name</label>
          <input className="input" required name="name" value={form.name} onChange={update} />
        </div>

        <div>
          <label>Street Address</label>
          <input className="input" name="street" value={form.street} onChange={update} />
        </div>

        <div className="row">
          <div>
            <label>City</label>
            <input className="input" name="city" value={form.city} onChange={update} />
          </div>
          <div>
            <label>State</label>
            <input className="input" name="state" value={form.state} onChange={update} maxLength={2} style={{ textTransform: 'uppercase' }} />
          </div>
          <div>
            <label>ZIP</label>
            <input className="input" name="zip" value={form.zip} onChange={update} maxLength={10} />
          </div>
        </div>

        <button className="btn primary" disabled={saving} type="submit">
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </form>

      {/* Danger Zone */}
      <div className="card form-card" style={{ margin: '24px auto 0', border: '1px solid #c62828' }}>
        <div className="danger-zone-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <strong style={{ color: '#c62828' }}>Danger Zone</strong>
            <p style={{ margin: '4px 0 0', fontSize: 13, opacity: 0.8 }}>
              Permanently delete this location and all its boxes
            </p>
          </div>
          {!showDelete && (
            <button
              type="button"
              className="btn"
              style={{ background: '#fff', color: '#c62828', borderColor: '#c62828' }}
              onClick={() => setShowDelete(true)}
            >
              Delete Location
            </button>
          )}
        </div>

        {showDelete && (
          <div style={{ marginTop: 16, padding: 12, background: '#ffebee', borderRadius: 8 }}>
            <p style={{ margin: '0 0 8px', fontSize: 14 }}>
              This action <strong>cannot be undone</strong>. This will permanently delete the location and all boxes associated with it.
            </p>
            <p style={{ margin: '0 0 8px', fontSize: 14 }}>
              Please type <strong>{originalName}</strong> to confirm:
            </p>
            <input
              className="input"
              value={deleteConfirm}
              onChange={e => setDeleteConfirm(e.target.value)}
              placeholder="Type location name to confirm"
              style={{ marginBottom: 12 }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn"
                style={{ background: '#c62828', color: '#fff', borderColor: '#c62828' }}
                onClick={handleDelete}
                disabled={deleting || deleteConfirm !== originalName}
              >
                {deleting ? 'Deleting...' : 'I understand, delete this location'}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => { setShowDelete(false); setDeleteConfirm(''); }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
