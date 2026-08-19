import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { usePolling } from '../hooks/usePolling.js';
import { StyleCardScreen } from '../components/StyleCardScreen.jsx';
import { AttendanceStrip } from '../components/AttendanceStrip.jsx';

const fetchQueue = () => api.get('/queue');

const bigButton = {
  minHeight: 64,
  minWidth: 64,
  fontSize: '1.25rem',
  borderRadius: 12,
  border: '1px solid var(--border)',
  background: '#f6f8fa',
  cursor: 'pointer',
};

export function Tablet() {
  const { data: queue, connectionLost } = usePolling(fetchQueue, 3000);
  const [roster, setRoster] = useState(null);
  const [presets, setPresets] = useState(null);
  const [flow, setFlow] = useState(null); // null | { step, phone, lookup, serviceId }
  const [styleCardFlow, setStyleCardFlow] = useState(null); // null | { visit, customer, entry, defaultGrowOutDays }
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    api.get('/roster').then(setRoster);
    api.get('/style-presets').then((data) => setPresets(data.presets));
  }, []);

  function startAdd() {
    setActionError('');
    setFlow({ step: 'phone', phone: '' });
  }

  function cancelAdd() {
    setFlow(null);
  }

  async function confirmPhone() {
    const lookup = await api.get(`/customers/lookup?phone=${encodeURIComponent(flow.phone)}`);
    setFlow((f) => ({ ...f, step: 'service', lookup }));
  }

  function pickService(serviceId) {
    setFlow((f) => ({ ...f, step: 'barber', serviceId }));
  }

  async function pickBarber(barberId) {
    try {
      await api.post('/queue', { phone: flow.phone, serviceId: flow.serviceId, barberId });
      setFlow(null);
    } catch (err) {
      setActionError(err.message);
      setFlow(null);
    }
  }

  async function callNext(barberId) {
    setActionError('');
    try {
      await api.post('/queue/call-next', { barberId });
    } catch (err) {
      setActionError(err.message);
    }
  }

  async function markDone(id) {
    setActionError('');
    try {
      const { entry, visit, customer } = await api.post(`/queue/${id}/done`, {});
      const service = roster?.services.find((s) => s.id === visit.service_id);
      setStyleCardFlow({ entry, visit, customer, defaultGrowOutDays: service?.grow_out_days ?? 21 });
    } catch (err) {
      setActionError(err.message);
    }
  }

  async function markMiss(id) {
    setActionError('');
    try {
      await api.post(`/queue/${id}/miss`, {});
    } catch (err) {
      setActionError(err.message);
    }
  }

  return (
    <div style={{ padding: '1rem' }}>
      <AttendanceStrip />
      {connectionLost && (
        <div style={{ background: '#b91c1c', color: '#fff', padding: '0.75rem 1rem', borderRadius: 8, marginBottom: '1rem', fontSize: '1.25rem' }}>
          Connection lost — showing last known queue
        </div>
      )}
      {actionError && (
        <div style={{ background: '#fee2e2', color: '#991b1b', padding: '0.75rem 1rem', borderRadius: 8, marginBottom: '1rem' }}>
          {actionError}
        </div>
      )}

      {!flow && (
        <>
          <button
            onClick={startAdd}
            style={{ ...bigButton, background: '#0969da', color: '#fff', padding: '0 2rem', marginBottom: '1.5rem', fontWeight: 'bold' }}
          >
            + Add customer
          </button>
          <QueueBoard queue={queue} onCallNext={callNext} onDone={markDone} onMiss={markMiss} />
        </>
      )}

      {flow?.step === 'phone' && <PhoneStep flow={flow} setFlow={setFlow} onConfirm={confirmPhone} onCancel={cancelAdd} />}
      {flow?.step === 'service' && roster && (
        <ServiceStep flow={flow} services={roster.services} onPick={pickService} onCancel={cancelAdd} />
      )}
      {flow?.step === 'barber' && roster && (
        <BarberStep flow={flow} barbers={roster.barbers} queue={queue} onPick={pickBarber} onCancel={cancelAdd} />
      )}

      {styleCardFlow && presets && (
        <StyleCardScreen
          visit={styleCardFlow.visit}
          customer={styleCardFlow.customer}
          entry={styleCardFlow.entry}
          defaultGrowOutDays={styleCardFlow.defaultGrowOutDays}
          presets={presets}
          onClose={() => setStyleCardFlow(null)}
        />
      )}
    </div>
  );
}

function QueueBoard({ queue, onCallNext, onDone, onMiss }) {
  if (!queue) return <p>Loading…</p>;

  return (
    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
      {queue.barbers.map((barber) => (
        <BarberColumn key={barber.barberId} column={barber} onCallNext={onCallNext} onDone={onDone} onMiss={onMiss} />
      ))}
      <SharedColumn shared={queue.shared} />
    </div>
  );
}

function EntryCard({ entry, serving, onDone, onMiss }) {
  return (
    <div
      style={{
        border: serving ? '2px solid #0969da' : '1px solid var(--border)',
        background: serving ? '#dbeafe' : '#fff',
        borderRadius: 10,
        padding: '0.75rem',
        marginBottom: '0.5rem',
      }}
    >
      <div style={{ fontSize: '1.75rem', fontWeight: 'bold' }}>#{entry.tokenNumber}</div>
      <div>{entry.customerName || 'Walk-in'}</div>
      <div style={{ fontSize: '0.9rem', opacity: 0.7 }}>{entry.serviceName}</div>
      {serving && (
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
          <button onClick={() => onDone(entry.id)} style={{ ...bigButton, flex: 1, minHeight: 60, background: '#16a34a', color: '#fff' }}>
            Done
          </button>
          <button onClick={() => onMiss(entry.id)} style={{ ...bigButton, flex: 1, minHeight: 60, background: '#dc2626', color: '#fff' }}>
            Missed
          </button>
        </div>
      )}
    </div>
  );
}

function BarberColumn({ column, onCallNext, onDone, onMiss }) {
  return (
    <div style={{ flex: '1 1 240px', minWidth: 240, border: '1px solid var(--border)', borderRadius: 12, padding: '0.75rem' }}>
      <h2 style={{ fontSize: '1.1rem', margin: '0 0 0.25rem' }}>{column.displayName}</h2>
      <div style={{ opacity: 0.7, marginBottom: '0.25rem' }}>~{column.waitMinutes} min wait</div>
      {column.attendanceStatus !== 'present' && (
        <div style={{ color: '#991b1b', fontSize: '0.85rem', marginBottom: '0.25rem' }}>{column.attendanceStatus}</div>
      )}
      {column.nextAppointmentAt && (
        <div style={{ color: '#0969da', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
          next appointment{' '}
          {new Date(column.nextAppointmentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
        </div>
      )}
      {column.serving ? (
        <EntryCard entry={column.serving} serving onDone={onDone} onMiss={onMiss} />
      ) : (
        <button
          onClick={() => onCallNext(column.barberId)}
          style={{ ...bigButton, width: '100%', background: '#0969da', color: '#fff', fontWeight: 'bold', marginBottom: '0.75rem' }}
        >
          Call next
        </button>
      )}
      {column.waiting.map((entry) => (
        <EntryCard key={entry.id} entry={entry} />
      ))}
    </div>
  );
}

function SharedColumn({ shared }) {
  return (
    <div style={{ flex: '1 1 240px', minWidth: 240, border: '1px solid var(--border)', borderRadius: 12, padding: '0.75rem' }}>
      <h2 style={{ fontSize: '1.1rem', margin: '0 0 0.25rem' }}>Any barber</h2>
      <div style={{ opacity: 0.7, marginBottom: '0.5rem' }}>~{shared.waitMinutes} min wait</div>
      {shared.waiting.map((entry) => (
        <EntryCard key={entry.id} entry={entry} />
      ))}
    </div>
  );
}

function KeypadButton({ label, onClick }) {
  return (
    <button onClick={onClick} style={{ ...bigButton, height: 72, fontSize: '1.75rem' }}>
      {label}
    </button>
  );
}

function PhoneStep({ flow, setFlow, onConfirm, onCancel }) {
  function press(digit) {
    if (flow.phone.length >= 15) return;
    setFlow((f) => ({ ...f, phone: f.phone + digit }));
  }
  function backspace() {
    setFlow((f) => ({ ...f, phone: f.phone.slice(0, -1) }));
  }

  return (
    <div style={{ maxWidth: 360 }}>
      <h1>Enter phone number</h1>
      <div
        style={{
          fontSize: '2.5rem',
          letterSpacing: '0.1em',
          minHeight: 60,
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '0.5rem 1rem',
          marginBottom: '1rem',
        }}
      >
        {flow.phone || ' '}
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
          onClick={onConfirm}
          disabled={flow.phone.length < 7}
          style={{ ...bigButton, flex: 2, background: '#0969da', color: '#fff', fontWeight: 'bold' }}
        >
          Next
        </button>
      </div>
    </div>
  );
}

function ServiceStep({ flow, services, onPick, onCancel }) {
  return (
    <div style={{ maxWidth: 480 }}>
      <h1>Pick a service</h1>
      <p style={{ marginBottom: '0.25rem' }}>
        {flow.lookup?.customer
          ? `Welcome back${flow.lookup.customer.name ? ', ' + flow.lookup.customer.name : ''}${
              flow.lookup.lastVisit ? ` — last visit ${flow.lookup.lastVisit}` : ''
            }`
          : 'New customer'}
      </p>
      {flow.lookup?.lastCard && (
        <p style={{ marginBottom: '1rem', opacity: 0.75 }}>
          Last cut: {flow.lookup.lastCard.sides || '—'} / {flow.lookup.lastCard.top || '—'} / {flow.lookup.lastCard.beard || '—'}
        </p>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
        {services.map((s) => (
          <button
            key={s.id}
            onClick={() => onPick(s.id)}
            style={{ ...bigButton, minHeight: 80, textAlign: 'left', padding: '0.75rem' }}
          >
            <div style={{ fontWeight: 'bold' }}>{s.name}</div>
            <div style={{ opacity: 0.7 }}>{s.duration_minutes} min</div>
          </button>
        ))}
      </div>
      <button onClick={onCancel} style={{ ...bigButton, width: '100%' }}>
        Cancel
      </button>
    </div>
  );
}

function BarberStep({ barbers, queue, onPick, onCancel }) {
  const waitFor = (barberId) => queue?.barbers.find((b) => b.barberId === barberId)?.waitMinutes;

  return (
    <div style={{ maxWidth: 480 }}>
      <h1>Pick a barber</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
        <button
          onClick={() => onPick(null)}
          style={{ ...bigButton, minHeight: 80, textAlign: 'left', padding: '0.75rem', background: '#eef6ff' }}
        >
          <div style={{ fontWeight: 'bold' }}>Any barber</div>
          <div style={{ opacity: 0.7 }}>~{queue?.shared.waitMinutes ?? '…'} min</div>
        </button>
        {barbers.map((b) => (
          <button
            key={b.id}
            onClick={() => onPick(b.id)}
            style={{ ...bigButton, minHeight: 80, textAlign: 'left', padding: '0.75rem' }}
          >
            <div style={{ fontWeight: 'bold' }}>{b.display_name}</div>
            <div style={{ opacity: 0.7 }}>~{waitFor(b.id) ?? '…'} min</div>
          </button>
        ))}
      </div>
      <button onClick={onCancel} style={{ ...bigButton, width: '100%' }}>
        Cancel
      </button>
    </div>
  );
}
