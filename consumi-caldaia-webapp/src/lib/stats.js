// Calcoli puri sui dati: nessuna dipendenza da React o da Supabase, cosi' si possono provare da soli.

export const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
export const MONTHS_LONG = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

export const spend = r => Number(r.bags) * Number(r.price_per_bag);
const yearOf = d => Number(d.slice(0, 4));
const monthOf = d => Number(d.slice(5, 7)) - 1;

/** Data di oggi nel fuso del dispositivo, come AAAA-MM-GG (toISOString userebbe l'ora UTC). */
export function localISO(date = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

export function yearsOf(records) {
  return [...new Set(records.map(r => yearOf(r.date)))].sort((a, b) => a - b);
}

/** Ballini e spesa di ogni mese dell'anno. */
export function monthly(records, year) {
  const bal = Array(12).fill(0);
  const sp = Array(12).fill(0);
  for (const r of records) {
    if (yearOf(r.date) !== year) continue;
    bal[monthOf(r.date)] += Number(r.bags);
    sp[monthOf(r.date)] += spend(r);
  }
  return { bal, sp };
}

/** Giorno (MM-GG) fino a cui contare: oggi per l'anno in corso, fine anno per gli anni passati. */
export function cutoffFor(year, todayISO) {
  return year === yearOf(todayISO) ? todayISO.slice(5) : '12-31';
}

/**
 * Totali dell'anno fino al giorno `cutoff` (MM-GG, di default fine anno).
 * Per confrontare due anni a parita' di data, passa lo stesso `cutoff` a entrambi.
 */
export function period(records, year, cutoff = '12-31') {
  const isLeap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  if (cutoff === '02-29' && !isLeap) cutoff = '02-28';
  let bags = 0;
  let sp = 0;
  for (const r of records) {
    if (yearOf(r.date) === year && r.date.slice(5) <= cutoff) {
      bags += Number(r.bags);
      sp += spend(r);
    }
  }
  const days = Math.round((Date.parse(`${year}-${cutoff}`) - Date.parse(`${year}-01-01`)) / 864e5) + 1;
  return { bags, spend: sp, days, cutoff };
}

/** Variazione percentuale; null se manca il termine di confronto. */
export function pctDelta(cur, prev) {
  if (!prev) return null;
  return ((cur - prev) / prev) * 100;
}

/** Ultimi cambi di prezzo per tipo di pellet, dal piu' recente. */
export function priceChanges(records, limit = 3) {
  const sorted = [...records].sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  const last = {};
  const out = [];
  for (const r of sorted) {
    const p = Number(r.price_per_bag);
    if (last[r.pellet_type] !== undefined && last[r.pellet_type] !== p) {
      out.push({ date: r.date, type: r.pellet_type, from: last[r.pellet_type], to: p });
    }
    last[r.pellet_type] = p;
  }
  return out.slice(-limit).reverse();
}

/** Ultimo prezzo registrato per un tipo di pellet ('' se mai usato). */
export function lastPrice(records, type) {
  const rows = records.filter(r => r.pellet_type === type).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  return rows.length ? Number(rows.at(-1).price_per_bag) : '';
}

/** Ultimo anno completo presente nei dati (serve da riferimento per la stima delle scorte). */
export function lastFullYear(records, todayISO) {
  const done = yearsOf(records).filter(y => y < yearOf(todayISO));
  return done.length ? done.at(-1) : null;
}

/**
 * Giorno in cui finisce la scorta, se da oggi si consuma come nell'ultimo anno completo.
 * Restituisce null se mancano dati di riferimento o la scorta dura piu' di due anni.
 */
export function runOutDate(stock, records, todayISO) {
  const base = lastFullYear(records, todayISO);
  if (base === null) return null;
  const rate = monthly(records, base).bal;
  const d = new Date(`${todayISO}T00:00:00`);
  let left = stock;
  if (left <= 0) return d;
  for (let i = 0; i < 730; i++) {
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    left -= rate[d.getMonth()] / daysInMonth;
    if (left <= 0) return d;
    d.setDate(d.getDate() + 1);
  }
  return null;
}

/** Scorta stimata: ballini acquistati meno ballini registrati dal primo acquisto in poi. */
export function stockLevel(records, purchases) {
  if (!purchases.length) return { bought: 0, used: 0, stock: 0 };
  const first = purchases.map(p => p.date).sort()[0];
  const bought = purchases.reduce((s, p) => s + Number(p.bags), 0);
  const used = records.filter(r => r.date >= first).reduce((s, r) => s + Number(r.bags), 0);
  return { bought, used, stock: bought - used };
}

/** Temperature come mappa 'AAAA-MM' -> gradi. */
export function tempMap(temps) {
  const m = {};
  for (const t of temps) m[t.month] = Number(t.avg_celsius);
  return m;
}
export const monthKey = (year, month0) => `${year}-${String(month0 + 1).padStart(2, '0')}`;

/** Spesa accumulata da gennaio, un punto per mese (anno in corso: fino al mese corrente). */
export function cumulativeSpend(records, year, todayISO) {
  const sp = monthly(records, year).sp;
  const last = year === yearOf(todayISO) ? Number(todayISO.slice(5, 7)) - 1 : 11;
  let acc = 0;
  const out = [];
  for (let i = 0; i <= last; i++) {
    acc += sp[i];
    out.push(acc);
  }
  return out;
}

/** Punti (temperatura, ballini) dei mesi completi con temperatura nota. */
export function tempPoints(records, temps, todayISO) {
  const tm = tempMap(temps);
  const pts = [];
  for (const year of yearsOf(records)) {
    const bal = monthly(records, year).bal;
    for (let m = 0; m < 12; m++) {
      const t = tm[monthKey(year, m)];
      const partial = year === yearOf(todayISO) && m >= Number(todayISO.slice(5, 7)) - 1;
      if (t !== undefined && !partial && bal[m] > 0) pts.push({ year, month: m, t, bags: bal[m] });
    }
  }
  return pts;
}

/** Retta dei minimi quadrati: bags = intercept + slope * t, con coefficiente di correlazione r. */
export function regression(points) {
  const n = points.length;
  if (n < 3) return null;
  const sx = points.reduce((a, p) => a + p.t, 0);
  const sy = points.reduce((a, p) => a + p.bags, 0);
  const sxx = points.reduce((a, p) => a + p.t * p.t, 0);
  const syy = points.reduce((a, p) => a + p.bags * p.bags, 0);
  const sxy = points.reduce((a, p) => a + p.t * p.bags, 0);
  const den = n * sxx - sx * sx;
  if (den === 0) return null;
  const slope = (n * sxy - sx * sy) / den;
  const intercept = (sy - slope * sx) / n;
  const varY = n * syy - sy * sy;
  const r = varY === 0 ? 0 : (n * sxy - sx * sy) / Math.sqrt(den * varY);
  return { slope, intercept, r, n };
}

/** Progressivi di spesa e ballini per anno, riga per riga, in ordine cronologico. */
export function progressives(records) {
  const sorted = [...records].sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  const acc = {};
  const out = new Map();
  for (const r of sorted) {
    const y = yearOf(r.date);
    acc[y] = acc[y] || { ps: 0, pb: 0 };
    acc[y].ps += spend(r);
    acc[y].pb += Number(r.bags);
    out.set(r.id, { ps: acc[y].ps, pb: acc[y].pb });
  }
  return out;
}

/** Riepilogo per tipo di pellet. */
export function pelletSummary(records) {
  const m = {};
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));
  for (const r of sorted) {
    const o = (m[r.pellet_type] = m[r.pellet_type] || { type: r.pellet_type, bags: 0, spend: 0, first: r.date, last: r.date, lastPrice: 0 });
    o.bags += Number(r.bags);
    o.spend += spend(r);
    o.last = r.date;
    o.lastPrice = Number(r.price_per_bag);
  }
  return Object.values(m).sort((a, b) => b.bags - a.bags);
}
