import React, { useMemo, useState } from 'react';
import { Trash2, Minus, Plus } from 'lucide-react';
import { Field } from '../components/ui.jsx';
import { yearsOf, lastPrice, progressives, spend } from '../lib/stats.js';
import { fmt, euro, dateFmt } from '../lib/format.js';

const PAGE = 15;

export default function Registro({ records, events, onAdd, onRemove, todayISO }) {
  const pelletTypes = useMemo(() => [...new Set(records.map(r => r.pellet_type))].sort(), [records]);
  const years = useMemo(() => yearsOf(records), [records]);
  const prog = useMemo(() => progressives(records), [records]);
  const latest = useMemo(() => [...records].sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')))[0], [records]);

  const [form, setForm] = useState(() => ({
    date: todayISO, time: '', bags: 2,
    pellet_type: latest?.pellet_type || 'mammut', price_per_bag: latest ? Number(latest.price_per_bag) : 5.8, note: ''
  }));
  const [filterYear, setFilterYear] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [shown, setShown] = useState(PAGE);
  const [armed, setArmed] = useState(null);

  const set = patch => setForm(f => ({ ...f, ...patch }));
  function changeType(value) {
    // Se il pellet e' gia' noto, compila il prezzo con l'ultimo usato.
    const known = lastPrice(records, value.trim().toLowerCase());
    set({ pellet_type: value, ...(known !== '' ? { price_per_bag: known } : {}) });
  }
  const total = Number(form.bags) * Number(form.price_per_bag);

  const filtered = useMemo(() => records
    .filter(r => (filterYear === 'all' || r.date.startsWith(filterYear)) && (filterType === 'all' || r.pellet_type === filterType))
    .sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || ''))), [records, filterYear, filterType]);
  const filteredBags = filtered.reduce((s, r) => s + Number(r.bags), 0);
  const filteredSpend = filtered.reduce((s, r) => s + spend(r), 0);

  async function submit(e) {
    e.preventDefault();
    const ok = await onAdd({
      date: form.date, time: form.time || null, bags: Number(form.bags),
      pellet_type: form.pellet_type.trim().toLowerCase(), price_per_bag: Number(form.price_per_bag), note: form.note.trim() || null
    });
    if (ok) set({ date: todayISO, time: '', bags: 2, note: '' });
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

  return (
    <section className="stack">
      <form className="panel" onSubmit={submit}>
        <div className="panel-head"><div><h3>Nuova registrazione</h3><p>Il prezzo si compila con l'ultimo usato per quel pellet.</p></div></div>
        <div className="form-grid">
          <Field label="Data"><input type="date" value={form.date} onChange={e => set({ date: e.target.value })} required /></Field>
          <Field label="Ora (facoltativa)"><input type="time" value={form.time} onChange={e => set({ time: e.target.value })} /></Field>
          <Field label="Ballini">
            <div className="stepper">
              <button type="button" aria-label="Un ballino in meno" onClick={() => set({ bags: Math.max(1, Number(form.bags) - 1) })}><Minus size={16} /></button>
              <input type="number" min="1" step="1" inputMode="numeric" value={form.bags} onChange={e => set({ bags: e.target.value })} required />
              <button type="button" aria-label="Un ballino in più" onClick={() => set({ bags: Number(form.bags) + 1 })}><Plus size={16} /></button>
            </div>
          </Field>
          <Field label="Tipo pellet">
            <input list="pellet-options" value={form.pellet_type} onChange={e => changeType(e.target.value)} required />
            <datalist id="pellet-options">{pelletTypes.map(t => <option key={t} value={t} />)}</datalist>
          </Field>
          <Field label="Costo a ballino (€)"><input type="number" min="0.01" step="0.01" inputMode="decimal" value={form.price_per_bag} onChange={e => set({ price_per_bag: e.target.value })} required /></Field>
          <Field label="Nota (facoltativa)"><input value={form.note} onChange={e => set({ note: e.target.value })} placeholder="es. nuovo bancale" /></Field>
        </div>
        <div className="form-bottom"><span>Spesa di questa registrazione <b>{euro(total)}</b></span><button className="primary" type="submit">Salva registrazione</button></div>
      </form>

      <div className="panel">
        <div className="panel-head">
          <div><h3>Storico</h3><p>{filtered.length} registrazioni · {fmt(filteredBags)} ballini · {euro(filteredSpend)}</p></div>
          <div className="filters">
            <select aria-label="Anno" value={filterYear} onChange={e => { setFilterYear(e.target.value); setShown(PAGE); }}>
              <option value="all">Tutti gli anni</option>{[...years].reverse().map(y => <option key={y}>{y}</option>)}
            </select>
            <select aria-label="Pellet" value={filterType} onChange={e => { setFilterType(e.target.value); setShown(PAGE); }}>
              <option value="all">Tutti i pellet</option>{pelletTypes.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Data</th><th>Ora</th><th className="r">Ballini</th><th>Pellet</th><th className="r">€/ballino</th><th className="r">Spesa</th><th className="r">Progr. spesa anno</th><th className="r">Progr. ballini anno</th><th /></tr></thead>
            <tbody>
              {filtered.slice(0, shown).map(r => (
                <tr key={r.id}>
                  <td>{dateFmt(r.date)}</td><td className="mut">{r.time || '—'}</td><td className="r">{r.bags}</td>
                  <td><span className="tag">{r.pellet_type}</span></td><td className="r">{euro(r.price_per_bag)}</td><td className="r">{euro(spend(r))}</td>
                  <td className="r mut">{euro(prog.get(r.id)?.ps)}</td><td className="r mut">{prog.get(r.id)?.pb}</td>
                  <td className="r">
                    <button type="button" className={armed === r.id ? 'danger-confirm' : 'danger-icon'} title="Elimina" onClick={() => remove(r.id)}>
                      {armed === r.id ? 'Conferma?' : <Trash2 size={16} />}
                    </button>
                  </td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan="9" className="empty">Nessuna registrazione con questi filtri.</td></tr>}
            </tbody>
          </table>
        </div>
        {filtered.length > shown && <div className="more"><button type="button" className="text-btn" onClick={() => setShown(s => s + PAGE)}>Mostra altre {Math.min(PAGE, filtered.length - shown)}</button></div>}
      </div>

      <div className="panel">
        <div className="panel-head"><div><h3>Eventi della stagione</h3><p>Accensioni, cambi di bancale e di pellet. Si aggiungono scrivendo una nota nella registrazione.</p></div></div>
        <div className="events">
          {[...events].sort((a, b) => b.date.localeCompare(a.date)).map(e => (
            <div className="event-row" key={e.id}><time>{dateFmt(e.date)}</time><span>{e.description}</span></div>
          ))}
          {!events.length && <p className="empty">Ancora nessun evento.</p>}
        </div>
      </div>
    </section>
  );
}
