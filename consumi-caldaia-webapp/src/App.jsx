import React, { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { LayoutDashboard, ClipboardList, ChartNoAxesCombined, Package, Plus, Sun, Moon, Cloud, CloudOff, Trash2, Download } from 'lucide-react';
import legacy from './legacy-data.json';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const fmt = n => new Intl.NumberFormat('it-IT').format(n || 0);
const euro = n => new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(n || 0);
const dateFmt = d => new Date(`${d}T00:00:00`).toLocaleDateString('it-IT',{day:'2-digit',month:'short',year:'numeric'});
const today = new Date().toISOString().slice(0,10);

function initialRecords() {
  return legacy.records.map((r,i)=>({...r,id:`legacy-${i}`,owner_id:null}));
}
function readLocal(key, fallback) {
  try { const v=localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}

export default function App() {
  const [view,setView] = useState('panoramica');
  const [records,setRecords] = useState(()=>readLocal('cc-records',initialRecords()));
  const [events,setEvents] = useState(()=>readLocal('cc-events',legacy.events.map((e,i)=>({...e,id:`event-${i}`}))));
  const [purchases,setPurchases] = useState(()=>readLocal('cc-purchases',[]));
  const [temps] = useState(legacy.temperatures);
  const [dark,setDark] = useState(()=>readLocal('cc-dark',false));
  const [cloudReady,setCloudReady] = useState(false);
  const [session,setSession] = useState(null);
  const [email,setEmail] = useState('');
  const [notice,setNotice] = useState('');
  const [form,setForm] = useState({date:today,time:'',bags:2,pellet_type:'mammut',price_per_bag:5.8,note:''});
  const [purchase,setPurchase] = useState({date:today,bags:78,pellet_type:'mammut',price_per_bag:5.8});
  const [filterYear,setFilterYear] = useState('all');
  const [filterType,setFilterType] = useState('all');

  useEffect(()=>{ document.documentElement.dataset.theme=dark?'dark':'light'; localStorage.setItem('cc-dark',JSON.stringify(dark)); },[dark]);
  useEffect(()=>{ localStorage.setItem('cc-records',JSON.stringify(records)); },[records]);
  useEffect(()=>{ localStorage.setItem('cc-events',JSON.stringify(events)); },[events]);
  useEffect(()=>{ localStorage.setItem('cc-purchases',JSON.stringify(purchases)); },[purchases]);

  useEffect(()=>{
    if (!supabase) return;
    let alive=true;
    const loadCloud=async(user)=>{
      if(!user){setSession(null);setCloudReady(false);return;}
      setSession(user);
      const [r,e,p]=await Promise.all([
        supabase.from('consumption_records').select('*').order('date').order('time'),
        supabase.from('household_events').select('*').order('date'),
        supabase.from('stock_purchases').select('*').order('date')
      ]);
      if(!alive)return;
      if(r.error||e.error||p.error){setNotice('Errore nel caricamento cloud. Controlla le tabelle e i permessi Supabase.');return;}
      setRecords(r.data); setEvents(e.data); setPurchases(p.data); setCloudReady(true); setNotice('Dati sincronizzati con il cloud.');
    };
    supabase.auth.getSession().then(({data})=>loadCloud(data.session?.user));
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,s)=>{loadCloud(s?.user);});
    return ()=>{alive=false;subscription.unsubscribe()};
  },[]);

  async function sendLoginLink(e){
    e.preventDefault();
    if(!supabase){setNotice('Configura prima le credenziali Supabase nel file .env.local.');return;}
    const {error}=await supabase.auth.signInWithOtp({email,options:{emailRedirectTo:window.location.origin}});
    setNotice(error?`Accesso non riuscito: ${error.message}`:'Ti abbiamo inviato un link di accesso via email. Aprilo su questo dispositivo.');
  }
  async function logout(){if(supabase)await supabase.auth.signOut();setCloudReady(false);setSession(null);setNotice('Sei uscito dal tuo account.');}

  const pelletTypes = useMemo(()=>[...new Set(records.map(r=>r.pellet_type))].sort(),[records]);
  const filtered = useMemo(()=>records.filter(r=>(filterYear==='all'||r.date.startsWith(filterYear))&&(filterType==='all'||r.pellet_type===filterType)).slice().sort((a,b)=>(b.date+(b.time||'')).localeCompare(a.date+(a.time||''))),[records,filterYear,filterType]);
  const totalBags = records.reduce((s,r)=>s+Number(r.bags),0);
  const totalSpend = records.reduce((s,r)=>s+Number(r.bags)*Number(r.price_per_bag),0);
  const year = String(new Date().getFullYear());
  const yearRows = records.filter(r=>r.date.startsWith(year));
  const yearBags = yearRows.reduce((s,r)=>s+Number(r.bags),0);
  const yearSpend = yearRows.reduce((s,r)=>s+Number(r.bags)*Number(r.price_per_bag),0);
  const stockBought = purchases.reduce((s,p)=>s+Number(p.bags),0);
  const firstPurchase = purchases.map(p=>p.date).sort()[0];
  const stockUsed = firstPurchase ? records.filter(r=>r.date>=firstPurchase).reduce((s,r)=>s+Number(r.bags),0) : 0;
  const stock = stockBought-stockUsed;
  const years = [...new Set(records.map(r=>r.date.slice(0,4)))].sort();

  async function addRecord(e) {
    e.preventDefault();
    const row={date:form.date,time:form.time||null,bags:Number(form.bags),pellet_type:form.pellet_type.trim().toLowerCase(),price_per_bag:Number(form.price_per_bag),note:form.note.trim()||null};
    if(!row.date||row.bags<1||row.price_per_bag<=0||!row.pellet_type){setNotice('Controlla data, quantità, tipo pellet e prezzo.');return;}
    if(supabase && cloudReady){
      const {data:{user}}=await supabase.auth.getUser();
      const {data,error}=await supabase.from('consumption_records').insert({...row,owner_id:user.id}).select().single();
      if(error){setNotice(`Salvataggio cloud non riuscito: ${error.message}`);return;}
      setRecords(v=>[...v,data]);
    } else setRecords(v=>[...v,{...row,id:crypto.randomUUID()}]);
    if(row.note) setEvents(v=>[...v,{id:crypto.randomUUID(),date:row.date,description:row.note}]);
    setForm(v=>({...v,date:today,time:'',bags:2,note:''}));
    setNotice('Registrazione salvata.');
  }
  async function removeRecord(id) {
    if(!confirm('Eliminare questa registrazione?'))return;
    if(supabase&&cloudReady){const {error}=await supabase.from('consumption_records').delete().eq('id',id);if(error){setNotice('Eliminazione cloud non riuscita.');return;}}
    setRecords(v=>v.filter(r=>r.id!==id));setNotice('Registrazione eliminata.');
  }
  async function addPurchase(e) {
    e.preventDefault();
    const row={...purchase,bags:Number(purchase.bags),price_per_bag:Number(purchase.price_per_bag)};
    if(row.bags<1||row.price_per_bag<=0){setNotice('Quantità e prezzo devono essere maggiori di zero.');return;}
    if(supabase&&cloudReady){const {data:{user}}=await supabase.auth.getUser();const {data,error}=await supabase.from('stock_purchases').insert({...row,owner_id:user.id}).select().single();if(error){setNotice('Acquisto non salvato nel cloud.');return;}setPurchases(v=>[...v,data]);}
    else setPurchases(v=>[...v,{...row,id:crypto.randomUUID()}]);
    setNotice('Acquisto aggiunto.');
  }
  async function removePurchase(id) {
    if(!confirm('Eliminare questo acquisto?'))return;
    if(supabase&&cloudReady){const {error}=await supabase.from('stock_purchases').delete().eq('id',id);if(error){setNotice('Eliminazione cloud non riuscita.');return;}}
    setPurchases(v=>v.filter(p=>p.id!==id));
  }
  function exportBackup(){
    const blob=new Blob([JSON.stringify({records,events,purchases,temperatures:temps,exported_at:new Date().toISOString()},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='backup-consumi-caldaia.json';a.click();URL.revokeObjectURL(url);
  }
  const nav=[['panoramica',LayoutDashboard,'Panoramica'],['registro',ClipboardList,'Registro'],['analisi',ChartNoAxesCombined,'Analisi'],['scorte',Package,'Scorte']];
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">▦</div><div><b>Consumi Caldaia</b><small>Caldaia a pellet</small></div></div>
      <nav>{nav.map(([id,Icon,label])=><button key={id} className={view===id?'active':''} onClick={()=>setView(id)}><Icon size={18}/>{label}</button>)}</nav>
      <div className="sidebar-foot"><span className="sync-dot"/>{supabase?(cloudReady?'Cloud sincronizzato':'Cloud configurato'):'Modalità locale'}<p>I dati locali restano su questo browser finché non configuriamo Supabase.</p></div>
    </aside>
    <main className="main">
      <header className="topbar"><div><span className="eyebrow">GESTIONE DOMESTICA</span><h1>{nav.find(n=>n[0]===view)?.[2]}</h1></div><div className="top-actions"><button className="icon-btn" title="Esporta backup" onClick={exportBackup}><Download size={18}/></button><button className="icon-btn" title="Cambia tema" onClick={()=>setDark(v=>!v)}>{dark?<Sun size={18}/>:<Moon size={18}/>}</button><span className="status"><Cloud size={15}/>{cloudReady?'Sincronizzato':'Locale'}</span>{supabase?(session?<button className="text-btn" onClick={logout}>Esci</button>:<form className="login-inline" onSubmit={sendLoginLink}><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="La tua email" required/><button className="text-btn" type="submit">Accedi</button></form>):null}</div></header>
      {notice&&<div className="notice" role="status">{notice}<button onClick={()=>setNotice('')}>×</button></div>}
      {view==='panoramica'&&<section className="stack">
        <div className="welcome"><div><span className="eyebrow">IL TUO STORICO, SOTTO CONTROLLO</span><h2>La situazione della caldaia.</h2><p>Consumi, spese e scorte in un unico posto.</p></div><button className="primary" onClick={()=>setView('registro')}><Plus size={17}/> Nuova registrazione</button></div>
        <div className="kpis">
          <Kpi label="Ballini totali" value={fmt(totalBags)} hint={`${records.length} registrazioni`}/>
          <Kpi label={`Ballini ${year}`} value={fmt(yearBags)} hint="Anno corrente"/>
          <Kpi label={`Spesa ${year}`} value={euro(yearSpend)} hint="Calcolata dai carichi"/>
          <Kpi label="Scorta stimata" value={stockBought?`${fmt(Math.max(stock,0))} ballini`:'—'} hint={stockBought?'Acquisti meno consumi':'Registra un acquisto'}/>
        </div>
        <div className="panel"><div className="panel-head"><div><h3>Consumi per anno</h3><p>Ballini registrati e spesa associata</p></div></div><div className="year-bars">{years.map(y=>{const rs=records.filter(r=>r.date.startsWith(y));const bags=rs.reduce((s,r)=>s+Number(r.bags),0);const spend=rs.reduce((s,r)=>s+Number(r.bags)*Number(r.price_per_bag),0);return <div className="year-row" key={y}><b>{y}</b><div className="bar-track"><i style={{width:`${Math.max(3,bags/Math.max(totalBags,1)*100)}%`}}/></div><span>{fmt(bags)} ballini</span><small>{euro(spend)}</small></div>})}</div></div>
        <div className="panel"><div className="panel-head"><div><h3>Registrazioni recenti</h3><p>Gli ultimi carichi inseriti</p></div><button className="text-btn" onClick={()=>setView('registro')}>Apri registro →</button></div><div className="recent-list">{records.slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,6).map(r=><div className="recent-row" key={r.id}><div><b>{dateFmt(r.date)}</b><small>{r.pellet_type}</small></div><div className="align-right"><b>{r.bags} ballini</b><small>{euro(r.bags*r.price_per_bag)}</small></div></div>)}</div></div>
      </section>}
      {view==='registro'&&<section className="stack">
        <form className="panel" onSubmit={addRecord}><div className="panel-head"><div><h3>Nuova registrazione</h3><p>Inserisci un carico di pellet</p></div></div><div className="form-grid">
          <Field label="Data"><input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} required/></Field>
          <Field label="Ora (facoltativa)"><input type="time" value={form.time} onChange={e=>setForm({...form,time:e.target.value})}/></Field>
          <Field label="Ballini"><input type="number" min="1" step="1" value={form.bags} onChange={e=>setForm({...form,bags:e.target.value})} required/></Field>
          <Field label="Tipo pellet"><input list="pellet-options" value={form.pellet_type} onChange={e=>setForm({...form,pellet_type:e.target.value})} required/><datalist id="pellet-options">{pelletTypes.map(t=><option key={t} value={t}/>)}</datalist></Field>
          <Field label="Costo a ballino (€)"><input type="number" min="0.01" step="0.01" value={form.price_per_bag} onChange={e=>setForm({...form,price_per_bag:e.target.value})} required/></Field>
          <Field label="Nota"><input value={form.note} onChange={e=>setForm({...form,note:e.target.value})} placeholder="es. nuovo bancale"/></Field>
        </div><div className="form-bottom"><span>Totale registrazione <b>{euro(Number(form.bags)*Number(form.price_per_bag))}</b></span><button className="primary" type="submit">Salva registrazione</button></div></form>
        <div className="panel"><div className="panel-head"><div><h3>Storico</h3><p>{filtered.length} registrazioni · {fmt(filtered.reduce((s,r)=>s+Number(r.bags),0))} ballini</p></div><div className="filters"><select value={filterYear} onChange={e=>setFilterYear(e.target.value)}><option value="all">Tutti gli anni</option>{years.map(y=><option key={y}>{y}</option>)}</select><select value={filterType} onChange={e=>setFilterType(e.target.value)}><option value="all">Tutti i pellet</option>{pelletTypes.map(t=><option key={t}>{t}</option>)}</select></div></div>
          <div className="table-wrap"><table><thead><tr><th>Data</th><th>Ora</th><th>Ballini</th><th>Pellet</th><th>€/ballino</th><th>Spesa</th><th></th></tr></thead><tbody>{filtered.map(r=><tr key={r.id}><td>{dateFmt(r.date)}</td><td>{r.time||'—'}</td><td>{r.bags}</td><td><span className="tag">{r.pellet_type}</span></td><td>{euro(r.price_per_bag)}</td><td>{euro(r.bags*r.price_per_bag)}</td><td><button className="danger-icon" title="Elimina" onClick={()=>removeRecord(r.id)}><Trash2 size={16}/></button></td></tr>)}</tbody></table></div>
        </div>
      </section>}
      {view==='analisi'&&<section className="stack">
        <div className="kpis"><Kpi label="Ballini complessivi" value={fmt(totalBags)}/><Kpi label="Spesa complessiva" value={euro(totalSpend)}/><Kpi label="Costo medio / ballino" value={euro(totalBags?totalSpend/totalBags:0)}/><Kpi label="Tipi di pellet" value={pelletTypes.length}/></div>
        <div className="panel"><div className="panel-head"><div><h3>Spesa per anno</h3><p>Confronto dello storico</p></div></div><div className="year-bars">{years.map(y=>{const rs=records.filter(r=>r.date.startsWith(y));const spend=rs.reduce((s,r)=>s+r.bags*r.price_per_bag,0);return <div className="year-row" key={y}><b>{y}</b><div className="bar-track"><i style={{width:`${Math.max(3,spend/Math.max(totalSpend,1)*100)}%`}}/></div><span>{euro(spend)}</span></div>})}</div></div>
        <div className="panel"><div className="panel-head"><div><h3>Temperature medie mensili</h3><p>Dati importati dal file originale</p></div></div><div className="temp-grid">{temps.map(t=><div key={t.month}><small>{t.month}</small><b>{new Intl.NumberFormat('it-IT',{maximumFractionDigits:1}).format(t.avg_celsius)} °C</b></div>)}</div></div>
        <div className="panel"><div className="panel-head"><div><h3>Riepilogo per tipo di pellet</h3></div></div><div className="table-wrap"><table><thead><tr><th>Pellet</th><th>Ballini</th><th>Spesa</th><th>Media €/ballino</th></tr></thead><tbody>{pelletTypes.map(t=>{const rs=records.filter(r=>r.pellet_type===t);const b=rs.reduce((s,r)=>s+r.bags,0),sp=rs.reduce((s,r)=>s+r.bags*r.price_per_bag,0);return <tr key={t}><td>{t}</td><td>{fmt(b)}</td><td>{euro(sp)}</td><td>{euro(b?sp/b:0)}</td></tr>})}</tbody></table></div></div>
      </section>}
      {view==='scorte'&&<section className="stack">
        <div className="kpis"><Kpi label="Ballini acquistati" value={fmt(stockBought)}/><Kpi label="Ballini consumati" value={fmt(stockUsed)}/><Kpi label="Scorta stimata" value={`${fmt(Math.max(stock,0))} ballini`}/><Kpi label="Spesa storica" value={euro(totalSpend)}/></div>
        <form className="panel" onSubmit={addPurchase}><div className="panel-head"><div><h3>Registra acquisto</h3><p>Gli acquisti alimentano il calcolo delle scorte</p></div></div><div className="form-grid">
          <Field label="Data"><input type="date" value={purchase.date} onChange={e=>setPurchase({...purchase,date:e.target.value})}/></Field><Field label="Ballini"><input type="number" min="1" value={purchase.bags} onChange={e=>setPurchase({...purchase,bags:e.target.value})}/></Field><Field label="Tipo pellet"><input value={purchase.pellet_type} onChange={e=>setPurchase({...purchase,pellet_type:e.target.value})}/></Field><Field label="Costo a ballino (€)"><input type="number" min="0.01" step="0.01" value={purchase.price_per_bag} onChange={e=>setPurchase({...purchase,price_per_bag:e.target.value})}/></Field>
        </div><div className="form-bottom"><span>Totale acquisto <b>{euro(purchase.bags*purchase.price_per_bag)}</b></span><button className="primary" type="submit">Aggiungi acquisto</button></div></form>
        <div className="panel"><div className="panel-head"><div><h3>Storico acquisti</h3><p>{purchases.length} acquisti registrati</p></div></div>{purchases.length?<div className="table-wrap"><table><thead><tr><th>Data</th><th>Pellet</th><th>Ballini</th><th>Prezzo/ballino</th><th>Totale</th><th></th></tr></thead><tbody>{purchases.map(p=><tr key={p.id}><td>{dateFmt(p.date)}</td><td>{p.pellet_type}</td><td>{p.bags}</td><td>{euro(p.price_per_bag)}</td><td>{euro(p.bags*p.price_per_bag)}</td><td><button className="danger-icon" onClick={()=>removePurchase(p.id)}><Trash2 size={16}/></button></td></tr>)}</tbody></table></div>:<p className="empty">Ancora nessun acquisto. Inserisci il primo bancale per calcolare le scorte.</p>}</div>
      </section>}
    </main>
  </div>;
}
function Kpi({label,value,hint}){return <article className="kpi"><span>{label}</span><strong>{value}</strong>{hint&&<small>{hint}</small>}</article>}
function Field({label,children}){return <label className="field"><span>{label}</span>{children}</label>}
