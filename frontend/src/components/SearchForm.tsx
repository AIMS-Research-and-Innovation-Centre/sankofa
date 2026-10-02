import type { FormEvent } from 'react';

export default function SearchForm({ value, onChange, onSubmit, label, button = 'Search', busy = false }: {
  value: string; onChange: (value: string) => void; onSubmit: () => void;
  label: string; button?: string; busy?: boolean;
}) {
  function submit(event: FormEvent) { event.preventDefault(); onSubmit(); }
  return <form className="search-form" onSubmit={submit} role="search">
    <label className="sr-only" htmlFor="primary-search">{label}</label>
    <input id="primary-search" type="search" value={value} onChange={event => onChange(event.target.value)} placeholder={label} autoComplete="off" />
    <button type="submit" disabled={busy}>{busy ? 'Working…' : button}</button>
  </form>;
}
