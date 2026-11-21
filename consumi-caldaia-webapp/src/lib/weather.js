// Temperature giornaliere da Open-Meteo (gratuito, senza chiave). Dal dispositivo escono solo coordinate e date.
import { LOCATION } from '../config.js';
import { addDays, daysBetween, isHeatingDay } from './degreeDays.js';

const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE_LAG = 6; // l'archivio e' completo con circa 5 giorni di ritardo

function url(base, extra) {
  const p = new URLSearchParams({
    latitude: String(LOCATION.latitude),
    longitude: String(LOCATION.longitude),
    elevation: String(LOCATION.elevation),
    daily: 'temperature_2m_mean',
    timezone: 'Europe/Rome',
    ...extra
  });
  return `${base}?${p}`;
}

async function getDaily(u, fetchFn) {
  const res = await fetchFn(u);
  if (!res.ok) throw new Error(`Servizio meteo: risposta ${res.status}`);
  const j = await res.json();
  const times = j.daily?.time || [];
  const vals = j.daily?.temperature_2m_mean || [];
  const out = [];
  times.forEach((date, i) => {
    const v = vals[i];
    if (v !== null && v !== undefined && Number.isFinite(Number(v))) out.push({ date, avg_celsius: Math.round(Number(v) * 100) / 100 });
  });
  return out;
}

/** Giorni di riscaldamento senza temperatura tra `from` e `to` compresi. */
export function missingDays(from, to, known) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (isHeatingDay(d) && !known.has(d)) out.push(d);
  return out;
}

/**
 * Scarica le temperature mancanti da `from` a `today` (ottobre-aprile). Restituisce solo righe nuove.
 * @param {Set<string>} known date gia' salvate
 */
export async function fetchMissing(from, today, known, fetchFn = (...a) => fetch(...a)) {
  const missing = missingDays(from, today, known);
  if (!missing.length) return [];
  const start = missing[0];
  const archiveEnd = addDays(today, -ARCHIVE_LAG);
  const rows = new Map();
  if (start <= archiveEnd) {
    for (const r of await getDaily(url(ARCHIVE, { start_date: start, end_date: archiveEnd }), fetchFn)) rows.set(r.date, r);
  }
  const recentStart = start > archiveEnd ? start : addDays(archiveEnd, 1);
  if (recentStart <= today) {
    const past = Math.min(92, daysBetween(recentStart, today) + 1);
    for (const r of await getDaily(url(FORECAST, { past_days: String(past), forecast_days: '1' }), fetchFn)) {
      if (r.date >= recentStart && r.date <= today) rows.set(r.date, r);
    }
  }
  const wanted = new Set(missing);
  return [...rows.values()].filter(r => wanted.has(r.date)).sort((a, b) => a.date.localeCompare(b.date));
}
