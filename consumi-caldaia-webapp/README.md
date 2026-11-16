# Consumi Caldaia — base webapp

Prima versione di lavoro: React + Vite, schema Supabase, storico estratto dal file HTML originale e modalità locale di anteprima.

## Avvio locale
1. Installa Node.js LTS.
2. Apri questa cartella nel terminale.
3. Esegui `npm install`.
4. Copia `.env.example` in `.env.local` e inserisci URL e chiave anonima Supabase quando il progetto cloud sarà pronto.
5. Esegui `npm run dev`.

Senza credenziali Supabase l'app si apre in modalità locale e salva nel browser. Non è ancora sincronizzata tra dispositivi.

## Supabase
1. Crea un progetto Supabase personale.
2. In Authentication abilita Email; l'app usa un link magico inviato alla tua casella, quindi non serve una password da gestire.
3. Esegui `supabase/schema.sql` nel SQL Editor.
4. Inserisci URL e chiave anonima in `.env.local`.
5. Per migrare lo storico usa il comando `npm run import:legacy` con `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_OWNER_ID` impostate nell'ambiente. La service role key va usata solo localmente nello script e mai inserita in `.env` Vite o nel frontend.
6. L'importatore non importa l'acquisto iniziale da 78 ballini perché nel file originale è marcato come esempio.

## Pubblicazione
La destinazione prevista è Vercel. Collega il repository GitHub, imposta `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` tra le Environment Variables e pubblica. Il sottodominio gratuito sarà del tipo `nome-progetto.vercel.app`.

## Stato e limiti di questa base
- Storico 2024–2026, eventi e temperature importati nel JSON di progetto.
- Dashboard, registro, analisi riepilogativa e gestione acquisti implementati come prima base.
- Persistenza locale nel browser disponibile.
- Schema SQL e importatore storico pronti.
- Login via link email e logout predisposti; sincronizzazione cloud di lettura e inserimento predisposta per le tabelle principali. Da completare: sincronizzazione completa di modifiche/eventi, grafici analitici avanzati, test end-to-end di migrazione e ripristino backup.
- Il file HTML originale è conservato in `public/Consumi-Caldaia-originale.html` come riferimento.
