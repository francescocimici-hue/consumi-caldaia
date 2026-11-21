// Risposte in parole semplici, ricavate dal modello per intervallo: durata scorta, fabbisogno stagione, andamento.
import { addDays, daysBetween, isHeatingDay, tempByDate } from './degreeDays.js';

const md = iso => iso.slice(5);

/** Temperatura "normale" per ogni giorno dell'anno ('MM-GG'): media degli anni salvati, su una finestra di +-3 giorni. */
export function normalTemps(daily, window = 3) {
  const sum = {};
  const cnt = {};
  for (const d of daily) {
    const t = Number(d.avg_celsius);
    for (let o = -window; o <= window; o++) {
      const k = md(addDays(d.date, o));
      sum[k] = (sum[k] || 0) + t;
      cnt[k] = (cnt[k] || 0) + 1;
    }
  }
  const out = {};
  for (const k of Object.keys(sum)) out[k] = sum[k] / cnt[k];
  return out;
}

const normalAt = (normal, date) => normal[md(date)] ?? normal[md(addDays(date, -1))];

/** Ballini attesi in un giorno: consumo di base piu' il freddo (solo nei mesi di riscaldamento). */
export function dayUse(model, date, temp, base) {
  const dd = isHeatingDay(date) && temp !== undefined ? Math.max(0, base - temp) : 0;
  return model.a + model.k * dd;
}

function sumRange(from, to, fn) {
  let s = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) s += fn(d);
  return s;
}

/** Quanto consumi al giorno con il freddo degli ultimi 7 giorni noti (oppure con la temperatura normale). */
export function currentRate(model, daily, todayISO, normal, base) {
  const recent = daily.filter(d => d.date <= todayISO && daysBetween(d.date, todayISO) < 7);
  const t = recent.length >= 3
    ? recent.reduce((s, d) => s + Number(d.avg_celsius), 0) / recent.length
    : normalAt(normal, todayISO);
  return model.a + model.k * (isHeatingDay(todayISO) && t !== undefined ? Math.max(0, base - t) : 0);
}

/** Giorno in cui finisce la scorta: i primi 7 giorni come adesso, poi con le temperature normali. */
export function runOutForecast(stock, todayISO, model, daily, normal, base) {
  const rateNow = currentRate(model, daily, todayISO, normal, base);
  if (stock <= 0) return { date: todayISO, days: 0, rateNow };
  let left = stock;
  let day = todayISO;
  for (let i = 0; i < 400; i++) {
    left -= i < 7 ? rateNow : dayUse(model, day, normalAt(normal, day), base);
    if (left <= 1e-9) return { date: day, days: i + 1, rateNow };
    day = addDays(day, 1);
  }
  return { date: null, days: null, rateNow };
}

/** Stagioni di riscaldamento complete (1 ottobre - 30 aprile) con consumo reale e consumo atteso dal freddo che ha fatto. */
export function pastSeasons(records, daily, model, base, normal, todayISO) {
  if (!records.length) return [];
  const temps = tempByDate(daily);
  const firstYear = Number(records.reduce((m, r) => (r.date < m ? r.date : m), records[0].date).slice(0, 4));
  const out = [];
  for (let y = firstYear - 1; y <= Number(todayISO.slice(0, 4)); y++) {
    const from = `${y}-10-01`;
    const to = `${y + 1}-04-30`;
    if (to >= todayISO || from < records.reduce((m, r) => (r.date < m ? r.date : m), records[0].date)) continue;
    const real = records.filter(r => r.date >= from && r.date <= to).reduce((s, r) => s + Number(r.bags), 0);
    const expected = sumRange(from, to, d => dayUse(model, d, temps[d] ?? normalAt(normal, d), base));
    const gg = sumRange(from, to, d => Math.max(0, base - (temps[d] ?? normalAt(normal, d) ?? base)));
    out.push({ label: `${y}-${String(y + 1).slice(2)}`, real, expected, gg });
  }
  return out;
}

/** Fabbisogno di un inverno con temperature normali (1 ottobre - 30 aprile). */
export function typicalWinter(model, normal, base, year = 2000) {
  return sumRange(`${year}-10-01`, `${year + 1}-04-30`, d => dayUse(model, d, normalAt(normal, d), base));
}

/**
 * Stagione in corso (o l'ultima): consumo reale contro quello atteso per il freddo che ha fatto.
 * Si misura tra l'ultimo carico prima del 1 ottobre e l'ultimo carico registrato: i ballini caricati
 * in quel periodo rimettono quanto e' stato consumato, quindi i due estremi sono confrontabili.
 */
export function seasonSoFar(records, daily, model, base, normal, todayISO) {
  const m = Number(todayISO.slice(5, 7));
  const y = m >= 10 ? Number(todayISO.slice(0, 4)) : Number(todayISO.slice(0, 4)) - (m <= 4 ? 1 : 0);
  const inSeason = m >= 10 || m <= 4;
  const from = `${y}-10-01`;
  const end = `${y + 1}-04-30`;
  const limit = inSeason ? todayISO : end;
  const before = records.filter(r => r.date <= from).map(r => r.date);
  const within = records.filter(r => r.date > from && r.date <= limit).map(r => r.date);
  if (!before.length || !within.length) return null;
  const start = before.reduce((a, d) => (d > a ? d : a));
  const last = within.reduce((a, d) => (d > a ? d : a));
  if (daysBetween(start, last) < 14) return null;
  const temps = tempByDate(daily);
  const real = records.filter(r => r.date > start && r.date <= last).reduce((s, r) => s + Number(r.bags), 0);
  const expected = sumRange(addDays(start, 1), last, d => dayUse(model, d, temps[d] ?? normalAt(normal, d), base));
  if (!(expected > 0)) return null;
  return { label: `${y}-${String(y + 1).slice(2)}`, inSeason, from: start, to: last, real, expected, pct: ((real - expected) / expected) * 100 };
}

/** Costo medio al ballino negli ultimi 365 giorni. */
export function avgCost(records, todayISO) {
  const from = addDays(todayISO, -365);
  let bags = 0;
  let cost = 0;
  for (const r of records) {
    if (r.date < from || r.date > todayISO) continue;
    bags += Number(r.bags);
    cost += Number(r.bags) * Number(r.price_per_bag || 0);
  }
  return bags > 0 && cost > 0 ? cost / bags : null;
}
