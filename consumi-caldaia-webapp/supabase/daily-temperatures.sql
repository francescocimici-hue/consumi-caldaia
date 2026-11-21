-- Temperature medie giornaliere (solo ottobre-aprile): circa 210 righe l'anno, pochi KB.
-- Incollare nell'SQL Editor di Supabase ed eseguire. E' sicuro rilanciarlo.
create table if not exists public.daily_temperatures (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  avg_celsius numeric(5,2) not null,
  unique (owner_id, date)
);

alter table public.daily_temperatures enable row level security;

drop policy if exists "owner manages own daily temperatures" on public.daily_temperatures;
create policy "owner manages own daily temperatures" on public.daily_temperatures
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
