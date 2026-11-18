// Dati e salvataggio: modalita' locale (solo questo browser) oppure cloud Supabase, con coda offline.
import { createClient } from '@supabase/supabase-js';
import { loadOutbox, saveOutbox, isNetworkError } from './sync.js';

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = URL && KEY ? createClient(URL, KEY) : null;

// I dati dello storico entrano nel pacchetto SOLO in modalita' locale (senza Supabase configurato).
// Con Supabase attivo questa riga viene eliminata in fase di build e lo storico resta nel database, dietro login.
export const loadDemo = import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
  ? null
  : () => import('../legacy-data.json').then(m => m.default);

export const TABLES = {
  records: 'consumption_records',
  events: 'household_events',
  purchases: 'stock_purchases',
  temps: 'monthly_temperatures'
};
const ORDER = { records: ['date', 'time'], events: ['date'], purchases: ['date'], temps: ['month'] };

const CACHE_KEY = 'cc-cache';
export function readCache(userId) {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return c && c.userId === userId ? c.data : null;
  } catch {
    return null;
  }
}
export function writeCache(userId, data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ userId, data }));
  } catch {
    /* archivio pieno o bloccato: si lavora senza copia offline */
  }
}
export function clearCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* niente da fare */
  }
}

export async function fetchAll() {
  const out = {};
  for (const [name, table] of Object.entries(TABLES)) {
    let q = supabase.from(table).select('*');
    for (const col of ORDER[name]) q = q.order(col, { ascending: true, nullsFirst: true });
    const { data, error } = await q.range(0, 4999);
    if (error) throw error;
    out[name] = data;
  }
  return out;
}

/** Applica alle liste appena scaricate le modifiche ancora in coda, cosi' non spariscono dallo schermo. */
export function applyOutbox(data, outbox) {
  const next = { ...data };
  for (const item of outbox) {
    const list = (next[item.name] || []).filter(r => r.id !== (item.row?.id ?? item.id));
    next[item.name] = item.op === 'upsert' ? [...list, item.row] : list;
  }
  return next;
}

/** Invia la coda; restituisce cio' che e' rimasto da inviare e l'eventuale errore non di rete. */
export async function flushOutbox(userId) {
  const queue = loadOutbox();
  const rest = [];
  let offline = false; // dopo un errore di rete si smette di provare: il resto resta in coda
  let error = null; // primo rifiuto "vero" del database
  for (const item of queue) {
    if (item.owner_id !== userId || offline) {
      rest.push(item);
      continue;
    }
    const table = TABLES[item.name];
    const res = item.op === 'upsert'
      ? await supabase.from(table).upsert(item.row, { onConflict: 'id' })
      : await supabase.from(table).delete().eq('id', item.id);
    if (!res.error) continue;
    if (isNetworkError(res.error)) {
      offline = true;
      rest.push(item);
    } else {
      // Il database ha rifiutato questa riga: la si scarta e si segnala, senza bloccare le altre.
      error = error || res.error;
      console.warn('Modifica scartata dal database', item, res.error);
    }
  }
  saveOutbox(rest);
  return { pending: rest.length, error, offline };
}

export { loadOutbox, saveOutbox, isNetworkError };
