import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

function emptyForm() {
  return { displayName: '', workingDays: [...ALL_DAYS], username: '', password: '' };
}

export function Barbers() {
  const [barbers, setBarbers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(emptyForm());
  const [submitting, setSubmitting] = useState(false);

  async function refresh() {
    const data = await api.get('/barbers');
    setBarbers(data.barbers);
  }

  useEffect(() => {
    refresh()
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  function toggleDay(day) {
    setForm((f) => ({
      ...f,
      workingDays: f.workingDays.includes(day)
        ? f.workingDays.filter((d) => d !== day)
        : [...f.workingDays, day].sort(),
    }));
  }

  async function handleAdd(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/barbers', {
        displayName: form.displayName,
        workingDays: form.workingDays,
        username: form.username || undefined,
        password: form.password || undefined,
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
    await api.delete(`/barbers/${id}`);
    await refresh();
  }

  async function handleReactivate(id) {
    await api.put(`/barbers/${id}`, { active: true });
    await refresh();
  }

  if (loading) return <p>Loading…</p>;

  return (
    <div>
      <h1>Barbers</h1>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <table style={{ borderCollapse: 'collapse', marginBottom: '2rem' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '0.25rem 0.75rem' }}>Name</th>
            <th style={{ textAlign: 'left', padding: '0.25rem 0.75rem' }}>Working days</th>
            <th style={{ textAlign: 'left', padding: '0.25rem 0.75rem' }}>Login</th>
            <th style={{ textAlign: 'left', padding: '0.25rem 0.75rem' }}>Status</th>
            <th style={{ padding: '0.25rem 0.75rem' }} />
          </tr>
        </thead>
        <tbody>
          {barbers.map((b) => (
            <tr key={b.id}>
              <td style={{ padding: '0.25rem 0.75rem' }}>{b.display_name}</td>
              <td style={{ padding: '0.25rem 0.75rem' }}>
                {(b.working_days || []).map((d) => WEEKDAY_LABELS[d]).join(', ')}
              </td>
              <td style={{ padding: '0.25rem 0.75rem' }}>{b.username || '—'}</td>
              <td style={{ padding: '0.25rem 0.75rem' }}>{b.active ? 'Active' : 'Inactive'}</td>
              <td style={{ padding: '0.25rem 0.75rem' }}>
                {b.active ? (
                  <button onClick={() => handleDeactivate(b.id)}>Deactivate</button>
                ) : (
                  <button onClick={() => handleReactivate(b.id)}>Reactivate</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Add barber</h2>
      <form onSubmit={handleAdd} style={{ maxWidth: 360 }}>
        <div style={{ marginBottom: '0.75rem' }}>
          <label htmlFor="displayName">Name</label>
          <br />
          <input
            id="displayName"
            value={form.displayName}
            onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
            required
          />
        </div>
        <div style={{ marginBottom: '0.75rem' }}>
          <span>Working days</span>
          <br />
          {ALL_DAYS.map((day) => (
            <label key={day} style={{ marginRight: '0.5rem' }}>
              <input
                type="checkbox"
                checked={form.workingDays.includes(day)}
                onChange={() => toggleDay(day)}
              />
              {WEEKDAY_LABELS[day]}
            </label>
          ))}
        </div>
        <fieldset style={{ marginBottom: '0.75rem' }}>
          <legend>Login (optional)</legend>
          <div style={{ marginBottom: '0.5rem' }}>
            <label htmlFor="username">Username</label>
            <br />
            <input
              id="username"
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
            />
          </div>
          <div>
            <label htmlFor="password">Password</label>
            <br />
            <input
              id="password"
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            />
          </div>
        </fieldset>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Adding…' : 'Add barber'}
        </button>
      </form>
    </div>
  );
}
