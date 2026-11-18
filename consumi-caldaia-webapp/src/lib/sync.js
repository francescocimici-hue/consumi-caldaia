// Coda delle registrazioni fatte senza rete: restano nel telefono e partono quando torna il segnale.
const KEY = 'cc-outbox';

export function loadOutbox() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
export function saveOutbox(items) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* spazio finito o archivio bloccato: la coda resta solo in memoria per questa sessione */
  }
}

/** Vero se l'errore dipende dalla rete e non da una regola del database. */
export function isNetworkError(error) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg = String(error?.message || error || '');
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(msg);
}

export function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
