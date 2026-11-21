// Prove sui calcoli per intervallo e gradi giorno. Si lanciano con: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as d from './degreeDays.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} e' lontano da ${b}`);

test('date: mesi, anni e 29 febbraio', () => {
  assert.equal(d.addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(d.addDays('2025-02-28', 1), '2025-03-01');
  assert.equal(d.addDays('2025-12-31', 1), '2026-01-01');
  assert.equal(d.daysBetween('2025-10-26', '2025-10-27'), 1); // cambio ora legale
  assert.equal(d.daysBetween('2025-03-30', '2025-03-31'), 1);
});

test('intervalli: il primo carico e\' solo partenza e i carichi vicini si uniscono', () => {
  const recs = [
    { date: '2025-11-01', bags: 5 }, // partenza
    { date: '2025-11-03', bags: 2 }, // troppo vicino: si unisce al successivo
    { date: '2025-11-05', bags: 2 },
    { date: '2025-11-10', bags: 3 }, // 9 giorni dalla partenza: chiude il primo intervallo (2+2+3)
    { date: '2025-11-20', bags: 4 }  // 10 giorni
  ];
  const iv = d.buildIntervals(recs);
  assert.equal(iv.length, 2);
  assert.deepEqual(iv[0], { start: '2025-11-01', end: '2025-11-10', days: 9, bags: 7 });
  assert.deepEqual(iv[1], { start: '2025-11-10', end: '2025-11-20', days: 10, bags: 4 });
  assert.deepEqual(d.buildIntervals([{ date: '2025-11-01', bags: 3 }]), []);
});

test('piu\' registrazioni nello stesso giorno contano come un carico', () => {
  const l = d.loadsByDate([{ date: '2025-11-01', bags: 2 }, { date: '2025-11-01', bags: 3 }, { date: '2025-10-01', bags: 1 }]);
  assert.deepEqual(l, [{ date: '2025-10-01', bags: 1 }, { date: '2025-11-01', bags: 5 }]);
});

test('gradi giorno: conta solo il freddo sotto la soglia', () => {
  const iv = { start: '2025-12-01', end: '2025-12-04', days: 3, bags: 1 }; // giorni 2, 3, 4
  const temps = { '2025-12-02': 8, '2025-12-03': 18, '2025-12-04': 20 };
  const r = d.degreeDays(iv, temps, 18);
  near(r.gg, 10);
  assert.equal(r.usable, true);
});

test('gradi giorno: estate senza dati vale zero, inverno con troppi buchi non e\' utilizzabile', () => {
  const summer = d.degreeDays({ start: '2025-07-01', end: '2025-07-15', days: 14, bags: 1 }, {});
  assert.equal(summer.gg, 0);
  assert.equal(summer.usable, true);
  const holes = d.degreeDays({ start: '2025-12-01', end: '2025-12-11', days: 10, bags: 5 }, { '2025-12-02': 5, '2025-12-03': 5 });
  assert.equal(holes.usable, false);
  assert.equal(holes.gg, null);
});

test('gradi giorno: pochi buchi si riportano ai giorni completi', () => {
  const temps = {};
  for (let i = 2; i <= 10; i++) temps[d.addDays('2025-12-01', i - 1)] = 8; // manca solo il giorno 12-02? no: manca il primo
  const iv = { start: '2025-12-01', end: '2025-12-11', days: 10, bags: 5 };
  const r = d.degreeDays(iv, temps, 18); // 9 giorni noti da 10 gradi, 1 mancante
  assert.equal(r.missing, 1);
  near(r.gg, 100);
});

function synthetic({ a, k, noise = 0, round = false, weeks = 90 }) {
  const daily = [];
  const records = [];
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296 - 0.5);
  let day = '2023-10-01';
  records.push({ date: day, bags: 4 });
  for (let w = 0; w < weeks; w++) {
    let gg = 0, days = 0;
    for (let i = 0; i < 7; i++) {
      day = d.addDays(day, 1);
      days++;
      const doy = (Number(day.slice(5, 7)) - 1) * 30 + Number(day.slice(8, 10));
      const t = 10 + 11 * Math.cos(((doy - 15) / 365) * 2 * Math.PI) * -1 + rnd() * 3; // freddo a gennaio, caldo a luglio
      if (d.isHeatingDay(day)) daily.push({ date: day, avg_celsius: t });
      if (d.isHeatingDay(day)) gg += Math.max(0, d.BASE_TEMP - t);
    }
    let bags = a * days + k * gg + noise * rnd() * 2;
    if (round) bags = Math.round(bags);
    records.push({ date: day, bags: Math.max(bags, 0.0001) });
  }
  return { records, daily };
}

test('modello: ritrova i parametri esatti senza rumore', () => {
  const { records, daily } = synthetic({ a: 0.12, k: 0.045 });
  const res = d.analyze(records, daily);
  assert.ok(res.model.n > 60);
  near(res.model.k, 0.045, 1e-6);
  near(res.model.a, 0.12, 1e-6);
  near(res.model.r2, 1, 1e-6);
});

test('modello: con carichi arrotondati a ballini interi resta vicino al vero', () => {
  const { records, daily } = synthetic({ a: 0.12, k: 0.045, round: true });
  const { model } = d.analyze(records, daily);
  assert.ok(Math.abs(model.k - 0.045) / 0.045 < 0.12, `k=${model.k}`);
  assert.ok(model.r2 > 0.9, `r2=${model.r2}`);
});

test('modello: un consumo di base negativo viene riportato a zero', () => {
  const rows = [];
  for (let i = 0; i < 12; i++) rows.push({ days: 7, gg: 20 + i * 8, bags: 0.05 * (20 + i * 8) - 0.01 * i });
  const m = d.fitModel(rows);
  assert.ok(m.a >= 0);
});

test('scostamento: un intervallo anomalo risulta sopra il previsto', () => {
  const { records, daily } = synthetic({ a: 0.12, k: 0.045 });
  records[40].bags *= 2; // un carico doppio del previsto
  const res = d.analyze(records, daily);
  const worst = [...res.intervals].filter(i => i.deviationPct !== null).sort((x, y) => y.deviationPct - x.deviationPct)[0];
  assert.ok(worst.deviationPct > 50);
  assert.equal(worst.end, records[40].date);
});

test('dati reali: con temperature giornaliere ricavate dalle medie mensili il calcolo gira e da\' valori plausibili', () => {
  const legacy = JSON.parse(fs.readFileSync(new URL('../legacy-data.json', import.meta.url), 'utf8'));
  const daily = [];
  for (const t of legacy.temperatures) {
    const [y, m] = t.month.split('-').map(Number);
    for (let day = 1; day <= new Date(Date.UTC(y, m, 0)).getUTCDate(); day++) {
      const iso = `${t.month}-${String(day).padStart(2, '0')}`;
      if (d.isHeatingDay(iso)) daily.push({ date: iso, avg_celsius: t.avg_celsius });
    }
  }
  const res = d.analyze(legacy.records, daily);
  assert.ok(res.model && res.model.n >= 15, `n=${res.model && res.model.n}`);
  assert.ok(res.model.k > 0);
  assert.ok(res.model.r2 > 0.5, `r2=${res.model.r2}`);
});
