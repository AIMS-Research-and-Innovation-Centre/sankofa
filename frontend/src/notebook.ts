import { useSyncExternalStore } from 'react';
import type { NotebookAnswer } from './api';

// One notebook per browser: chosen sources, the conversation, and saved notes.
// Browser storage is a convenience here; the notebook still works if it is unavailable.
export interface Message { id: string; question: string; answer?: NotebookAnswer; error?: string }
export interface Note { id: string; title: string; body: string; created: string }
export interface NotebookState { sources: string[]; muted: string[]; messages: Message[]; notes: Note[] }

const KEY = 'sankofa.notebook.v1';
const blank: NotebookState = { sources: [], muted: [], messages: [], notes: [] };
function load(): NotebookState {
  try { const saved = JSON.parse(localStorage.getItem(KEY) || 'null'); if (saved && Array.isArray(saved.sources)) return { ...blank, ...saved, messages: (saved.messages || []).filter((m: Message) => m.answer || m.error) }; } catch { /* Start empty. */ }
  return blank;
}
let state = load();
const listeners = new Set<() => void>();
function set(next: Partial<NotebookState>) {
  state = { ...state, ...next };
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* Not persisted. */ }
  listeners.forEach(l => l());
}
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
export const uid = () => Math.random().toString(36).slice(2, 10);

export const notebook = {
  get: () => state,
  add: (ids: string[]) => set({ sources: [...state.sources, ...ids.filter(id => !state.sources.includes(id))] }),
  remove: (id: string) => set({ sources: state.sources.filter(s => s !== id), muted: state.muted.filter(s => s !== id) }),
  toggle: (id: string) => state.sources.includes(id) ? notebook.remove(id) : notebook.add([id]),
  mute: (id: string) => set({ muted: state.muted.includes(id) ? state.muted.filter(s => s !== id) : [...state.muted, id] }),
  clearSources: () => set({ sources: [], muted: [] }),
  setMessages: (update: (messages: Message[]) => Message[]) => set({ messages: update(state.messages) }),
  clearChat: () => set({ messages: [] }),
  addNote: (title: string, body: string) => set({ notes: [{ id: uid(), title, body, created: new Date().toISOString() }, ...state.notes] }),
  updateNote: (id: string, body: string) => set({ notes: state.notes.map(n => n.id === id ? { ...n, body } : n) }),
  removeNote: (id: string) => set({ notes: state.notes.filter(n => n.id !== id) }),
};
export function useNotebook() { return useSyncExternalStore(subscribe, notebook.get, notebook.get); }
