import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

const bigButton = {
  minHeight: 56,
  fontSize: '1rem',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: '#f6f8fa',
  cursor: 'pointer',
};

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function OwnerAttendance() {
  const [date, setDate] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [needsReschedule, setNeedsReschedule] = useState([]);
  const [barbers, setBarbers] = useState([]);
  const [leaveForm, setLeaveForm] = useState({ barberId: '', startDate: '', endDate: '' });
  const [moveTarget, setMoveTarget] = useState({}); // appointmentId -> barberId
  const [month, setMonth] = useState(currentMonth());
  const [summary, setSummary] = useState([]);
  const [error, setError] = useState('');

  async function refresh() {
    const [attRes, needsRes, barbersRes] = await Promise.all([
      api.get('/attendance'),
      api.get('/appointments/needs-reschedule'),
      api.get('/barbers'),
    ]);
    setDate(attRes.date);
    setAttendance(attRes.attendance);
    setNeedsReschedule(needsRes.appointments);
    setBarbers(barbersRes.barbers.filter((b) => b.active));
  }

  useEffect(() => {
    refresh().catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    api
      .get(`/attendance/summary?month=${month}`)
      .then((data) => setSummary(data.summary))
      .catch((err) => setError(err.message));
  }, [month]);

  async function setStatus(barberId, status) {
    setError('');
    try {
      await api.post('/attendance', { barber_id: barberId, status });
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function submitLeave(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/attendance/leave', {
        barber_id: leaveForm.barberId,
        start_date: leaveForm.startDate,
        end_date: leaveForm.endDate,
      });
      setLeaveForm({ barberId: '', startDate: '', endDate: '' });
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function moveAppointment(appointmentId) {
    const newBarberId = moveTarget[appointmentId];
    if (!newBarberId) return;
    setError('');
    try {
      await api.patch(`/appointments/${appointmentId}/move`, { barber_id: newBarberId });
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function cancelNeedsReschedule(appointmentId) {
    setError('');
    try {
      await api.post(`/appointments/${appointmentId}/cancel`, { reason: 'Barber unavailable' });
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <h1>Attendance</h1>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <h2>Today ({date})</h2>
      <table style={{ borderCollapse: 'collapse', marginBottom: '2rem' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '0.25rem 0.75rem' }}>Barber</th>
            <th style={{ textAlign: 'left', padding: '0.25rem 0.75rem' }}>Status</th>
            <th style={{ padding: '0.25rem 0.75rem' }} />
          </tr>
        </thead>
        <tbody>
          {attendance.map((row) => (
            <tr key={row.barberId}>
              <td style={{ padding: '0.25rem 0.75rem' }}>{row.displayName}</td>
              <td style={{ padding: '0.25rem 0.75rem' }}>
                {row.onBreakUntil ? `on break until ${formatTime(row.onBreakUntil)}` : row.status}
              </td>
              <td style={{ padding: '0.25rem 0.75rem', display: 'flex', gap: '0.4rem' }}>
                <button style={bigButton} onClick={() => setStatus(row.barberId, 'present')}>
                  Present
                </button>
                <button style={bigButton} onClick={() => setStatus(row.barberId, 'absent')}>
                  Absent
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Mark leave (future dates, owner only)</h2>
      <form onSubmit={submitLeave} style={{ display: 'flex', gap: '0.75rem', alignItems: 'end', marginBottom: '2rem', flexWrap: 'wrap' }}>
        <div>
          <label>Barber</label>
          <br />
          <select value={leaveForm.barberId} onChange={(e) => setLeaveForm((f) => ({ ...f, barberId: e.target.value }))} required>
            <option value="">Select…</option>
            {barbers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.display_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Start date</label>
          <br />
          <input type="date" value={leaveForm.startDate} onChange={(e) => setLeaveForm((f) => ({ ...f, startDate: e.target.value }))} required />
        </div>
        <div>
          <label>End date</label>
          <br />
          <input type="date" value={leaveForm.endDate} onChange={(e) => setLeaveForm((f) => ({ ...f, endDate: e.target.value }))} required />
        </div>
        <button type="submit" style={{ ...bigButton, background: '#0969da', color: '#fff' }}>
          Mark leave
        </button>
      </form>

      <h2>Needs reschedule</h2>
      {needsReschedule.length === 0 && <p style={{ opacity: 0.7 }}>Nothing needs rescheduling.</p>}
      {needsReschedule.map((a) => (
        <div key={a.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.75rem', marginBottom: '0.5rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <strong>{a.customer_name || a.customer_phone}</strong> — {a.service_name} with {a.barber_name} at{' '}
            {formatTime(a.starts_at)} on {a.business_date}
          </div>
          <select value={moveTarget[a.id] || ''} onChange={(e) => setMoveTarget((m) => ({ ...m, [a.id]: e.target.value }))}>
            <option value="">Move to…</option>
            {barbers.filter((b) => b.id !== a.barber_id).map((b) => (
              <option key={b.id} value={b.id}>
                {b.display_name}
              </option>
            ))}
          </select>
          <button style={bigButton} onClick={() => moveAppointment(a.id)}>
            Move
          </button>
          <button style={{ ...bigButton, background: '#dc2626', color: '#fff' }} onClick={() => cancelNeedsReschedule(a.id)}>
            Cancel
          </button>
        </div>
      ))}

      <h2 style={{ marginTop: '2rem' }}>Monthly attendance — scheduling only, not payroll</h2>
      <div style={{ marginBottom: '0.75rem' }}>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </div>
      <table style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '0.25rem 0.75rem' }}>Barber</th>
            <th style={{ textAlign: 'left', padding: '0.25rem 0.75rem' }}>Present</th>
            <th style={{ textAlign: 'left', padding: '0.25rem 0.75rem' }}>Absent</th>
            <th style={{ textAlign: 'left', padding: '0.25rem 0.75rem' }}>Leave</th>
          </tr>
        </thead>
        <tbody>
          {summary.map((row) => (
            <tr key={row.barberId}>
              <td style={{ padding: '0.25rem 0.75rem' }}>{row.displayName}</td>
              <td style={{ padding: '0.25rem 0.75rem' }}>{row.present}</td>
              <td style={{ padding: '0.25rem 0.75rem' }}>{row.absent}</td>
              <td style={{ padding: '0.25rem 0.75rem' }}>{row.leave}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
