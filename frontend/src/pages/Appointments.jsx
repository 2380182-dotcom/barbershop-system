import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

const bigButton = {
  minHeight: 60,
  fontSize: '1.1rem',
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: '#f6f8fa',
  cursor: 'pointer',
};

function shiftDate(dateStr, deltaDays) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d) + deltaDays * 86400000);
  return dt.toISOString().slice(0, 10);
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function Appointments() {
  const [date, setDate] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [appointmentsByBarber, setAppointmentsByBarber] = useState([]);
  const [roster, setRoster] = useState(null);
  const [booking, setBooking] = useState(null); // { barberId, step, phone, serviceId, slots }
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function refresh(forDate) {
    const [attRes, apptRes] = await Promise.all([
      api.get(`/attendance${forDate ? `?date=${forDate}` : ''}`),
      api.get(`/appointments${forDate ? `?date=${forDate}` : ''}`),
    ]);
    setDate(attRes.date);
    setAttendance(attRes.attendance);
    setAppointmentsByBarber(apptRes.barbers);
  }

  useEffect(() => {
    api.get('/roster').then(setRoster);
    refresh(null)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  function changeDate(newDate) {
    setLoading(true);
    refresh(newDate)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  function appointmentsFor(barberId) {
    return appointmentsByBarber.find((b) => b.barberId === barberId)?.appointments || [];
  }

  async function startBooking(barberId) {
    setError('');
    setBooking({ barberId, step: 'phone', phone: '' });
  }

  async function confirmPhoneForBooking() {
    setBooking((b) => ({ ...b, step: 'service' }));
  }

  async function pickServiceForBooking(serviceId) {
    setError('');
    try {
      const { slots } = await api.get(
        `/appointments/slots?barber_id=${booking.barberId}&date=${date}&service_id=${serviceId}`
      );
      setBooking((b) => ({ ...b, step: 'slot', serviceId, slots }));
    } catch (err) {
      setError(err.message);
    }
  }

  async function pickSlot(startsAt) {
    setError('');
    try {
      await api.post('/appointments', {
        phone: booking.phone,
        barber_id: booking.barberId,
        service_id: booking.serviceId,
        starts_at: startsAt,
      });
      setBooking(null);
      await refresh(date);
    } catch (err) {
      setError(err.message);
    }
  }

  async function arrive(id) {
    setError('');
    try {
      await api.post(`/appointments/${id}/arrive`, {});
      await refresh(date);
    } catch (err) {
      setError(err.message);
    }
  }

  async function noShow(id) {
    setError('');
    try {
      await api.post(`/appointments/${id}/no-show`, {});
      await refresh(date);
    } catch (err) {
      setError(err.message);
    }
  }

  async function cancel(id) {
    setError('');
    try {
      await api.post(`/appointments/${id}/cancel`, {});
      await refresh(date);
    } catch (err) {
      setError(err.message);
    }
  }

  const presentBarbers = attendance.filter((a) => a.status === 'present');

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
        <h1 style={{ margin: 0 }}>Appointments</h1>
        {date && (
          <>
            <button style={{ ...bigButton, padding: '0 1rem' }} onClick={() => changeDate(shiftDate(date, -1))}>
              ← Prev
            </button>
            <strong>{date}</strong>
            <button style={{ ...bigButton, padding: '0 1rem' }} onClick={() => changeDate(shiftDate(date, 1))}>
              Next →
            </button>
          </>
        )}
      </div>

      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {loading && <p>Loading…</p>}

      {!loading && (
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          {presentBarbers.map((row) => (
            <div key={row.barberId} style={{ flex: '1 1 260px', minWidth: 260, border: '1px solid var(--border)', borderRadius: 12, padding: '0.75rem' }}>
              <h2 style={{ fontSize: '1.1rem', margin: '0 0 0.5rem' }}>{row.displayName}</h2>
              {appointmentsFor(row.barberId)
                .filter((a) => a.status !== 'cancelled' && a.status !== 'needs_reschedule')
                .map((a) => (
                  <div key={a.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.5rem', marginBottom: '0.5rem' }}>
                    <div style={{ fontWeight: 'bold' }}>
                      {formatTime(a.starts_at)} — {a.customer_name || a.customer_phone}
                    </div>
                    <div style={{ fontSize: '0.85rem', opacity: 0.75 }}>
                      {a.service_name} · {a.status}
                    </div>
                    {(a.status === 'booked' || a.status === 'arrived') && (
                      <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem' }}>
                        {a.status === 'booked' && (
                          <button onClick={() => arrive(a.id)} style={{ ...bigButton, minHeight: 48, flex: 1, background: '#16a34a', color: '#fff' }}>
                            Arrived
                          </button>
                        )}
                        <button onClick={() => noShow(a.id)} style={{ ...bigButton, minHeight: 48, flex: 1 }}>
                          No show
                        </button>
                        <button onClick={() => cancel(a.id)} style={{ ...bigButton, minHeight: 48, flex: 1, background: '#dc2626', color: '#fff' }}>
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              <button
                onClick={() => startBooking(row.barberId)}
                style={{ ...bigButton, width: '100%', background: '#0969da', color: '#fff', fontWeight: 'bold' }}
              >
                + Book appointment
              </button>
            </div>
          ))}
        </div>
      )}

      {booking && roster && (
        <BookingFlow
          booking={booking}
          setBooking={setBooking}
          services={roster.services}
          barberName={presentBarbers.find((b) => b.barberId === booking.barberId)?.displayName}
          onConfirmPhone={confirmPhoneForBooking}
          onPickService={pickServiceForBooking}
          onPickSlot={pickSlot}
          onCancel={() => setBooking(null)}
        />
      )}
    </div>
  );
}

function KeypadButton({ label, onClick }) {
  return (
    <button onClick={onClick} style={{ ...bigButton, height: 64, fontSize: '1.5rem' }}>
      {label}
    </button>
  );
}

function BookingFlow({ booking, setBooking, services, barberName, onConfirmPhone, onPickService, onPickSlot, onCancel }) {
  function press(d) {
    if (booking.phone.length >= 15) return;
    setBooking((b) => ({ ...b, phone: b.phone + d }));
  }
  function backspace() {
    setBooking((b) => ({ ...b, phone: b.phone.slice(0, -1) }));
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 20,
        padding: '1rem',
      }}
    >
      <div style={{ background: '#fff', borderRadius: 16, padding: '1.5rem', width: '100%', maxWidth: 420 }}>
        <h1 style={{ marginTop: 0, fontSize: '1.3rem' }}>Book with {barberName}</h1>

        {booking.step === 'phone' && (
          <>
            <div
              style={{
                fontSize: '2rem',
                letterSpacing: '0.1em',
                minHeight: 50,
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: '0.5rem 1rem',
                marginBottom: '1rem',
              }}
            >
              {booking.phone || ' '}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '1rem' }}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                <KeypadButton key={d} label={d} onClick={() => press(d)} />
              ))}
              <KeypadButton label="⌫" onClick={backspace} />
              <KeypadButton label="0" onClick={() => press('0')} />
              <div />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={onCancel} style={{ ...bigButton, flex: 1 }}>
                Cancel
              </button>
              <button
                onClick={onConfirmPhone}
                disabled={booking.phone.length < 7}
                style={{ ...bigButton, flex: 2, background: '#0969da', color: '#fff', fontWeight: 'bold' }}
              >
                Next
              </button>
            </div>
          </>
        )}

        {booking.step === 'service' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', marginBottom: '1rem' }}>
              {services.map((s) => (
                <button key={s.id} onClick={() => onPickService(s.id)} style={{ ...bigButton, minHeight: 70, textAlign: 'left', padding: '0.5rem' }}>
                  <div style={{ fontWeight: 'bold' }}>{s.name}</div>
                  <div style={{ opacity: 0.7 }}>{s.duration_minutes} min</div>
                </button>
              ))}
            </div>
            <button onClick={onCancel} style={{ ...bigButton, width: '100%' }}>
              Cancel
            </button>
          </>
        )}

        {booking.step === 'slot' && (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem', maxHeight: 300, overflowY: 'auto' }}>
              {booking.slots.length === 0 && <p>No times available that day.</p>}
              {booking.slots.map((s) => (
                <button key={s} onClick={() => onPickSlot(s)} style={{ ...bigButton, minWidth: 80 }}>
                  {formatTime(s)}
                </button>
              ))}
            </div>
            <button onClick={onCancel} style={{ ...bigButton, width: '100%' }}>
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
