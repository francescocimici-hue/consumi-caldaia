import React, { useMemo, useState } from 'react';
import { Kpi, Seg, Legend } from '../components/ui.jsx';
import { CumulativeChart, TempScatter, yearColor } from '../components/Charts.jsx';
import { yearsOf, monthly, cumulativeSpend, tempMap, monthKey, tempPoints, regression, pelletSummary, MONTHS_LONG, spend } from '../lib/stats.js';
import { fmt, fmt1, fmt2, euro, euro0, dateFmt } from '../lib/format.js';

export default function Analisi({ records, temps, todayISO }) {
  const years = yearsOf(records);
  const [metric, setMetric] = useState('bal');
  const totalBags = records.reduce((s, r) => s + Number(r.bags), 0);
  const totalSpend = records.reduce((s, r) => s + spend(r), 0);
  const summary = useMemo(() => pelletSummary(records), [records]);
  const points = useMemo(() => tempPoints(records, temps, todayISO), [records, temps, todayISO]);
  const reg = useMemo(() => regression(points), [points]);
  const tm = tempMap(temps);
  const cols = years.map(y => monthly(records, y)[metric]);
  const max = Math.max(1, ...cols.flat());
  const f = v => (metric === 'sp' ? fmt(Math.round(v)) : fmt(v));
  const currentYear = Number(todayISO.slice(0, 4));
  const currentMonth = Number(todayISO.slice(5, 7)) - 1;

  return (
    <section className="stack">
      <div className="kpis">
        <Kpi label="Ballini complessivi" value={fmt(totalBags)} />
        <Kpi label="Spesa complessiva" value={euro0(totalSpend)} />
        <Kpi label="Costo medio" value={euro(totalBags ? totalSpend / totalBags : 0)} unit="/ballino" />
        <Kpi label="Tipi di pellet" value={summary.length} />
      </div>

      <div className="two-cols even">
        <div className="panel">
          <div className="panel-head"><div><h3>Spesa progressiva</h3><p>Euro accumulati da gennaio, per anno</p></div></div>
          <Legend items={years.map(y => [yearColor(years, y), `${y} · ${euro0(cumulativeSpend(records, y, todayISO).at(-1))}`, true])} />
          <CumulativeChart records={records} years={years} todayISO={todayISO} />
        </div>
        <div className="panel">
          <div className="panel-head"><div><h3>Consumo e temperatura</h3><p>Un punto per ogni mese completo con temperatura nota</p></div></div>
          <Legend items={[...years.map(y => [yearColor(years, y), String(y)]), ['var(--muted)', 'tendenza', true]]} />
          {points.length ? <TempScatter points={points} years={years} regression={reg} /> : <p className="empty">Servono le temperature medie mensili per questo grafico.</p>}
          {reg && (
            <div className="alert">
              <span>
                In media ogni grado in più {reg.slope < 0 ? 'fa risparmiare' : 'fa consumare'} circa <b>{fmt1(Math.abs(reg.slope))} ballini al mese</b> ({reg.n} mesi, correlazione {fmt2(reg.r)}).
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div><h3>Mese per mese</h3><p>Confronto tra le stagioni, con la temperatura media</p></div>
          <Seg label="Misura" value={metric} onChange={setMetric} options={[['bal', 'Ballini'], ['sp', 'Spesa']]} />
        </div>
        <div className="table-wrap">
          <table className="heat">
            <thead><tr><th>Mese</th>{years.map(y => <th className="r" key={y}>{y}</th>)}<th className="r">T media {years.join(' / ')}</th></tr></thead>
            <tbody>
              {MONTHS_LONG.map((name, i) => (
                <tr key={name}>
                  <td>{name[0].toUpperCase() + name.slice(1)}</td>
                  {years.map((y, k) => {
                    const v = cols[k][i];
                    const partial = y === currentYear && i === currentMonth;
                    return v
                      ? <td className="r" key={y} style={{ background: `color-mix(in srgb, var(--accent) ${Math.round((v / max) * 38)}%, transparent)` }}>{f(v)}{partial ? ' *' : ''}</td>
                      : <td className="r mut" key={y}>–</td>;
                  })}
                  <td className="r mut">{years.map(y => (tm[monthKey(y, i)] === undefined ? '–' : fmt1(tm[monthKey(y, i)]))).join(' / ')}</td>
                </tr>
              ))}
              <tr><td><b>Totale</b></td>{cols.map((c, k) => <td className="r" key={years[k]}><b>{f(c.reduce((a, b) => a + b, 0))}</b></td>)}<td /></tr>
            </tbody>
          </table>
        </div>
        <p className="note">* mese in corso, ancora incompleto.</p>
      </div>

      <div className="panel">
        <div className="panel-head"><div><h3>Costo per tipo di pellet</h3><p>Costo medio pesato sui ballini caricati</p></div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Pellet</th><th>Periodo</th><th className="r">Ballini</th><th className="r">Spesa</th><th className="r">Costo medio</th><th className="r">Ultimo prezzo</th></tr></thead>
            <tbody>
              {summary.map(s => (
                <tr key={s.type}>
                  <td><span className="tag">{s.type}</span></td><td className="mut">{dateFmt(s.first)} – {dateFmt(s.last)}</td>
                  <td className="r">{fmt(s.bags)}</td><td className="r">{euro0(s.spend)}</td><td className="r">{euro(s.bags ? s.spend / s.bags : 0)}</td><td className="r">{euro(s.lastPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
