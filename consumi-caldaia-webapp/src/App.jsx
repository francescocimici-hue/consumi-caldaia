import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LayoutDashboard, ClipboardList, ChartNoAxesCombined, Package, Sun, Moon, Cloud, CloudOff, Download, Flame, LogOut, RefreshCw } from 'lucide-react';
import Panoramica from './views/Panoramica.jsx';
import Registro from './views/Registro.jsx';
import Analisi from './views/Analisi.jsx';
import Scorte from './views/Scorte.jsx';
import { supabase, loadDemo, fetchAll, flushOutbox, applyOutbox, readCache, writeCache, clearCache, loadOutbox, saveOutbox, isNetworkError } from './lib/data.js';
import { newId } from './lib/sync.js';
import { localISO } from './lib/stats.js';

const EMPTY = { records: [], events: [], purchases: [], temps: [] };
const NAV = [['panoramica', LayoutDashboard, 'Panoramica'], ['registro', ClipboardList, 'Registro'], ['analisi', ChartNoAxesCombined, 'Analisi'], ['scorte', Package, 'Scorte']];

const readLocal = (key, fallback) => {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
};
const writeLocal = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* archivio non disponibile */
  }
};
const prefersDark = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;

export default function App() {
  const [view, setView] = useState('panoramica');
  const [data, setData] = useState(EMPTY);
  const [dark, setDark] = useState(() => readLocal('cc-dark', prefersDark()));
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(Boolean(supabase));
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [pending, setPending] = useState(() => loadOutbox().length);
  const [notice, setNotice] = useState('');
  const [email, setEmail] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [todayISO, setToday] = useState(() => localISO());
  const dataRef = useRef(data);
  dataRef.current = data;

  const cloud = Boolean(supabase);
  const ready = !cloud || Boolean(user);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    writeLocal('cc-dark', dark);
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#0f1612' : '#1f6f50');
  }, [dark]);

  // Modalita' locale: si parte dai dati salvati nel browser, o dallo storico di esempio.
  useEffect(() => {
    if (cloud) return;
    const saved = { records: readLocal('cc-records', null), events: readLocal('cc-events', null), purchases: readLocal('cc-purchases', []), temps: readLocal('cc-temps', null) };
    if (saved.records) {
      setData({ ...EMPTY, ...saved, events: saved.events || [], temps: saved.temps || [] });
      return;
    }
    loadDemo().then(d => setData({
      records: d.records.map((r, i) => ({ ...r, id: `legacy-${i}` })),
      events: d.events.map((e, i) => ({ ...e, id: `event-${i}` })),
      purchases: [],
      temps: d.temperatures
    }));
  }, [cloud]);
  useEffect(() => {
    if (cloud) return;
    writeLocal('cc-records', data.records);
    writeLocal('cc-events', data.events);
    writeLocal('cc-purchases', data.purchases);
    writeLocal('cc-temps', data.temps);
  }, [cloud, data]);

  // Cloud: scarica tutto, applicando prima cio' che e' rimasto in coda.
  const refresh = useCallback(async (u, quiet = true) => {
    if (!u) return;
    try {
      const sent = await flushOutbox(u.id);
      const fresh = await fetchAll();
      const merged = applyOutbox(fresh, loadOutbox().filter(i => i.owner_id === u.id));
      setData(merged);
      writeCache(u.id, merged);
      setPending(loadOutbox().length);
      if (sent.error) setNotice(`Una modifica in coda è stata rifiutata dal database: ${sent.error.message}`);
      else if (!quiet) setNotice('Dati aggiornati.');
    } catch (err) {
      if (!isNetworkError(err)) setNotice(`Errore nel caricamento: ${err.message}. Controlla tabelle e permessi Supabase.`);
    }
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    const enter = u => {
      if (!alive) return;
      setUser(u || null);
      setBooting(false);
      if (!u) {
        setData(EMPTY);
        return;
      }
      const cached = readCache(u.id);
      if (cached) setData(applyOutbox(cached, loadOutbox().filter(i => i.owner_id === u.id)));
      refresh(u);
    };
    supabase.auth.getSession().then(({ data: d }) => enter(d.session?.user)).catch(() => setBooting(false));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'INITIAL_SESSION') return;
      enter(s?.user);
    });
    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, [refresh]);

  // Rete e ritorno in primo piano: si invia la coda e si riallinea lo schermo.
  useEffect(() => {
    const up = () => {
      setOnline(true);
      if (user) refresh(user);
    };
    const down = () => setOnline(false);
    const visible = () => {
      if (document.visibilityState !== 'visible') return;
      setToday(localISO());
      if (user && navigator.onLine) refresh(user);
    };
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [user, refresh]);

  // Aggiorna lo stato, poi salva: in cloud con coda offline, in locale solo nel browser.
  async function mutate(name, op, row, okText) {
    const before = dataRef.current;
    const id = row.id;
    setData(d => ({ ...d, [name]: op === 'upsert' ? [...d[name].filter(r => r.id !== id), row] : d[name].filter(r => r.id !== id) }));
    if (!cloud) {
      setNotice(okText);
      return true;
    }
    const item = op === 'upsert' ? { name, op, row, owner_id: user.id } : { name, op, id, owner_id: user.id };
    const queue = [...loadOutbox(), item];
    saveOutbox(queue);
    const sent = await flushOutbox(user.id);
    setPending(loadOutbox().length);
    const next = dataRef.current;
    writeCache(user.id, next);
    if (sent.offline) {
      setNotice('Sei senza rete: la modifica è salvata sul telefono e partirà appena torna il segnale.');
      return true;
    }
    if (sent.error) {
      setData(before);
      writeCache(user.id, before);
      setNotice(`Non salvato: ${sent.error.message}`);
      return false;
    }
    setNotice(okText);
    return true;
  }

  async function addRecord(row) {
    if (!row.date || row.bags < 1 || row.price_per_bag <= 0 || !row.pellet_type) {
      setNotice('Controlla data, quantità, tipo pellet e prezzo.');
      return false;
    }
    const full = { ...row, id: newId() };
    if (cloud) full.owner_id = user.id;
    const ok = await mutate('records', 'upsert', full, 'Registrazione salvata.');
    if (ok && row.note) {
      const ev = { id: newId(), date: row.date, description: row.note };
      if (cloud) ev.owner_id = user.id;
      await mutate('events', 'upsert', ev, 'Registrazione salvata.');
    }
    return ok;
  }
  const removeRecord = id => mutate('records', 'delete', { id }, 'Registrazione eliminata.');
  async function addPurchase(row) {
    if (row.bags < 1 || row.price_per_bag <= 0) {
      setNotice('Quantità e prezzo devono essere maggiori di zero.');
      return false;
    }
    const full = { ...row, id: newId() };
    if (cloud) full.owner_id = user.id;
    return mutate('purchases', 'upsert', full, 'Acquisto aggiunto.');
  }
  const removePurchase = id => mutate('purchases', 'delete', { id }, 'Acquisto eliminato.');

  async function sendLoginLink(e) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: window.location.origin } });
    setBusy(false);
    if (error) {
      setNotice(`Accesso non riuscito: ${error.message}`);
      return;
    }
    setCodeSent(true);
    setNotice('Ti abbiamo scritto una mail con un codice. Scrivilo qui sotto, senza aprire il link.');
  }
  // Su iPhone l'app sulla Home e Safari non condividono l'accesso: con il codice si entra direttamente nell'app.
  async function verifyCode(e) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.replace(/\s/g, ''), type: 'email' });
    setBusy(false);
    if (error) setNotice(`Codice non valido o scaduto: ${error.message}`);
    else setNotice('');
  }
  async function logout() {
    if (loadOutbox().some(i => i.owner_id === user.id)) {
      const sent = await flushOutbox(user.id);
      if (sent.pending > 0) {
        setNotice('Ci sono modifiche non ancora inviate: riprova a uscire quando torna la rete.');
        return;
      }
    }
    await supabase.auth.signOut();
    clearCache();
    setUser(null);
    setData(EMPTY);
    setNotice('Sei uscito dal tuo account.');
  }
  function exportBackup() {
    const blob = new Blob([JSON.stringify({ ...data, exported_at: new Date().toISOString() }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup-consumi-caldaia-${todayISO}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const syncLabel = !cloud ? 'Solo su questo browser' : !online ? 'Offline' : pending ? `${pending} da inviare` : 'Sincronizzato';
  const StatusIcon = cloud && online ? Cloud : CloudOff;
  const title = NAV.find(n => n[0] === view)[2];

  if (booting) return <div className="gate"><Flame size={28} /><p>Caricamento…</p></div>;

  if (!ready) {
    return (
      <div className="gate">
        <div className="gate-card">
          <div className="brand-mark"><Flame size={20} /></div>
          <h1>Consumi Caldaia</h1>
          <p>Accedi con la tua email: ti arriva un codice, non serve nessuna password.</p>
          {!codeSent ? (
            <form onSubmit={sendLoginLink}>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="La tua email" autoComplete="email" required />
              <button className="primary" type="submit" disabled={busy}>Inviami il codice</button>
            </form>
          ) : (
            <form onSubmit={verifyCode}>
              <input value={code} onChange={e => setCode(e.target.value)} placeholder="Codice ricevuto per email" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,10}" required autoFocus />
              <button className="primary" type="submit" disabled={busy}>Entra</button>
              <button className="text-btn" type="button" onClick={() => { setCodeSent(false); setCode(''); }}>Cambia email o richiedi un nuovo codice</button>
            </form>
          )}
          {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Chiudi">×</button></div>}
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><Flame size={19} /></div><div><b>Consumi Caldaia</b><small>Caldaia a pellet</small></div></div>
        <nav aria-label="Sezioni">
          {NAV.map(([id, Icon, label]) => (
            <button key={id} className={view === id ? 'active' : ''} aria-current={view === id ? 'page' : undefined} onClick={() => setView(id)}><Icon size={18} />{label}</button>
          ))}
        </nav>
        <div className="sidebar-foot"><span className={`sync-dot ${cloud && online && !pending ? '' : 'warn'}`} />{syncLabel}
          {!cloud && <p>I dati restano su questo browser finché non colleghi Supabase.</p>}
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div><span className="eyebrow">GESTIONE DOMESTICA</span><h1>{title}</h1></div>
          <div className="top-actions">
            <span className="status" title={syncLabel}><StatusIcon size={15} /><span className="status-text">{syncLabel}</span></span>
            {cloud && <button className="icon-btn" title="Aggiorna dati" aria-label="Aggiorna dati" onClick={() => refresh(user, false)}><RefreshCw size={17} /></button>}
            <button className="icon-btn" title="Scarica backup" aria-label="Scarica backup" onClick={exportBackup}><Download size={17} /></button>
            <button className="icon-btn" title="Cambia tema" aria-label="Cambia tema" onClick={() => setDark(v => !v)}>{dark ? <Sun size={17} /> : <Moon size={17} />}</button>
            {cloud && <button className="icon-btn" title="Esci" aria-label="Esci" onClick={logout}><LogOut size={17} /></button>}
          </div>
        </header>
        {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Chiudi">×</button></div>}
        {view === 'panoramica' && !data.records.length && <Vuoto onGo={setView} />}
        {view === 'analisi' && !data.records.length && <Vuoto onGo={setView} />}
        {view === 'panoramica' && data.records.length > 0 && <Panoramica records={data.records} temps={data.temps} purchases={data.purchases} todayISO={todayISO} onGo={setView} />}
        {view === 'registro' && <Registro records={data.records} events={data.events} onAdd={addRecord} onRemove={removeRecord} todayISO={todayISO} />}
        {view === 'analisi' && data.records.length > 0 && <Analisi records={data.records} temps={data.temps} todayISO={todayISO} />}
        {view === 'scorte' && <Scorte records={data.records} purchases={data.purchases} onAdd={addPurchase} onRemove={removePurchase} todayISO={todayISO} />}
      </main>
      <nav className="tabbar" aria-label="Sezioni">
        {NAV.map(([id, Icon, label]) => (
          <button key={id} className={view === id ? 'active' : ''} aria-current={view === id ? 'page' : undefined} onClick={() => { setView(id); window.scrollTo(0, 0); }}><Icon size={20} /><span>{label}</span></button>
        ))}
      </nav>
    </div>
  );
}

function Vuoto({ onGo }) {
  return (
    <section className="panel empty-state">
      <h3>Ancora nessuna registrazione</h3>
      <p>Inserisci il primo carico di pellet per vedere confronti, grafici e scorte.</p>
      <button className="primary" onClick={() => onGo('registro')}>Vai al registro</button>
    </section>
  );
}
