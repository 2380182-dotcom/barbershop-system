import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

const cardStyle = {
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '1rem',
  minWidth: 180,
};

const bigNumber = { fontSize: '2rem', fontWeight: 'bold' };

function StatCard({ label, value, highlight }) {
  return (
    <div style={{ ...cardStyle, background: highlight ? '#eef6ff' : '#fff', borderColor: highlight ? '#0969da' : 'var(--border)' }}>
      <div style={{ opacity: 0.7, fontSize: '0.85rem' }}>{label}</div>
      <div style={bigNumber}>{value}</div>
    </div>
  );
}

export function Dashboard() {
  const [data, setData] = useState(null);
  const [costPreview, setCostPreview] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/dashboard')
      .then(setData)
      .catch((err) => setError(err.message));
    api
      .get('/messages/cost-preview?template=rebooking_reminder')
      .then(setCostPreview)
      .catch(() => {});
  }, []);

  if (error) return <p style={{ color: 'crimson' }}>{error}</p>;
  if (!data) return <p>Loading…</p>;

  const { today, thisMonth } = data;

  return (
    <div>
      <h1>Dashboard</h1>

      <h2>Today ({data.date})</h2>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <StatCard label="Customers served" value={today.customersServedTotal} />
        <StatCard label="Currently waiting" value={today.currentlyWaiting} />
        <StatCard label="Average wait" value={today.averageWaitMinutes !== null ? `${today.averageWaitMinutes} min` : '—'} />
        <StatCard label="Appointments booked" value={today.appointments.booked} />
        <StatCard label="Appointments arrived" value={today.appointments.arrived} />
        <StatCard label="No-shows" value={today.appointments.noShow} />
      </div>
      <table style={{ borderCollapse: 'collapse', marginBottom: '2rem' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '0.25rem 0.75rem' }}>Barber</th>
            <th style={{ textAlign: 'left', padding: '0.25rem 0.75rem' }}>Customers served</th>
          </tr>
        </thead>
        <tbody>
          {today.customersServedByBarber.map((b) => (
            <tr key={b.barberId}>
              <td style={{ padding: '0.25rem 0.75rem' }}>{b.displayName}</td>
              <td style={{ padding: '0.25rem 0.75rem' }}>{b.count}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>This month</h2>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <StatCard label="Repeat rate (within 30 days)" value={`${thisMonth.repeatRate}%`} highlight />
        <StatCard label="Customers served" value={thisMonth.customersServed} />
        <StatCard label="New customers" value={thisMonth.newCustomers} />
        <StatCard label="Returning customers" value={thisMonth.returningCustomers} />
        <StatCard label="Busiest day" value={thisMonth.busiestDay || '—'} />
        <StatCard label="Busiest hour" value={thisMonth.busiestHour !== null ? `${thisMonth.busiestHour}:00` : '—'} />
      </div>

      <h3>Messages this month</h3>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <StatCard label="Sent" value={thisMonth.messages.sent} />
        <StatCard label="Delivered" value={thisMonth.messages.delivered} />
        <StatCard label="Failed" value={thisMonth.messages.failed} />
        <StatCard label="Total cost" value={thisMonth.messages.totalCost.toFixed(2)} />
      </div>

      {costPreview && (
        <p style={{ opacity: 0.8 }}>
          {costPreview.count} rebooking reminder{costPreview.count === 1 ? '' : 's'} currently queued — estimated cost{' '}
          {costPreview.estimatedCost.toFixed(2)} at {costPreview.costPerMessage.toFixed(4)}/message.
        </p>
      )}
    </div>
  );
}
