import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';

const bigButton = {
  minHeight: 60,
  fontSize: '1.1rem',
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: '#f6f8fa',
  cursor: 'pointer',
};

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 20,
  padding: '1rem',
};

const panelStyle = {
  background: '#fff',
  borderRadius: 16,
  padding: '1.25rem 1.5rem',
  width: '100%',
  maxWidth: 1040,
  maxHeight: '95vh',
  overflowY: 'auto',
  boxSizing: 'border-box',
};

function PresetRow({ label, options, value, onPick }) {
  return (
    <div style={{ marginBottom: '0.65rem' }}>
      <div style={{ fontWeight: 'bold', marginBottom: '0.3rem' }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
        {options.map((opt) => (
          <button
            key={opt.label}
            onClick={() => onPick(opt.label)}
            style={{
              ...bigButton,
              padding: '0 0.6rem',
              background: value === opt.label ? '#0969da' : '#f6f8fa',
              color: value === opt.label ? '#fff' : '#000',
              fontWeight: value === opt.label ? 'bold' : 'normal',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function StyleCardScreen({ visit, customer, entry, defaultGrowOutDays, presets, onClose }) {
  const [lastCard, setLastCard] = useState(undefined); // undefined = loading, null = none
  const [sides, setSides] = useState('');
  const [top, setTop] = useState('');
  const [beard, setBeard] = useState('');
  const [growOutDays, setGrowOutDays] = useState(defaultGrowOutDays);
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    api
      .get(`/customers/${customer.id}/style-cards?limit=1`)
      .then((data) => setLastCard(data.styleCards[0] || null))
      .catch(() => setLastCard(null));
  }, [customer.id]);

  function useSameAsLastTime() {
    if (!lastCard) return;
    setSides(lastCard.sides || '');
    setTop(lastCard.top || '');
    setBeard(lastCard.beard || '');
    setGrowOutDays(lastCard.grow_out_days);
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const { styleCard } = await api.post('/style-cards', {
        visit_id: visit.id,
        sides,
        top,
        beard,
        notes: notes || null,
        grow_out_days: growOutDays,
      });
      if (photo) {
        await api.upload(`/style-cards/${styleCard.id}/photo`, photo);
      }
      onClose();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.5rem' }}>
          {customer.name || 'Walk-in'} — #{entry.token_number}
        </h1>

        {lastCard && (
          <div
            style={{
              background: '#eef6ff',
              borderRadius: 10,
              padding: '0.5rem 0.75rem',
              marginBottom: '0.65rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}
          >
            <div style={{ fontSize: '0.95rem' }}>
              Last time ({lastCard.business_date}, {lastCard.barber_name}): {lastCard.sides || '—'} / {lastCard.top || '—'} / {lastCard.beard || '—'}
            </div>
            <button onClick={useSameAsLastTime} style={{ ...bigButton, minHeight: 52, background: '#0969da', color: '#fff', fontWeight: 'bold' }}>
              Same as last time
            </button>
          </div>
        )}

        {error && <p style={{ color: 'crimson' }}>{error}</p>}

        <div style={{ display: 'grid', gridTemplateColumns: '2.1fr 1fr', gap: '1.25rem' }}>
          <div>
            <PresetRow label="Sides" options={presets.sides} value={sides} onPick={setSides} />
            <PresetRow label="Top" options={presets.top} value={top} onPick={setTop} />
            <PresetRow label="Beard" options={presets.beard} value={beard} onPick={setBeard} />
          </div>

          <div>
            <div style={{ marginBottom: '0.65rem' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '0.3rem' }}>Rebook in {growOutDays} days</div>
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <button onClick={() => setGrowOutDays((d) => Math.max(1, d - 1))} style={{ ...bigButton, width: 60 }}>
                  −
                </button>
                <div style={{ fontSize: '1.3rem', minWidth: 44, textAlign: 'center' }}>{growOutDays}</div>
                <button onClick={() => setGrowOutDays((d) => d + 1)} style={{ ...bigButton, width: 60 }}>
                  +
                </button>
              </div>
            </div>

            <div style={{ marginBottom: '0.65rem' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '0.3rem' }}>Note (optional)</div>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                style={{ width: '100%', minHeight: 44, fontSize: '1rem', padding: '0.4rem', boxSizing: 'border-box' }}
              />
            </div>

            {customer.consentPhotos && (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: 'none' }}
                  onChange={(e) => setPhoto(e.target.files[0] || null)}
                />
                <button onClick={() => fileInputRef.current?.click()} style={{ ...bigButton, width: '100%' }}>
                  {photo ? '📷 Photo added' : '📷 Add photo'}
                </button>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
          <button onClick={onClose} disabled={saving} style={{ ...bigButton, flex: 1 }}>
            Skip
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ ...bigButton, flex: 2, background: '#16a34a', color: '#fff', fontWeight: 'bold' }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
