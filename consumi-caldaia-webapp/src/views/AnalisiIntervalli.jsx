import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CloudDownload } from 'lucide-react';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts';
import { Kpi } from '../components/ui.jsx';
import { analyze, BASE_TEMP } from '../lib/degreeDays.js';
import { fetchMissing } from '../lib/weather.js';
import { loadDailyTemps, saveDailyTemps, isMissingTable } from '../lib/dailyTemps.js';
import { LOCATION } from '../config.js';
import { fmt, fmt1, fmt2, dateFmt } from '../lib/format.js';

const fmt3 = n => new Intl.NumberFormat('it-IT', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(n || 0);
const tick = { fontSize: 11, fill: 'var(--muted)' };
const box = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12, color: 'var(--fg)' };

/** Analisi per intervallo tra due carichi: ballini in rapporto al freddo (gradi giorno) di quei giorni. */
export default function AnalisiIntervalli({ records, todayISO, userId }) {
  const [daily, setDaily] = useState([]);
  const [status, setStatus] = useState({ kind: '', text: '' });
  const [busy, setBusy] = useState(false);
  const [base, setBase] = useState(BASE_TEMP);
  const [tableMissing, setTableMissing] = useState(false);

  useEffect(() => {
    let alive = true;
    loadDailyTemps().then(({ rows, error }) => {
      if (!alive) return;
      if (error) {
        if (isMissingTable(error)) setTableMissing(true);
        else setStatus({ kind: 'warn', text: `Temperature giornaliere non lette: ${error.message}` });
        return;
      }
      setDaily(rows);
    });
    return () => {
      alive = false;
    };
  }, []);

  const result = useMemo(() => analyze(records, daily, { base }), [records, daily, base]);
  const first = useMemo(() => records.reduce((m, r) => (!m || r.date < m ? r.date : m), ''), [records]);

  const update = useCallback(async () => {
    setBusy(true);
    setStatus({ kind: '', text: '' });
    try {
      const rows = await fetchMissing(first, todayISO, new Set(daily.map(r => r.date)));
      if (!rows.length) {
        setStatus({ kind: 'ok', text: 'Le temperature sono già aggiornate.' });
        return;
      }
      const { error } = await saveDailyTemps(rows, userId);
      if (error) {
        if (isMissingTable(error)) setTableMissing(true);
        else setStatus({ kind: 'warn', text: `Salvataggio non riuscito: ${error.message}` });
        return;
      }
      setDaily(prev => [...prev, ...rows].sort((a, b) => a.date.localeCompare(b.date)));
      setStatus({ kind: 'ok', text: `Aggiunte ${rows.length} temperature giornaliere.` });
    } catch (err) {
      setStatus({ kind: 'warn', text: `Non riesco a contattare il servizio meteo (${err.message}). Riprova più tardi.` });
    } finally {
      setBusy(false);
    }
  }, [first, todayISO, daily, userId]);

  const { model, intervals } = result;
  const points = intervals.filter(i => i.usable && i.gg !== null).map(i => ({ x: i.gg / i.days, y: i.bags / i.days, end: i.end, days: i.days, bags: i.bags, gg: i.gg }));
  const xMax = Math.max(1, ...points.map(p => p.x)) * 1.05;
  const shown = [...intervals].reverse().slice(0, 12);
  const hasWinter = daily.length > 0;

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h3>Consumo per intervallo tra due carichi</h3>
          <p>Ballini caricati in rapporto al freddo di quei giorni · {LOCATION.name}</p>
        </div>
        <button type="button" className="primary" onClick={update} disabled={busy || tableMissing}>
          <CloudDownload size={16} aria-hidden="true" /> {busy ? 'Scarico…' : 'Aggiorna temperature'}
        </button>
      </div>

      {tableMissing && (
        <div className="alert warn" role="alert">
          <span>Manca la tabella delle temperature giornaliere. In Supabase, apri SQL Editor, incolla il contenuto del file <b>supabase/daily-temperatures.sql</b> ed eseguilo, poi ricarica l'app.</span>
        </div>
      )}
      {status.text && <div className={`alert${status.kind === 'warn' ? ' warn' : ''}`} role="status"><span>{status.text}</span></div>}

      {!tableMissing && !hasWinter && <p className="empty">Premi «Aggiorna temperature» per scaricare le temperature giornaliere da ottobre ad aprile, dal primo carico a oggi.</p>}

      {model ? (
        <>
          <div className="kpis" style={{ marginTop: 14 }}>
            <Kpi label="Intervalli usati" value={result.usedCount} hint={result.skippedCount ? `${result.skippedCount} scartati per dati mancanti` : 'tutti con temperature complete'} />
            <Kpi label="Per grado di freddo" value={fmt3(model.k)} unit="ballini/°C·giorno" hint={`± ${fmt3(model.seK)}`} />
            <Kpi label="Consumo di base" value={fmt2(model.a)} unit="ballini/giorno" hint={model.constrained ? 'imposto a zero: il dato non ne mostra uno' : 'anche senza freddo'} />
            <Kpi label="Affidabilità (R²)" value={fmt1(model.r2 * 100)} unit="%" hint="quanto il freddo spiega i consumi" />
          </div>

          <div className="chart" role="img" aria-label="Ballini al giorno in funzione dei gradi giorno al giorno" style={{ marginTop: 16 }}>
            <ResponsiveContainer width="100%" height={250}>
              <ScatterChart margin={{ top: 8, right: 12, left: 0, bottom: 14 }}>
                <CartesianGrid stroke="var(--line)" />
                <XAxis type="number" dataKey="x" domain={[0, Math.ceil(xMax)]} tick={tick} tickLine={false} axisLine={{ stroke: 'var(--line)' }}
                  label={{ value: `Freddo al giorno (gradi sotto ${base} °C)`, position: 'insideBottom', offset: -8, fill: 'var(--muted)', fontSize: 11 }} />
                <YAxis type="number" dataKey="y" domain={[0, 'auto']} tick={tick} tickLine={false} axisLine={false} width={36} tickFormatter={v => fmt1(v)} />
                <Tooltip cursor={{ strokeDasharray: '3 3', stroke: 'var(--line)' }} content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload;
                  return <div style={{ ...box, padding: '6px 10px' }}><b>fino al {dateFmt(p.end)}</b><div>{fmt1(p.bags)} ballini in {p.days} giorni</div></div>;
                }} />
                <ReferenceLine segment={[{ x: 0, y: model.a }, { x: Math.ceil(xMax), y: model.a + model.k * Math.ceil(xMax) }]} stroke="var(--ember)" strokeWidth={2} strokeDasharray="5 4" />
                <Scatter data={points} fill="var(--y1)" fillOpacity={0.85} isAnimationActive={false} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          <div className="table-wrap" style={{ marginTop: 14 }}>
            <table>
              <thead>
                <tr><th>Intervallo</th><th>Giorni</th><th>Gradi giorno</th><th>Ballini</th><th>Previsti</th><th>Scostamento</th></tr>
              </thead>
              <tbody>
                {shown.map(i => (
                  <tr key={i.end}>
                    <td>{dateFmt(i.start)} → {dateFmt(i.end)}</td>
                    <td>{i.days}</td>
                    <td>{i.gg === null ? '—' : fmt(Math.round(i.gg))}</td>
                    <td>{fmt1(i.bags)}</td>
                    <td>{i.expected === null ? '—' : fmt1(i.expected)}</td>
                    <td style={i.deviationPct !== null && Math.abs(i.deviationPct) >= 25 ? { color: 'var(--danger)', fontWeight: 600 } : undefined}>
                      {i.deviationPct === null ? 'dati insufficienti' : `${i.deviationPct > 0 ? '+' : ''}${fmt(Math.round(i.deviationPct))}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        hasWinter && <p className="empty">Servono almeno 4 intervalli con temperature complete per stimare il modello.</p>
      )}

      <label className="field" style={{ maxWidth: 220, marginTop: 14 }}>
        <span>Soglia di riscaldamento (°C)</span>
        <input type="number" min="12" max="24" step="1" value={base} onChange={e => setBase(Math.min(24, Math.max(12, Number(e.target.value) || BASE_TEMP)))} />
      </label>
      <p className="note">
        Il consumo di ogni intervallo si confronta con quello previsto dal freddo dei giorni trascorsi. Un grande scostamento in più può indicare una pulizia da fare o un cambio di abitudini.
        La stima usa la temperatura esterna con una soglia fissa; finché non registri anche i gradi impostati in casa, non può dire quanto costa un grado in più dentro.
      </p>
      <p className="note">Dati meteo: <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo.com</a> (CC BY 4.0). Si scaricano solo i mesi da ottobre ad aprile.</p>
    </div>
  );
}
