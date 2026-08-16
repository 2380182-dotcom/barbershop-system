import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

function emptyForm() {
  return { name: '', durationMinutes: '', price: '', growOutDays: '21' };
}

export function Services() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(emptyForm());
  const [submitting, setSubmitting] = useState(false);

  async function refresh() {
    const data = await api.get('/services');
    setServices(data.services);
  }

  useEffect(() => {
    refresh()
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleAdd(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/services', {
        name: form.name,
        durationMinutes: Number(form.durationMinutes),
        price: form.price === '' ? 0 : Number(form.price),
        growOutDays: form.growOutDays === '' ? 21 : Number(form.growOutDays),
      });
      setForm(emptyForm());
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeactivate(id) {
    await api.delete(`/services/${id}`);
    await refresh();
  }

  async function handleReactivate(id) {
    await api.put(`/services/${id}`, { active: true });
    await refresh();
  }

  if (loading) return <p>Loading…</p>;

  return (
    <div>
      <h1>Services</h1>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <table style={{ borderCollapse: 'collapse', marginBottom: '2rem' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '0.25rem 0.75rem' }}>Name</th>
            <th style={{ textAlign: 'left', padding: '0.25rem 0.75rem' }}>Duration (min)</th>
            <th style={{ textAlign: 'left', padding: '0.25rem 0.75rem' }}>Price</th>
            <th style={{ textAlign: 'left', padding: '0.25rem 0.75rem' }}>Grow-out (days)</th>
            <th style={{ textAlign: 'left', padding: '0.25rem 0.75rem' }}>Status</th>
            <th style={{ padding: '0.25rem 0.75rem' }} />
          </tr>
        </thead>
        <tbody>
          {services.map((s) => (
            <tr key={s.id}>
              <td style={{ padding: '0.25rem 0.75rem' }}>{s.name}</td>
              <td style={{ padding: '0.25rem 0.75rem' }}>{s.duration_minutes}</td>
              <td style={{ padding: '0.25rem 0.75rem' }}>{s.price}</td>
              <td style={{ padding: '0.25rem 0.75rem' }}>{s.grow_out_days}</td>
              <td style={{ padding: '0.25rem 0.75rem' }}>{s.active ? 'Active' : 'Inactive'}</td>
              <td style={{ padding: '0.25rem 0.75rem' }}>
                {s.active ? (
                  <button onClick={() => handleDeactivate(s.id)}>Deactivate</button>
                ) : (
                  <button onClick={() => handleReactivate(s.id)}>Reactivate</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Add service</h2>
      <form onSubmit={handleAdd} style={{ maxWidth: 320 }}>
        <div style={{ marginBottom: '0.75rem' }}>
          <label htmlFor="name">Name</label>
          <br />
          <input
            id="name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
        </div>
        <div style={{ marginBottom: '0.75rem' }}>
          <label htmlFor="durationMinutes">Duration (minutes)</label>
          <br />
          <input
            id="durationMinutes"
            type="number"
            min="1"
            value={form.durationMinutes}
            onChange={(e) => setForm((f) => ({ ...f, durationMinutes: e.target.value }))}
            required
          />
        </div>
        <div style={{ marginBottom: '0.75rem' }}>
          <label htmlFor="price">Price</label>
          <br />
          <input
            id="price"
            type="number"
            min="0"
            step="0.01"
            value={form.price}
            onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
          />
        </div>
        <div style={{ marginBottom: '0.75rem' }}>
          <label htmlFor="growOutDays">Grow-out days</label>
          <br />
          <input
            id="growOutDays"
            type="number"
            min="1"
            value={form.growOutDays}
            onChange={(e) => setForm((f) => ({ ...f, growOutDays: e.target.value }))}
          />
        </div>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Adding…' : 'Add service'}
        </button>
      </form>
    </div>
  );
}
