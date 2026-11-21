import test from 'node:test';
import assert from 'node:assert/strict';
import * as f from './forecast.js';
import { addDays } from './degreeDays.js';

const model = { a: 0.15, k: 0.065 };
function winterTemps(year, t) {
  const out = [];
  for (let d = `${year}-10-01`; d <= `${year + 1}-04-30`; d = addDays(d, 1)) out.push({ date: d, avg_celsius: t });
  return out;
}

test('normale: media tra gli anni', () => {
  const n = f.normalTemps([...winterTemps(2024, 6), ...winterTemps(2025, 10)]);
  assert.ok(Math.abs(n['01-15'] - 8) < 1e-9);
});

test('consumo giornaliero: solo base d\'estate, base piu\' freddo d\'inverno', () => {
  assert.ok(Math.abs(f.dayUse(model, '2026-07-10', 5, 18) - 0.15) < 1e-9);
  assert.ok(Math.abs(f.dayUse(model, '2026-01-10', 8, 18) - (0.15 + 0.065 * 10)) < 1e-9);
});

test('fine scorta: con consumo costante di 0,8 al giorno 8 ballini durano 10 giorni', () => {
  const daily = winterTemps(2025, 8);
  const normal = f.normalTemps(daily);
  const r = f.runOutForecast(8, '2026-01-10', model, daily, normal, 18);
  assert.equal(r.days, 10);
  assert.equal(r.date, '2026-01-19');
  assert.equal(f.runOutForecast(0, '2026-01-10', model, daily, normal, 18).days, 0);
});

test('inverno tipico e stagioni passate', () => {
  const daily = [...winterTemps(2024, 8), ...winterTemps(2025, 8)];
  const normal = f.normalTemps(daily);
  const typ = f.typicalWinter(model, normal, 18);
  assert.ok(typ > 150 && typ < 220, String(typ)); // 212 giorni * 0,8 = ~170
  const recs = [{ date: '2024-09-01', bags: 1 }, { date: '2025-01-10', bags: 100 }, { date: '2025-04-20', bags: 60 }, { date: '2026-02-01', bags: 5 }];
  const s = f.pastSeasons(recs, daily, model, 18, normal, '2026-03-01');
  assert.equal(s.length, 1);
  assert.equal(s[0].label, '2024-25');
  assert.equal(s[0].real, 160);
});

test('stagione in corso: in linea quando reale = atteso', () => {
  const daily = winterTemps(2026, 8).filter(d => d.date <= '2026-12-01');
  const normal = f.normalTemps(daily);
  const exp = 62 * 0.8; // dal 1 ottobre al 1 dicembre compresi
  const recs = [{ date: '2026-09-30', bags: 3 }, { date: '2026-12-01', bags: exp }];
  const s = f.seasonSoFar(recs, daily, model, 18, normal, '2026-12-01');
  assert.ok(Math.abs(s.pct) < 1, String(s.pct));
});

test('costo medio ultimi 12 mesi', () => {
  const c = f.avgCost([{ date: '2026-10-01', bags: 2, price_per_bag: 5 }, { date: '2026-10-05', bags: 2, price_per_bag: 6 }, { date: '2020-01-01', bags: 9, price_per_bag: 1 }], '2026-11-01');
  assert.ok(Math.abs(c - 5.5) < 1e-9);
});
