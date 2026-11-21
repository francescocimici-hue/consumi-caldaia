-- Annulla la novita': elimina solo la tabella delle temperature giornaliere. Le altre tabelle non vengono toccate.
drop table if exists public.daily_temperatures;
