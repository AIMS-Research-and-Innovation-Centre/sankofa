import { FormEvent, useState } from 'react';
import { login } from '../api';

export default function SignIn({ navigate }: { navigate: (href: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await login(email, password); navigate('/'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Sign-in failed.'); }
    finally { setBusy(false); }
  }
  return <article className="reading-page auth-page">
    <p className="eyebrow">AIMS repository</p><h1>Sign in once</h1>
    <p className="page-description">Use your AIMS repository account. Sankofa and DSpace share this sign-in.</p>
    <form className="auth-form" onSubmit={submit}>
      <label>Email<input required type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label>Password<input required type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
  </article>;
}
