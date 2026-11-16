-- Consumi Caldaia: schema Supabase per un solo proprietario.
-- Esegui nel SQL Editor del tuo progetto Supabase.
create extension if not exists pgcrypto;

create table if not exists public.consumption_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  legacy_key text,
  date date not null,
  time time,
  bags integer not null check (bags > 0),
  pellet_type text not null,
  price_per_bag numeric(10,2) not null check (price_per_bag > 0),
  note text,
  created_at timestamptz not null default now(),
  unique(owner_id, legacy_key)
);
create table if not exists public.household_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  legacy_key text,
  date date not null,
  description text not null,
  created_at timestamptz not null default now(),
  unique(owner_id, legacy_key)
);
create table if not exists public.stock_purchases (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  bags integer not null check (bags > 0),
  pellet_type text not null,
  price_per_bag numeric(10,2) not null check (price_per_bag > 0),
  created_at timestamptz not null default now()
);
create table if not exists public.monthly_temperatures (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  month text not null check (month ~ '^\\d{4}-\\d{2}$'),
  avg_celsius numeric(5,2) not null,
  unique(owner_id, month)
);

alter table public.consumption_records enable row level security;
alter table public.household_events enable row level security;
alter table public.stock_purchases enable row level security;
alter table public.monthly_temperatures enable row level security;

create policy "owner manages own consumption" on public.consumption_records
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owner manages own events" on public.household_events
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owner manages own purchases" on public.stock_purchases
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owner manages own temperatures" on public.monthly_temperatures
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
