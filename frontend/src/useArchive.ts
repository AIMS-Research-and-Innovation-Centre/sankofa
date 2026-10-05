import { useEffect, useState } from 'react';
import { allTheses, errorMessage, type Thesis } from './api';

/** The shared archive snapshot, with loading and error state. */
export function useArchive() {
  const [records, setRecords] = useState<Thesis[]>([]); const [busy, setBusy] = useState(true);
  const [error, setError] = useState(''); const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true; setBusy(true); setError('');
    allTheses().then(rows => { if (active) setRecords(rows); }).catch(e => { if (active) setError(errorMessage(e)); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [attempt]);
  return { records, busy, error, retry: () => setAttempt(n => n + 1) };
}
