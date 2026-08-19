import { useEffect, useRef, useState } from 'react';

const FAILURE_THRESHOLD = 3;

/**
 * Polls fetchFn on an interval. Never clears the last known-good data on a
 * failed poll — after FAILURE_THRESHOLD consecutive failures it reports
 * connectionLost so the caller can show a banner instead of stale numbers
 * pretending to be live.
 */
export function usePolling(fetchFn, intervalMs = 3000) {
  const [data, setData] = useState(null);
  const [connectionLost, setConnectionLost] = useState(false);
  const failureCountRef = useRef(0);
  const fetchFnRef = useRef(fetchFn);
  fetchFnRef.current = fetchFn;

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const result = await fetchFnRef.current();
        if (cancelled) return;
        failureCountRef.current = 0;
        setConnectionLost(false);
        setData(result);
      } catch {
        if (cancelled) return;
        failureCountRef.current += 1;
        if (failureCountRef.current >= FAILURE_THRESHOLD) {
          setConnectionLost(true);
        }
      }
    }

    poll();
    const id = setInterval(poll, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [intervalMs]);

  return { data, connectionLost };
}
