import { useState } from 'react';
import { api } from '../api/client.js';

export function Customers() {
  const [phone, setPhone] = useState('');
  const [customer, setCustomer] = useState(undefined); // undefined = not searched, null = not found
  const [error, setError] = useState('');
  const [confirmPhone, setConfirmPhone] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);

  async function search(e) {
    e.preventDefault();
    setError('');
    setDeleted(false);
    setConfirmPhone('');
    try {
      const data = await api.get(`/customers/lookup?phone=${encodeURIComponent(phone)}`);
      setCustomer(data.customer);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete() {
    setError('');
    setDeleting(true);
    try {
      await api.delete(`/customers/${customer.id}`, { confirmPhone });
      setDeleted(true);
      setCustomer(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  }

  const confirmMatches = customer && confirmPhone === customer.phone;

  return (
    <div style={{ maxWidth: 480 }}>
      <h1>Customers</h1>
      <form onSubmit={search} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone number"
          required
          style={{ flex: 1, padding: '0.5rem' }}
        />
        <button type="submit">Search</button>
      </form>

      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {deleted && <p style={{ color: 'green' }}>Customer deleted.</p>}

      {customer === null && !deleted && <p>No customer found with that phone number.</p>}

      {customer && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '1rem' }}>
          <p>
            <strong>{customer.name || 'No name on file'}</strong>
            <br />
            {customer.phone}
          </p>

          <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
            <p style={{ color: 'crimson', fontWeight: 'bold' }}>
              Delete this customer — irreversible. All visits, style cards, photos, appointments, and messages are
              permanently removed.
            </p>
            <label htmlFor="confirm-phone">Type the phone number to confirm: {customer.phone}</label>
            <br />
            <input
              id="confirm-phone"
              value={confirmPhone}
              onChange={(e) => setConfirmPhone(e.target.value)}
              style={{ padding: '0.5rem', marginTop: '0.4rem', marginBottom: '0.75rem' }}
            />
            <br />
            <button
              onClick={handleDelete}
              disabled={!confirmMatches || deleting}
              style={{ background: '#dc2626', color: '#fff', padding: '0.5rem 1rem', border: 'none', borderRadius: 8 }}
            >
              {deleting ? 'Deleting…' : 'Delete customer permanently'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
