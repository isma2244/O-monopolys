-- O Monopolis Multiplayer · Supabase schema
-- 1) Crea un proyecto en Supabase.
-- 2) Abre SQL Editor y ejecuta esto.
-- 3) Copia Project URL y anon public key en la app.

create table if not exists public.monopolis_games (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  state jsonb not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.monopolis_games enable row level security;

drop policy if exists "monopolis read" on public.monopolis_games;
drop policy if exists "monopolis insert" on public.monopolis_games;
drop policy if exists "monopolis update" on public.monopolis_games;

create policy "monopolis read" on public.monopolis_games
for select using (true);

create policy "monopolis insert" on public.monopolis_games
for insert with check (true);

create policy "monopolis update" on public.monopolis_games
for update using (true) with check (true);

-- Si da error porque ya está añadida, ignóralo.
alter publication supabase_realtime add table public.monopolis_games;
