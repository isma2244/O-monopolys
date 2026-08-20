-- O Monopolis V6 · Seguridad Supabase
-- Ejecutar UNA VEZ en Supabase > SQL Editor.
-- Antes: Authentication > Providers > Anonymous Sign-Ins = ENABLED.
--
-- Qué cambia:
--   1) Cada dispositivo entra con Supabase Auth anónimo (sin email/contraseña).
--   2) Una partida solo puede leerse por usuarios que pertenezcan a ella.
--   3) Crear/unirse/guardar se hace mediante RPC controladas.
--   4) Se eliminan las políticas antiguas using(true).
--
-- Nota: las partidas creadas con V5 antes de esta migración no tienen membresías
-- y no serán recuperables automáticamente. Crea partidas nuevas con V6.

begin;

create schema if not exists private;

create table if not exists private.monopolis_members (
  game_id uuid not null references public.monopolis_games(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  player_id uuid not null,
  is_host boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (game_id, user_id),
  unique (game_id, player_id)
);

create index if not exists monopolis_members_user_game_idx
  on private.monopolis_members (user_id, game_id);

-- Helper privado para RLS. No se expone como RPC pública.
create or replace function private.is_monopolis_member(p_game_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.monopolis_members m
    where m.game_id = p_game_id
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_monopolis_host(p_game_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.monopolis_members m
    where m.game_id = p_game_id
      and m.user_id = (select auth.uid())
      and m.is_host = true
  );
$$;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
revoke all on all tables in schema private from public, anon, authenticated;
revoke all on function private.is_monopolis_member(uuid) from public, anon;
revoke all on function private.is_monopolis_host(uuid) from public, anon;
grant execute on function private.is_monopolis_member(uuid) to authenticated;
grant execute on function private.is_monopolis_host(uuid) to authenticated;

alter table public.monopolis_games enable row level security;

-- Eliminar políticas abiertas antiguas.
drop policy if exists "monopolis read" on public.monopolis_games;
drop policy if exists "monopolis insert" on public.monopolis_games;
drop policy if exists "monopolis update" on public.monopolis_games;
drop policy if exists "monopolis_games_select_member" on public.monopolis_games;

-- Solo miembros pueden leer la fila de su partida.
create policy "monopolis_games_select_member"
on public.monopolis_games
for select
to authenticated
using ((select private.is_monopolis_member(id)));

-- No INSERT/UPDATE directos desde el navegador. Las escrituras van por RPC.
revoke all on public.monopolis_games from anon;
revoke insert, update, delete, truncate, references, trigger on public.monopolis_games from authenticated;
grant select on public.monopolis_games to authenticated;

-- Crear partida y registrar al host de forma atómica.
create or replace function public.monopolis_create_game(
  p_state jsonb,
  p_player_id uuid
)
returns public.monopolis_games
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.monopolis_games%rowtype;
  v_code text;
  v_try integer;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_player_id is null
     or coalesce(p_state->>'phase', '') <> 'lobby'
     or coalesce(p_state->>'hostId', '') <> p_player_id::text
     or jsonb_typeof(p_state->'players') <> 'array'
     or jsonb_array_length(p_state->'players') <> 1
     or coalesce(p_state->'players'->0->>'id', '') <> p_player_id::text then
    raise exception 'INVALID_INITIAL_STATE';
  end if;

  -- Código de 6 cifras: fácil de dictar y mucho menos enumerable que el antiguo de 4.
  for v_try in 1..50 loop
    v_code := 'PIOR-' || lpad((floor(random() * 900000) + 100000)::integer::text, 6, '0');
    begin
      insert into public.monopolis_games (code, state, version, created_at, updated_at)
      values (v_code, p_state, 1, now(), now())
      returning * into v_game;
      exit;
    exception when unique_violation then
      v_game.id := null;
    end;
  end loop;

  if v_game.id is null then
    raise exception 'CODE_GENERATION_FAILED';
  end if;

  insert into private.monopolis_members (game_id, user_id, player_id, is_host)
  values (v_game.id, (select auth.uid()), p_player_id, true);

  return v_game;
end;
$$;

-- Unirse por código. La función comprueba lobby, límite y ficha libre antes de
-- añadir al jugador y crear su membresía.
create or replace function public.monopolis_join_game(
  p_code text,
  p_player_id uuid,
  p_name text,
  p_token text
)
returns public.monopolis_games
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.monopolis_games%rowtype;
  v_state jsonb;
  v_player jsonb;
  v_name text;
  v_log text;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_player_id is null then
    raise exception 'PLAYER_ID_REQUIRED';
  end if;

  if not (p_token = any(array['cabuxa','tractor','viño','casa','castaña','bus','balon','forno']::text[])) then
    raise exception 'FICHA_NON_VALIDA';
  end if;

  select * into v_game
  from public.monopolis_games
  where code = upper(trim(p_code))
  for update;

  if v_game.id is null then
    raise exception 'PARTIDA_NON_ATOPADA';
  end if;

  -- Se o mesmo usuario xa pertence á partida, simplemente devolvemos o estado.
  if exists (
    select 1 from private.monopolis_members m
    where m.game_id = v_game.id and m.user_id = (select auth.uid())
  ) then
    return v_game;
  end if;

  if coalesce(v_game.state->>'phase', 'lobby') <> 'lobby' then
    raise exception 'PARTIDA_XA_COMEZOU';
  end if;

  if jsonb_array_length(coalesce(v_game.state->'players', '[]'::jsonb)) >= 8 then
    raise exception 'PARTIDA_CHEA';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(v_game.state->'players', '[]'::jsonb)) p
    where p->>'token' = p_token
  ) then
    raise exception 'FICHA_OCUPADA';
  end if;

  v_name := left(nullif(trim(coalesce(p_name, '')), ''), 30);
  if v_name is null then v_name := 'Xogador'; end if;

  v_player := jsonb_build_object(
    'id', p_player_id::text,
    'name', v_name,
    'token', p_token,
    'money', 15000,
    'position', 0,
    'skipTurns', 0,
    'keptCards', '[]'::jsonb,
    'connectedAt', (extract(epoch from clock_timestamp()) * 1000)::bigint
  );

  v_state := jsonb_set(
    v_game.state,
    '{players}',
    coalesce(v_game.state->'players', '[]'::jsonb) || jsonb_build_array(v_player),
    true
  );

  v_log := to_char(clock_timestamp() at time zone 'Europe/Madrid', 'HH24:MI') || ' · ' || v_name || ' entrou na partida';
  v_state := jsonb_set(
    v_state,
    '{log}',
    coalesce(v_state->'log', '[]'::jsonb) || jsonb_build_array(to_jsonb(v_log)),
    true
  );

  update public.monopolis_games
  set state = v_state,
      version = version + 1,
      updated_at = now()
  where id = v_game.id
  returning * into v_game;

  insert into private.monopolis_members (game_id, user_id, player_id, is_host)
  values (v_game.id, (select auth.uid()), p_player_id, false);

  return v_game;
end;
$$;

-- Guardado optimista. Solo miembros, versión obligatoria y estructura de
-- identidad de jugadores protegida. El host es el único que puede iniciar.
create or replace function public.monopolis_save_game(
  p_game_id uuid,
  p_expected_version integer,
  p_state jsonb
)
returns public.monopolis_games
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.monopolis_games%rowtype;
  v_old_identity jsonb;
  v_new_identity jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not private.is_monopolis_member(p_game_id) then
    raise exception 'NOT_A_GAME_MEMBER';
  end if;

  select * into v_game
  from public.monopolis_games
  where id = p_game_id
  for update;

  if v_game.id is null then
    raise exception 'PARTIDA_NON_ATOPADA';
  end if;

  if v_game.version <> p_expected_version then
    raise exception 'VERSION_CONFLICT';
  end if;

  if pg_column_size(p_state) > 1048576 then
    raise exception 'STATE_TOO_LARGE';
  end if;

  if coalesce(p_state->>'hostId', '') <> coalesce(v_game.state->>'hostId', '') then
    raise exception 'HOST_IMMUTABLE';
  end if;

  -- En lobby, el único guardado normal permitido es que el host inicie.
  if coalesce(v_game.state->>'phase', 'lobby') = 'lobby' then
    if coalesce(p_state->>'phase', 'lobby') <> 'playing' then
      raise exception 'LOBBY_CHANGES_USE_RPC';
    end if;
    if not private.is_monopolis_host(p_game_id) then
      raise exception 'HOST_ONLY';
    end if;
    if jsonb_array_length(coalesce(v_game.state->'players', '[]'::jsonb)) < 2 then
      raise exception 'MIN_PLAYERS_2';
    end if;
  elsif coalesce(v_game.state->>'phase', '') = 'playing'
        and coalesce(p_state->>'phase', '') <> 'playing' then
    raise exception 'INVALID_PHASE_CHANGE';
  end if;

  -- IDs, nomes e fichas non poden ser engadidos/eliminados/cambiados por un save.
  -- As altas de xogadores só se realizan en monopolis_join_game().
  select coalesce(jsonb_agg(
           jsonb_build_object('id', p->>'id', 'name', p->>'name', 'token', p->>'token')
           order by ord
         ), '[]'::jsonb)
  into v_old_identity
  from jsonb_array_elements(coalesce(v_game.state->'players', '[]'::jsonb)) with ordinality as x(p, ord);

  select coalesce(jsonb_agg(
           jsonb_build_object('id', p->>'id', 'name', p->>'name', 'token', p->>'token')
           order by ord
         ), '[]'::jsonb)
  into v_new_identity
  from jsonb_array_elements(coalesce(p_state->'players', '[]'::jsonb)) with ordinality as x(p, ord);

  if v_old_identity <> v_new_identity then
    raise exception 'PLAYER_IDENTITY_IMMUTABLE';
  end if;

  update public.monopolis_games
  set state = p_state,
      version = version + 1,
      updated_at = now()
  where id = p_game_id
  returning * into v_game;

  return v_game;
end;
$$;

revoke all on function public.monopolis_create_game(jsonb, uuid) from public, anon;
revoke all on function public.monopolis_join_game(text, uuid, text, text) from public, anon;
revoke all on function public.monopolis_save_game(uuid, integer, jsonb) from public, anon;

grant execute on function public.monopolis_create_game(jsonb, uuid) to authenticated;
grant execute on function public.monopolis_join_game(text, uuid, text, text) to authenticated;
grant execute on function public.monopolis_save_game(uuid, integer, jsonb) to authenticated;

-- Realtime: añadir solo si aún no está en la publicación.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'monopolis_games'
  ) then
    alter publication supabase_realtime add table public.monopolis_games;
  end if;
end $$;

commit;
