import React, { useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Kpi, Field } from '../components/ui.jsx';
import { stockLevel, runOutDate, lastFullYear, lastPrice, localISO, spend } from '../lib/stats.js';
import { fmt, euro, euro0, dateFmt, dayMonth } from '../lib/format.js';

export default function Scorte({ records, purchases, onAdd, onRemove, todayISO }) {
  const { bought, used, stock } = stockLevel(records, purchases);
  const out = purchases.length ? runOutDate(stock, records, todayISO) : null;
  const baseYear = lastFullYear(records, todayISO);
  const totalSpend = records.reduce((s, r) => s + spend(r), 0);
  const pelletTypes = useMemo(() => [...new Set(records.map(r => r.pellet_type))].sort(), [records]);
  const latest = useMemo(() => [...records].sort((a, b) => b.date.localeCompare(a.date))[0], [records]);
  const [purchase, setPurchase] = useState(() => ({
    date: todayISO, bags: 78, pellet_type: latest?.pellet_type || 'mammut', price_per_bag: latest ? Number(latest.price_per_bag) : 5.8
  }));
  const [armed, setArmed] = useState(null);
  const set = patch => setPurchase(p => ({ ...p, ...patch }));
  function changeType(value) {
    const known = lastPrice(records, value.trim().toLowerCase());
    set({ pellet_type: value, ...(known !== '' ? { price_per_bag: known } : {}) });
  }
  async function submit(e) {
    e.preventDefault();
    await onAdd({ date: purchase.date, bags: Number(purchase.bags), pellet_type: purchase.pellet_type.trim().toLowerCase(), price_per_bag: Number(purchase.price_per_bag) });
  }
  function remove(id) {
    if (armed !== id) {
      setArmed(id);
      setTimeout(() => setArmed(a => (a === id ? null : a)), 3000);
      return;
    }
    setArmed(null);
    onRemove(id);
  }
  const pct = bought ? Math.max(0, Math.min(100, (stock / bought) * 100)) : 0;

  return (
    <section className="stack">
      <div className="kpis">
        <Kpi label="Ballini acquistati" value={fmt(bought)} />
        <Kpi label="Ballini consumati" value={fmt(used)} hint="dal primo acquisto" />
        <Kpi label="Scorta stimata" value={fmt(Math.max(stock, 0))} unit="ballini" />
        <Kpi label="Fine scorta stimata" value={out ? dayMonth(localISO(out)) : '—'} hint={out ? `con i consumi del ${baseYear}` : purchases.length ? 'oltre due anni' : 'Registra un acquisto'} />
      </div>

      {purchases.length > 0 && (
        <div className="panel">
          <div className="panel-head"><div><h3>Giacenza</h3><p>{fmt(Math.max(stock, 0))} ballini su {fmt(bought)} acquistati</p></div></div>
          <div className="bar-track" role="img" aria-label={`Scorta residua ${Math.round(pct)} per cento`}><i style={{ width: `${pct}%` }} /></div>
          <p className="note">La stima conta i ballini registrati dopo la data del primo acquisto. Il giorno di esaurimento ipotizza consumi uguali a quelli del {baseYear}, mese per mese.</p>
        </div>
      )}

      <form className="panel" onSubmit={submit}>
        <div className="panel-head"><div><h3>Registra acquisto</h3><p>Gli acquisti alimentano il calcolo delle scorte</p></div></div>
        <div className="form-grid">
          <Field label="Data"><input type="date" value={purchase.date} onChange={e => set({ date: e.target.value })} required /></Field>
          <Field label="Ballini"><input type="number" min="1" step="1" inputMode="numeric" value={purchase.bags} onChange={e => set({ bags: e.target.value })} required /></Field>
          <Field label="Tipo pellet">
            <input list="pellet-options-2" value={purchase.pellet_type} onChange={e => changeType(e.target.value)} required />
            <datalist id="pellet-options-2">{pelletTypes.map(t => <option key={t} value={t} />)}</datalist>
          </Field>
          <Field label="Costo a ballino (€)"><input type="number" min="0.01" step="0.01" inputMode="decimal" value={purchase.price_per_bag} onChange={e => set({ price_per_bag: e.target.value })} required /></Field>
        </div>
        <div className="form-bottom"><span>Totale acquisto <b>{euro(Number(purchase.bags) * Number(purchase.price_per_bag))}</b></span><button className="primary" type="submit">Aggiungi acquisto</button></div>
      </form>

      <div className="panel">
        <div className="panel-head"><div><h3>Storico acquisti</h3><p>{purchases.length} acquisti · spesa storica dei carichi {euro0(totalSpend)}</p></div></div>
        {purchases.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Data</th><th>Pellet</th><th className="r">Ballini</th><th className="r">€/ballino</th><th className="r">Totale</th><th /></tr></thead>
              <tbody>
                {[...purchases].sort((a, b) => b.date.localeCompare(a.date)).map(p => (
                  <tr key={p.id}>
                    <td>{dateFmt(p.date)}</td><td><span className="tag">{p.pellet_type}</span></td><td className="r">{p.bags}</td>
                    <td className="r">{euro(p.price_per_bag)}</td><td className="r">{euro(p.bags * p.price_per_bag)}</td>
                    <td className="r"><button type="button" className={armed === p.id ? 'danger-confirm' : 'danger-icon'} title="Elimina" onClick={() => remove(p.id)}>{armed === p.id ? 'Conferma?' : <Trash2 size={16} />}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="empty">Ancora nessun acquisto. Inserisci il primo bancale per calcolare le scorte.</p>}
      </div>
    </section>
  );
}
