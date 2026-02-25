import { useState, useEffect, useCallback, useRef } from 'react';

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  (typeof window !== 'undefined' ? window.MY_GLOBAL_CONFIG?.apiUrl : '') ||
  'http://localhost:4000'
).replace(/\/+$/, '');

const ENDPOINT = `${API_BASE}/api/v1/customer/ecosystem-summary`;

const REFETCH_DEBOUNCE_MS = 800;

/**
 * Fetches customer ecosystem summary from GET /customer/ecosystem-summary.
 * Handles loading/error, cache, refetch, and prevents duplicate in-flight requests.
 * Use refetch after OFFER_REDEEMED, CREDITS_EARNED, CREDITS_USED, TOKEN_UPDATED.
 * @param {{ token: string | null, enabled?: boolean }} options
 * @returns {{ data: object | null, loading: boolean, error: string | null, refetch: () => void }}
 */
export function useEcosystemSummary({ token, enabled = true }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const inFlightRef = useRef(false);
  const abortRef = useRef(null);
  const debounceTimerRef = useRef(null);

  const fetchSummary = useCallback(async (isRefetch = false) => {
    if (!token || !enabled) {
      if (!enabled) setLoading(false);
      return;
    }
    if (inFlightRef.current) return;

    inFlightRef.current = true;
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    if (!isRefetch) setLoading(true);
    setError(null);

    try {
      const res = await fetch(ENDPOINT, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        signal: abortRef.current.signal,
      });

      const raw = await res.text();
      let payload = {};
      try {
        payload = raw ? JSON.parse(raw) : {};
      } catch (_) {
        payload = { success: false, error: 'Invalid response' };
      }

      if (res.ok && payload.success && payload.data) {
        setData(payload.data);
        setError(null);
      } else {
        setData(null);
        setError(payload.error || payload.message || 'Unable to load account summary');
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      setData(null);
      setError(err.message || 'Unable to load account summary');
    } finally {
      inFlightRef.current = false;
      abortRef.current = null;
      setLoading(false);
    }
  }, [token, enabled]);

  useEffect(() => {
    fetchSummary(false);
    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [fetchSummary]);

  const refetch = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      fetchSummary(true);
    }, REFETCH_DEBOUNCE_MS);
  }, [fetchSummary]);

  return { data, loading, error, refetch };
}
