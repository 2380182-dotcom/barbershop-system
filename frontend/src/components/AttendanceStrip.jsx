import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { usePolling } from '../hooks/usePolling.js';

const fetchAttendance = () => api.get('/attendance');

const STATUS_COLORS = {
  present: { bg: '#dcfce7', text: '#166534' },
  absent: { bg: '#fee2e2', text: '#991b1b' },
  leave: { bg: '#fef3c7', text: '#92400e' },
  break: { bg: '#dbeafe', text: '#1e40af' },
};

const BREAK_OPTIONS_MINUTES = [15, 30, 45, 60];

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function chipStatus(row) {
  if (row.onBreakUntil) return 'break';
  return row.status;
}

export function AttendanceStrip() {
  const { user } = useAuth();
  const { data, connectionLost } = usePolling(fetchAttendance, 3000);
  const [openBarberId, setOpenBarberId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setOpenBarberId(null);
  }, [data === null]);

  async function refreshSoon() {
    // Polling will pick it up within 3s; nothing else to do here.
  }

  async function markOwn(status) {
    setBusy(true);
    setError('');
    try {
      await api.post('/attendance', { barber_id: user.barberId, status });
      await refreshSoon();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      setOpenBarberId(null);
    }
  }

  async function startOwnBreak(minutes) {
    setBusy(true);
    setError('');
    try {
      const until = new Date(Date.now() + minutes * 60000).toISOString();
      await api.post('/attendance/break', { barber_id: user.barberId, on_break_until: until });
      await refreshSoon();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      setOpenBarberId(null);
    }
  }

  async function endOwnBreak() {
    setBusy(true);
    setError('');
    try {
      await api.post('/attendance/break', { barber_id: user.barberId, on_break_until: null });
      await refreshSoon();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      setOpenBarberId(null);
    }
  }

  async function ownerSetStatus(barberId, status) {
    setBusy(true);
    setError('');
    try {
      await api.post('/attendance', { barber_id: barberId, status });
      await refreshSoon();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      setOpenBarberId(null);
    }
  }

  function handleChipClick(row) {
    if (user.role === 'owner') {
      setOpenBarberId((cur) => (cur === row.barberId ? null : row.barberId));
      return;
    }
    // Barber: only his own chip does anything.
    if (row.barberId !== user.barberId) return;
    setOpenBarberId((cur) => (cur === row.barberId ? null : row.barberId));
  }

  if (!data) return null;

  const openRow = data.attendance.find((r) => r.barberId === openBarberId);

  return (
    <div style={{ marginBottom: '1rem' }}>
      {connectionLost && (
        <div style={{ background: '#b91c1c', color: '#fff', padding: '0.4rem 0.75rem', borderRadius: 6, marginBottom: '0.5rem', fontSize: '0.9rem' }}>
          Connection lost — attendance may be out of date
        </div>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {data.attendance.map((row) => {
          const status = chipStatus(row);
          const colors = STATUS_COLORS[status] || STATUS_COLORS.present;
          const isSelf = row.barberId === user.barberId;
          return (
            <button
              key={row.barberId}
              onClick={() => handleChipClick(row)}
              style={{
                minHeight: 60,
                padding: '0.4rem 1rem',
                borderRadius: 10,
                border: isSelf ? '2px solid #0969da' : '1px solid var(--border)',
                background: colors.bg,
                color: colors.text,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{ fontWeight: 'bold' }}>{row.displayName}</div>
              <div style={{ fontSize: '0.85rem' }}>
                {status === 'break' ? `back at ${formatTime(row.onBreakUntil)}` : status}
              </div>
            </button>
          );
        })}
      </div>

      {error && <p style={{ color: 'crimson', marginTop: '0.5rem' }}>{error}</p>}

      {openRow && user.role === 'barber' && openRow.barberId === user.barberId && (
        <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: '#f6f8fa', borderRadius: 8 }}>
          {chipStatus(openRow) === 'break' ? (
            <button disabled={busy} onClick={endOwnBreak} style={{ minHeight: 60, padding: '0 1rem' }}>
              Back now
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <span>Take a break:</span>
              {BREAK_OPTIONS_MINUTES.map((m) => (
                <button key={m} disabled={busy} onClick={() => startOwnBreak(m)} style={{ minHeight: 60, padding: '0 1rem' }}>
                  {m} min
                </button>
              ))}
              {openRow.status !== 'present' && (
                <button disabled={busy} onClick={() => markOwn('present')} style={{ minHeight: 60, padding: '0 1rem' }}>
                  I'm here
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {openRow && user.role === 'owner' && (
        <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: '#f6f8fa', borderRadius: 8, display: 'flex', gap: '0.5rem' }}>
          <span style={{ alignSelf: 'center' }}>{openRow.displayName}:</span>
          <button disabled={busy} onClick={() => ownerSetStatus(openRow.barberId, 'present')} style={{ minHeight: 60, padding: '0 1rem' }}>
            Present
          </button>
          <button disabled={busy} onClick={() => ownerSetStatus(openRow.barberId, 'absent')} style={{ minHeight: 60, padding: '0 1rem' }}>
            Absent
          </button>
        </div>
      )}
    </div>
  );
}
