// Analisi per intervallo tra due carichi: ballini caricati in rapporto al freddo accumulato (gradi giorno).
// Calcoli puri, senza React e senza Supabase, cosi' si provano da soli.

/** Temperatura sotto la quale la casa ha bisogno di riscaldamento (modificabile). */
export const BASE_TEMP = 18;
/** Mesi (1 = gennaio) in cui salviamo le temperature giornaliere: da ottobre ad aprile. */
export const HEATING_MONTHS = [10, 11, 12, 1, 2, 3, 4];
/** Un intervallo e' utilizzabile se manca al massimo questa quota di giorni di temperatura. */
export const MAX_MISSING_SHARE = 0.2;

const DAY = 864e5;
const toUTC = iso => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));

export const isHeatingDay = iso => HEATING_MONTHS.includes(Number(iso.slice(5, 7)));
export const daysBetween = (a, b) => Math.round((toUTC(b) - toUTC(a)) / DAY);
export function addDays(iso, n) {
  const d = new Date(toUTC(iso) + n * DAY);
  const p = x => String(x).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

/** Carichi raggruppati per giorno, in ordine di data. */
export function loadsByDate(records) {
  const m = new Map();
  for (const r of records) m.set(r.date, (m.get(r.date) || 0) + Number(r.bags));
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, bags]) => ({ date, bags }));
}

/**
 * Intervalli tra carichi. Si assume che ogni carico rimetta quanto e' stato consumato dal carico precedente:
 * i ballini caricati il giorno D contano per i giorni dopo l'ultimo carico fino a D compreso.
 * Gli intervalli piu' corti di `minDays` si uniscono al successivo, per ridurre il rumore.
 * Il primo carico non ha un "prima" misurabile e serve solo da partenza.
 */
export function buildIntervals(records, { minDays = 7 } = {}) {
  const loads = loadsByDate(records);
  const out = [];
  if (loads.length < 2) return out;
  let start = loads[0].date;
  let bags = 0;
  for (let i = 1; i < loads.length; i++) {
    bags += loads[i].bags;
    const days = daysBetween(start, loads[i].date);
    if (days >= minDays) {
      out.push({ start, end: loads[i].date, days, bags });
      start = loads[i].date;
      bags = 0;
    }
  }
  return out;
}

/** Temperature giornaliere come mappa 'AAAA-MM-GG' -> gradi. */
export function tempByDate(daily) {
  const m = {};
  for (const t of daily) m[t.date] = Number(t.avg_celsius);
  return m;
}

/**
 * Gradi giorno dell'intervallo (giorni dopo `start`, fino a `end` compreso).
 * Fuori dalla stagione di riscaldamento non si salvano temperature e si conta zero.
 * Se dentro la stagione mancano dei giorni, i gradi giorno si riportano ai giorni completi.
 */
export function degreeDays(interval, temps, base = BASE_TEMP) {
  let gg = 0;
  let heatingDays = 0;
  let missing = 0;
  for (let i = 1; i <= interval.days; i++) {
    const d = addDays(interval.start, i);
    if (!isHeatingDay(d)) continue;
    heatingDays++;
    const t = temps[d];
    if (t === undefined) missing++;
    else gg += Math.max(0, base - t);
  }
  const known = heatingDays - missing;
  const usable = heatingDays === 0 || (missing / heatingDays <= MAX_MISSING_SHARE && known > 0);
  const scaled = known > 0 && missing > 0 ? gg * (heatingDays / known) : gg;
  return { gg: usable ? scaled : null, heatingDays, missing, usable };
}

/**
 * Minimi quadrati di  ballini = a * giorni + k * gg.  a = consumo di base al giorno, k = ballini per grado giorno.
 * Se la soluzione libera da' un consumo di base negativo (senza senso fisico) si impone a = 0.
 */
export function fitModel(rows) {
  const n = rows.length;
  if (n < 4) return null;
  let sdd = 0, sdg = 0, sgg = 0, sdb = 0, sgb = 0, sb = 0, sbb = 0;
  for (const r of rows) {
    sdd += r.days * r.days;
    sdg += r.days * r.gg;
    sgg += r.gg * r.gg;
    sdb += r.days * r.bags;
    sgb += r.gg * r.bags;
    sb += r.bags;
    sbb += r.bags * r.bags;
  }
  const det = sdd * sgg - sdg * sdg;
  if (sgg === 0) return null;
  let a = 0, k = 0, constrained = false, covKK;
  if (Math.abs(det) > 1e-9) {
    a = (sgg * sdb - sdg * sgb) / det;
    k = (sdd * sgb - sdg * sdb) / det;
    covKK = sdd / det; // elemento (k,k) di (X'X)^-1
  }
  if (!(det > 1e-9) || a < 0) {
    a = 0;
    k = sgb / sgg;
    covKK = 1 / sgg;
    constrained = true;
  }
  let sse = 0;
  for (const r of rows) sse += (r.bags - a * r.days - k * r.gg) ** 2;
  const sst = sbb - (sb * sb) / n;
  const params = constrained ? 1 : 2;
  const sigma = Math.sqrt(sse / Math.max(1, n - params));
  return { a, k, r2: sst > 0 ? 1 - sse / sst : 0, n, sigma, seK: sigma * Math.sqrt(covKK), constrained };
}

/** Analisi completa: intervalli, gradi giorno, modello e scostamento di ogni intervallo dal previsto. */
export function analyze(records, daily, { base = BASE_TEMP, minDays = 7 } = {}) {
  const temps = tempByDate(daily);
  const rows = buildIntervals(records, { minDays }).map(iv => {
    const d = degreeDays(iv, temps, base);
    return { ...iv, gg: d.gg, heatingDays: d.heatingDays, missing: d.missing, usable: d.usable };
  });
  const used = rows.filter(r => r.usable);
  const model = fitModel(used);
  const intervals = rows.map(r => {
    if (!model || !r.usable) return { ...r, expected: null, deviationPct: null };
    const expected = model.a * r.days + model.k * r.gg;
    return { ...r, expected, deviationPct: expected > 0 ? ((r.bags - expected) / expected) * 100 : null };
  });
  return { intervals, model, usedCount: used.length, skippedCount: rows.length - used.length, base };
}
