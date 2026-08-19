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
        messaging_mode: settings.messaging_mode,
        quiet_hours_start: settings.quiet_hours_start,
        quiet_hours_end: settings.quiet_hours_end,
        daily_message_cap: Number(settings.daily_message_cap),
        cost_per_message: settings.cost_per_message,
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
        <h2 style={{ marginTop: '2rem' }}>Public pages</h2>
        <p style={{ opacity: 0.75, fontSize: '0.9rem' }}>
          The counter tablet always works, whether these are on or off. Turning them off just removes the
          convenience of joining or booking from a phone.
        </p>
        <div style={{ marginBottom: '0.75rem' }}>
          <label>
            <input
              type="checkbox"
              checked={settings.self_join_enabled ?? true}
              onChange={(e) => update('self_join_enabled', e.target.checked)}
            />{' '}
            Allow joining the queue via the QR code
          </label>
        </div>
        <div style={{ marginBottom: '0.75rem' }}>
          <label>
            <input
              type="checkbox"
              checked={settings.public_booking_enabled ?? true}
              onChange={(e) => update('public_booking_enabled', e.target.checked)}
            />{' '}
            Allow booking appointments from the public page
          </label>
        </div>

        <h2 style={{ marginTop: '2rem' }}>Messaging</h2>
        <p style={{ opacity: 0.75, fontSize: '0.9rem' }}>
          Stay in dry run until template approval is done and you're ready to actually send. Dry run writes every
          message to the database and logs it, but never contacts the customer.
        </p>
        <div style={{ marginBottom: '0.75rem' }}>
          <label htmlFor="messaging_mode">Sending mode</label>
          <br />
          <select id="messaging_mode" value={settings.messaging_mode || 'dry_run'} onChange={(e) => update('messaging_mode', e.target.value)}>
            <option value="dry_run">Dry run (safe — sends nothing)</option>
            <option value="live">Live (sends real WhatsApp messages)</option>
          </select>
        </div>
        <div style={{ marginBottom: '0.75rem' }}>
          <label htmlFor="quiet_hours_start">Quiet hours start</label>
          <br />
          <input
            id="quiet_hours_start"
            type="time"
            value={settings.quiet_hours_start?.slice(0, 5) || ''}
            onChange={(e) => update('quiet_hours_start', e.target.value)}
          />
        </div>
        <div style={{ marginBottom: '0.75rem' }}>
          <label htmlFor="quiet_hours_end">Quiet hours end</label>
          <br />
          <input
            id="quiet_hours_end"
            type="time"
            value={settings.quiet_hours_end?.slice(0, 5) || ''}
            onChange={(e) => update('quiet_hours_end', e.target.value)}
          />
        </div>
        <div style={{ marginBottom: '0.75rem' }}>
          <label htmlFor="daily_message_cap">Daily marketing message cap</label>
          <br />
          <input
            id="daily_message_cap"
            type="number"
            min="0"
            value={settings.daily_message_cap ?? 0}
            onChange={(e) => update('daily_message_cap', e.target.value)}
          />
        </div>
        <div style={{ marginBottom: '0.75rem' }}>
          <label htmlFor="cost_per_message">Cost per message</label>
          <br />
          <input
            id="cost_per_message"
            type="number"
            step="0.0001"
            min="0"
            value={settings.cost_per_message ?? 0}
            onChange={(e) => update('cost_per_message', e.target.value)}
          />
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
