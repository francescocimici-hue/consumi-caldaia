// Temperature giornaliere: archivio separato dal resto, cosi' una tabella mancante non rompe nulla.
import { supabase } from './data.js';

const LOCAL_KEY = 'cc-daily-temps';
export const TABLE = 'daily_temperatures';

export function isMissingTable(err) {
  const m = `${err?.code || ''} ${err?.message || ''}`;
  return /42P01|PGRST205|does not exist|schema cache/i.test(m);
}

function readLocal() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
  } catch {
    return [];
  }
}

/** Restituisce { rows, error }: gli errori non interrompono mai il resto dell'app. */
export async function loadDailyTemps() {
  if (!supabase) return { rows: readLocal(), error: null };
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(TABLE).select('date,avg_celsius').order('date').range(from, from + 999);
    if (error) return { rows: [], error };
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return { rows, error: null };
}

export async function saveDailyTemps(newRows, userId) {
  if (!newRows.length) return { error: null };
  if (!supabase) {
    const merged = new Map(readLocal().map(r => [r.date, r]));
    for (const r of newRows) merged.set(r.date, { date: r.date, avg_celsius: r.avg_celsius });
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify([...merged.values()].sort((a, b) => a.date.localeCompare(b.date))));
    } catch (error) {
      return { error };
    }
    return { error: null };
  }
  for (let i = 0; i < newRows.length; i += 500) {
    const chunk = newRows.slice(i, i + 500).map(r => ({ owner_id: userId, date: r.date, avg_celsius: r.avg_celsius }));
    const { error } = await supabase.from(TABLE).upsert(chunk, { onConflict: 'owner_id,date' });
    if (error) return { error };
  }
  return { error: null };
}
