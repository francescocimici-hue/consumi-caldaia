import React, { useState } from 'react';
import { Plus, TriangleAlert, Info } from 'lucide-react';
import { Kpi, Delta, Seg, Legend } from '../components/ui.jsx';
import { MonthlyChart, yearColor } from '../components/Charts.jsx';
import { yearsOf, period, cutoffFor, priceChanges, stockLevel, runOutDate, lastFullYear, spend, localISO } from '../lib/stats.js';
import { fmt, fmt2, euro, euro0, dateFmt, dayMonth } from '../lib/format.js';

export default function Panoramica({ records, temps, purchases, todayISO, onGo }) {
  const years = yearsOf(records);
  const currentYear = Number(todayISO.slice(0, 4));
  const [picked, setYear] = useState(null);
  const year = picked ?? (years.includes(currentYear) ? currentYear : years.at(-1));
  const [metric, setMetric] = useState('bal');
  const [showTemp, setShowTemp] = useState(false);

  const cut = cutoffFor(year, todayISO);
  const cur = period(records, year, cut);
  // L'anno prima si confronta fino allo stesso giorno, non per l'anno intero.
  const prev = years.includes(year - 1) ? period(records, year - 1, cut) : null;
  const avg = cur.bags ? cur.spend / cur.bags : 0;
  const prevAvg = prev && prev.bags ? prev.spend / prev.bags : 0;
  const daily = cur.bags / cur.days;
  const prevDaily = prev ? prev.bags / prev.days : 0;
  const vs = prev ? `vs ${year - 1}${year === currentYear ? ', stesso giorno' : ''}` : '';

  const sorted = [...records].sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));
  const last = sorted[0];
  const ago = last ? Math.round((Date.parse(todayISO) - Date.parse(last.date)) / 864e5) : null;
  const changes = priceChanges(records, 3);
  const { stock } = stockLevel(records, purchases);
  const out = purchases.length ? runOutDate(stock, records, todayISO) : null;
  const baseYear = lastFullYear(records, todayISO);

  return (
    <section className="stack">
      <div className="welcome">
        <div>
          <span className="eyebrow">STAGIONE {year}</span>
          <h2>La situazione della caldaia.</h2>
          <p>{year === currentYear ? `Dati fino al ${dayMonth(todayISO)}.` : 'Anno completo.'}</p>
        </div>
        <div className="welcome-actions">
          <Seg label="Anno" value={year} onChange={setYear} options={years.map(y => [y, String(y)])} />
          <button className="primary" onClick={() => onGo('registro')}><Plus size={17} /> Nuova registrazione</button>
        </div>
      </div>

      <div className="kpis">
        <Kpi label="Ballini" value={fmt(cur.bags)} delta={<Delta cur={cur.bags} prev={prev?.bags} text={vs} />} />
        <Kpi label="Spesa" value={euro0(cur.spend)} delta={<Delta cur={cur.spend} prev={prev?.spend} text={vs} />} />
        <Kpi label="Costo medio" value={euro(avg)} unit="/ballino" delta={<Delta cur={avg} prev={prevAvg} text={vs} />} />
        <Kpi label="Consumo medio" value={fmt2(daily)} unit="ballini/giorno" delta={<Delta cur={daily} prev={prevDaily} text={vs} />} />
      </div>

      <div className="panel">
        <div className="panel-head">
          <div><h3>{metric === 'bal' ? 'Ballini al mese' : 'Spesa al mese'}</h3><p>Confronto tra stagioni, mese per mese</p></div>
          <div className="tools">
            <Seg label="Misura" value={metric} onChange={setMetric} options={[['bal', 'Ballini'], ['sp', 'Spesa']]} />
            <Seg label="Temperatura" value={showTemp ? 'on' : 'off'} onChange={v => setShowTemp(v === 'on')} options={[['off', 'Solo consumi'], ['on', 'Con temperatura']]} />
          </div>
        </div>
        <Legend items={[...years.map(y => [yearColor(years, y), String(y)]), ...(showTemp ? [['var(--ember)', `T media ${year}`, true]] : [])]} />
        <MonthlyChart records={records} temps={temps} years={years} year={year} metric={metric} showTemp={showTemp} />
      </div>

      <div className="two-cols">
        <div className="panel">
          <div className="panel-head"><div><h3>Registrazioni recenti</h3><p>Gli ultimi carichi inseriti</p></div><button className="text-btn" onClick={() => onGo('registro')}>Apri registro →</button></div>
          <div className="recent-list">
            {sorted.slice(0, 6).map(r => (
              <div className="recent-row" key={r.id}>
                <div><b>{dateFmt(r.date)}</b><small>{r.pellet_type} · {euro(r.price_per_bag)}/ballino</small></div>
                <div className="align-right"><b>{r.bags} ballini</b><small>{euro(spend(r))}</small></div>
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><div><h3>Da tenere d'occhio</h3></div><button className="text-btn" onClick={() => onGo('scorte')}>Scorte →</button></div>
          {purchases.length > 0 ? (
            <>
              <div className="big">{fmt(Math.max(stock, 0))} <small>ballini in magazzino</small></div>
              <p className="muted">
                {out ? `Con i consumi del ${baseYear} bastano fino a circa il ${dayMonth(localISO(out))}.` : 'Scorta sufficiente per oltre due anni.'}
              </p>
            </>
          ) : (
            <p className="muted">Registra un acquisto di pellet nella sezione Scorte per vedere quanti ballini restano e fino a quando bastano.</p>
          )}
          {changes.map(c => (
            <div className="alert warn" key={c.date + c.type}>
              <TriangleAlert size={16} />
              <span><b>{c.type}</b> da {fmt2(c.from)} a {fmt2(c.to)} €/ballino dal {dateFmt(c.date)}</span>
            </div>
          ))}
          {last && (
            <div className="alert">
              <Info size={16} />
              <span>Ultima registrazione il {dateFmt(last.date)} ({ago === 0 ? 'oggi' : `${ago} giorni fa`}).</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
