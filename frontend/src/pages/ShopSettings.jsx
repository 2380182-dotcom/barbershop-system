import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function ShopSettings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    api
      .get('/shop-settings')
      .then((data) => setSettings(data.shopSettings))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  function update(field, value) {
    setSettings((s) => ({ ...s, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    setSaving(true);
    try {
      const data = await api.put('/shop-settings', {
        shop_name: settings.shop_name,
        timezone: settings.timezone,
        opening_time: settings.opening_time,
        closing_time: settings.closing_time,
        weekly_off_day: settings.weekly_off_day === '' ? null : settings.weekly_off_day,
      });
      setSettings(data.shopSettings);
      setMessage('Saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p>Loading…</p>;
  if (!settings) return <p>No shop settings found. Run the seed script first.</p>;

  return (
    <div style={{ maxWidth: 420 }}>
      <h1>Shop Settings</h1>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '0.75rem' }}>
          <label htmlFor="shop_name">Shop name</label>
          <br />
          <input
            id="shop_name"
            value={settings.shop_name || ''}
            onChange={(e) => update('shop_name', e.target.value)}
            required
          />
        </div>
        <div style={{ marginBottom: '0.75rem' }}>
          <label htmlFor="timezone">Timezone</label>
          <br />
          <input
            id="timezone"
            value={settings.timezone || ''}
            onChange={(e) => update('timezone', e.target.value)}
            required
          />
        </div>
        <div style={{ marginBottom: '0.75rem' }}>
          <label htmlFor="opening_time">Opening time</label>
          <br />
          <input
            id="opening_time"
            type="time"
            value={settings.opening_time?.slice(0, 5) || ''}
            onChange={(e) => update('opening_time', e.target.value)}
            required
          />
        </div>
        <div style={{ marginBottom: '0.75rem' }}>
          <label htmlFor="closing_time">Closing time</label>
          <br />
          <input
            id="closing_time"
            type="time"
            value={settings.closing_time?.slice(0, 5) || ''}
            onChange={(e) => update('closing_time', e.target.value)}
            required
          />
        </div>
        <div style={{ marginBottom: '0.75rem' }}>
          <label htmlFor="weekly_off_day">Weekly off day</label>
          <br />
          <select
            id="weekly_off_day"
            value={settings.weekly_off_day ?? ''}
            onChange={(e) => update('weekly_off_day', e.target.value === '' ? null : Number(e.target.value))}
          >
            <option value="">Open every day</option>
            {WEEKDAYS.map((day, i) => (
              <option key={i} value={i}>
                {day}
              </option>
            ))}
          </select>
        </div>
        {error && <p style={{ color: 'crimson' }}>{error}</p>}
        {message && <p style={{ color: 'green' }}>{message}</p>}
        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </form>
    </div>
  );
}
