import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../api/client.js';
import { usePolling } from '../hooks/usePolling.js';

function QrPanel({ joinUrl }) {
  const [dataUrl, setDataUrl] = useState(null);

  useEffect(() => {
    if (!joinUrl) return;
    let cancelled = false;
    QRCode.toDataURL(joinUrl, { width: 200, margin: 1, color: { dark: '#000000', light: '#ffffff' } }).then(
      (url) => {
        if (!cancelled) setDataUrl(url);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [joinUrl]);

  if (!dataUrl) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '1.5rem',
        right: '1.5rem',
        background: '#fff',
        borderRadius: 12,
        padding: '0.75rem',
        textAlign: 'center',
      }}
    >
      <img src={dataUrl} alt="Scan to join the queue" width={160} height={160} />
      <div style={{ color: '#111', fontSize: '0.9rem', marginTop: '0.4rem', fontWeight: 'bold' }}>Scan to join</div>
    </div>
  );
}

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
    osc.onended = () => ctx.close();
  } catch {
    // Audio isn't critical to the display working; ignore failures.
  }
}

const fetchDisplay = () => api.get('/display');

export function Display() {
  const { data, connectionLost } = usePolling(fetchDisplay, 3000);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const previousTokensRef = useRef({});

  useEffect(() => {
    if (!data || !soundEnabled) return;
    const previous = previousTokensRef.current;
    let changed = false;
    for (const chair of data.chairs) {
      if (chair.servingToken !== undefined && previous[chair.barberId] !== undefined) {
        if (chair.servingToken !== previous[chair.barberId] && chair.servingToken !== null) {
          changed = true;
        }
      }
    }
    if (changed) beep();
    previousTokensRef.current = Object.fromEntries(data.chairs.map((c) => [c.barberId, c.servingToken]));
  }, [data, soundEnabled]);

  const enableSound = useCallback(() => {
    beep();
    setSoundEnabled(true);
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0a0a0a',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {!soundEnabled && (
        <button
          onClick={enableSound}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 10,
            background: 'rgba(0,0,0,0.85)',
            color: '#fff',
            fontSize: '2rem',
            border: 'none',
          }}
        >
          Tap to enable sound
        </button>
      )}

      {connectionLost && (
        <div
          style={{
            width: '100%',
            background: '#b91c1c',
            color: '#fff',
            textAlign: 'center',
            padding: '1rem',
            fontSize: '2rem',
            fontWeight: 'bold',
          }}
        >
          Connection lost
        </div>
      )}

      <h1 style={{ fontSize: '2rem', margin: '1rem 0 2rem', opacity: 0.8 }}>{data?.shopName || ''}</h1>

      <div
        style={{
          display: 'flex',
          gap: '3rem',
          justifyContent: 'center',
          flexWrap: 'wrap',
          width: '100%',
          padding: '0 2rem',
        }}
      >
        {data?.chairs.map((chair) => (
          <div key={chair.barberId} style={{ textAlign: 'center' }}>
            <div
              style={{
                fontSize: '25vh',
                fontWeight: 900,
                lineHeight: 1,
                color: chair.servingToken ? '#22d3ee' : '#444',
              }}
            >
              {chair.servingToken ?? '—'}
            </div>
            <div style={{ fontSize: '2rem', marginTop: '0.5rem', opacity: 0.85 }}>{chair.displayName}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 'auto', width: '100%', textAlign: 'center', padding: '3rem 0' }}>
        <div style={{ fontSize: '1.5rem', opacity: 0.6, marginBottom: '1rem' }}>Up next</div>
        <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          {data?.nextWaiting.map((token, i) => (
            <div
              key={`${token}-${i}`}
              style={{
                fontSize: '4rem',
                fontWeight: 700,
                background: '#1f2937',
                borderRadius: '1rem',
                padding: '0.5rem 1.5rem',
              }}
            >
              {token}
            </div>
          ))}
          {data && data.nextWaiting.length === 0 && <div style={{ fontSize: '1.5rem', opacity: 0.5 }}>Queue is empty</div>}
        </div>
      </div>

      <QrPanel joinUrl={data?.joinUrl} />
    </div>
  );
}
