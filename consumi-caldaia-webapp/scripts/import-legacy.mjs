import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const url=process.env.SUPABASE_URL;
const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
const ownerId=process.env.SUPABASE_OWNER_ID;
if(!url||!serviceKey||!ownerId) throw new Error('Imposta SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e SUPABASE_OWNER_ID.');
const db=createClient(url,serviceKey,{auth:{persistSession:false}});
const source=JSON.parse(fs.readFileSync(new URL('../src/legacy-data.json',import.meta.url),'utf8'));
const records=source.records.map(({legacy_id,...r})=>({...r,legacy_key:`legacy-record-${legacy_id}`,owner_id:ownerId}));
const events=source.events.map((e,i)=>({...e,legacy_key:`legacy-event-${i}`,owner_id:ownerId}));
const temperatures=source.temperatures.map(t=>({...t,owner_id:ownerId}));
for(const [table,rows] of [['consumption_records',records],['household_events',events],['monthly_temperatures',temperatures]]){
  const {error}=await db.from(table).upsert(rows,{onConflict:table==='monthly_temperatures'?'owner_id,month':'owner_id,legacy_key'});
  if(error) throw new Error(`Import ${table}: ${error.message}`);
  console.log(`${table}: ${rows.length} righe importate`);
}
console.log('Import completato. Gli acquisti marcati come esempio nel vecchio HTML non sono stati importati.');
