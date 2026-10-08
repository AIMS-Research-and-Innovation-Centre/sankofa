import { FormEvent, useState } from 'react';
import { login, signup } from '../api';

export default function SignIn({ navigate }: { navigate: (href: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      if (mode === 'signup') { await signup(email, password, name); setError('Account created. An AIMS administrator must approve it before you can sign in.'); }
      else { await login(email, password); navigate('/'); }
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Sign-in failed.'); }
    finally { setBusy(false); }
  }
  return <article className="reading-page auth-page">
    <p className="eyebrow">AIMS repository</p><h1>{mode === 'signin' ? 'Sign in once' : 'Create a Sankofa account'}</h1>
    <p className="page-description">Sankofa manages your account. No external repository account is required.</p>
    <form className="auth-form" onSubmit={submit}>
      {mode === 'signup' && <label>Name<input required autoComplete="name" value={name} onChange={e => setName(e.target.value)} /></label>}
      <label>Email<input required type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label>Password<input required minLength={mode === 'signup' ? 10 : 1} type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button" disabled={busy}>{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}</button>
    </form>
    <button className="text-button" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); }}>{mode === 'signin' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}</button>
  </article>;
}
