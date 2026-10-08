import { useEffect, useState } from 'react';
import { AuthUser, currentUser, logout, workflowAction, workflowItems } from '../api';

type RecordMap = Record<string, any>;
function label(item: RecordMap): string {
  return item.name || item.title || item.item?.name || item.item?.metadata?.['dc.title']?.[0]?.value || item.id || item.uuid || 'Untitled submission';
}

export default function Admin({ navigate }: { navigate: (href: string) => void }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [items, setItems] = useState<RecordMap[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { Promise.all([currentUser(), workflowItems()]).then(([u, work]) => { setUser(u); setItems(work); }).catch(e => setError(e instanceof Error ? e.message : 'Could not load workflow.')); }, []);
  async function act(item: RecordMap, action: string) {
    const id = item.id || item.uuid; if (!id) return; setBusy(`${id}:${action}`); setError('');
    try { await workflowAction(id, action); setItems(await workflowItems()); } catch (e) { setError(e instanceof Error ? e.message : 'Action failed.'); } finally { setBusy(null); }
  }
  if (!user) return <article className="reading-page"><h1>Administration</h1><p>{error || 'Sign in with a librarian or editor account to continue.'}</p><a className="button" href="#/login">Sign in</a></article>;
  return <article className="reading-page admin-page">
    <div className="page-header"><p className="eyebrow">Sankofa administration</p><h1>Repository workflow</h1><p className="page-description">Review DSpace submissions, approve metadata, and publish only authorised records.</p></div>
    <div className="button-row"><span className="status">Signed in as {String(user.user.email || user.user.name || 'AIMS user')} · {user.role}</span><button className="ghost" onClick={async () => { await logout(); navigate('/'); }}>Sign out</button></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {items.length === 0 ? <p className="empty">No submissions are waiting for review.</p> : <ul className="workflow-list">{items.map(item => <li key={item.id || item.uuid} className="workflow-card"><div><strong>{label(item)}</strong><p>DSpace workflow item {item.id || item.uuid}</p></div><div className="button-row"><button className="button" disabled={!!busy} onClick={() => act(item, 'accept')}>{busy === `${item.id || item.uuid}:accept` ? 'Accepting…' : 'Accept'}</button><button className="ghost" disabled={!!busy} onClick={() => act(item, 'reject')}>Return</button></div></li>)}</ul>}
  </article>;
}
