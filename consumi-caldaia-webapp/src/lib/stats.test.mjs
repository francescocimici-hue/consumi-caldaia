// Prove dei calcoli sui dati reali dello storico. Si lanciano con: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as s from './stats.js';

const legacy = JSON.parse(fs.readFileSync(new URL('../legacy-data.json', import.meta.url), 'utf8'));
const records = legacy.records.map((r, i) => ({ ...r, id: `r${i}` }));
const TODAY = '2026-11-13';
const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} e' lontano da ${b}`);

test('totali annuali coincidono con l\'Excel', () => {
  assert.equal(s.period(records, 2024).bags, 162);
  assert.equal(s.period(records, 2025).bags, 164);
  assert.equal(s.period(records, 2026).bags, 120);
  near(s.period(records, 2025).spend, 701.14);
  near(s.period(records, 2026).spend, 617.8);
});

test('il confronto con l\'anno prima e\' a parita\' di data', () => {
  const cut = s.cutoffFor(2026, TODAY);
  assert.equal(cut, '11-13');
  const cur = s.period(records, 2026, cut);
  const prev = s.period(records, 2025, cut);
  assert.equal(prev.bags, 120); // non 164: l'anno 2025 intero non e' confrontabile con il 2026 a meta' novembre
  near(prev.spend, 515.02);
  near(s.pctDelta(cur.spend, prev.spend), 19.96, 0.1);
  assert.equal(cur.days, 317);
});

test('un 29 febbraio in un anno non bisestile non rompe il calcolo', () => {
  const p = s.period(records, 2025, '02-29');
  assert.ok(Number.isFinite(p.days));
});

test('totali mensili', () => {
  const m = s.monthly(records, 2024);
  assert.equal(m.bal[0], 25);
  assert.equal(m.bal[11], 30);
  near(m.sp[0], 136.1);
});

test('avvisi sui cambi di prezzo', () => {
  const c = s.priceChanges(records, 1)[0];
  assert.equal(c.type, 'mammut');
  assert.equal(c.from, 5.2);
  assert.equal(c.to, 5.8);
});

test('scorta e data di esaurimento', () => {
  const purchases = [{ date: '2026-09-20', bags: 78 }];
  const lvl = s.stockLevel(records, purchases);
  assert.equal(lvl.used, 13);
  assert.equal(lvl.stock, 65);
  const d = s.runOutDate(lvl.stock, records, TODAY);
  assert.ok(d instanceof Date);
  assert.equal(s.localISO(d).slice(0, 7), '2027-01'); // gennaio 2027 con i consumi del 2025
  assert.equal(s.runOutDate(0, records, TODAY).getTime(), new Date(`${TODAY}T00:00:00`).getTime());
});

test('correlazione tra temperatura e consumo', () => {
  const pts = s.tempPoints(records, legacy.temperatures, TODAY);
  const reg = s.regression(pts);
  assert.equal(reg.n, 27);
  near(reg.slope, -1.135, 0.01);
  near(reg.r, -0.899, 0.01);
});

test('progressivi per anno ripartono da zero a gennaio', () => {
  const p = s.progressives(records);
  const first2025 = records.filter(r => r.date.startsWith('2025')).sort((a, b) => a.date.localeCompare(b.date))[0];
  assert.equal(p.get(first2025.id).pb, first2025.bags);
});

test('spesa progressiva: ultimo punto = totale annuo', () => {
  const c = s.cumulativeSpend(records, 2025, TODAY);
  assert.equal(c.length, 12);
  near(c.at(-1), 701.14);
  assert.equal(s.cumulativeSpend(records, 2026, TODAY).length, 11);
});

test('ultimo prezzo per tipo', () => {
  assert.equal(s.lastPrice(records, 'mammut'), 5.8);
  assert.equal(s.lastPrice(records, 'inesistente'), '');
});
