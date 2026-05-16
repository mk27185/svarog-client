const SESSION_KEY = 'svarog_session_id';

export function readSessionId(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(SESSION_KEY);
}

export function writeSessionId(id: string | null): void {
  if (typeof localStorage === 'undefined') return;
  if (id === null) localStorage.removeItem(SESSION_KEY);
  else localStorage.setItem(SESSION_KEY, id);
}
