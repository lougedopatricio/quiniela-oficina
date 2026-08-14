-- ===========================================================================
-- 0003 · Row Level Security
-- ===========================================================================
-- Esta es la migración que de verdad protege la app. La anon key viaja dentro
-- del bundle publicado en GitHub Pages y cualquiera puede extraerla y hablar
-- con Supabase directamente. Por tanto: NINGUNA regla puede depender de que el
-- frontend "no haga" una consulta. Todo se decide aquí.
--
-- La regla que más importa en la práctica no es de privacidad, es de juego
-- limpio: mientras una jornada está abierta, nadie puede leer la columna de
-- otro. Si eso solo se cumpliera ocultándolo en la interfaz, se saltaría desde
-- la consola del navegador en diez segundos.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Helpers · SECURITY DEFINER para poder consultar `players` desde las policies
-- de la propia tabla `players` sin provocar recursión infinita de RLS.
-- ---------------------------------------------------------------------------
create or replace function public.me() returns uuid
language sql stable security definer set search_path = public as $$
  select id from players where user_id = auth.uid();
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from players where user_id = auth.uid()), false);
$$;

revoke execute on function public.me(), public.is_admin() from public;
grant   execute on function public.me(), public.is_admin() to anon, authenticated;

alter table players       enable row level security;
alter table seasons       enable row level security;
alter table rounds        enable row level security;
alter table matches       enable row level security;
alter table bets          enable row level security;
alter table round_scores  enable row level security;
alter table ledger        enable row level security;
alter table pot_movements enable row level security;

-- ---------------------------------------------------------------------------
-- Datos públicos · la clasificación se ve sin estar registrado
-- ---------------------------------------------------------------------------
create policy players_lectura       on players       for select using (true);
create policy seasons_lectura       on seasons       for select using (true);
create policy rounds_lectura        on rounds        for select using (true);
create policy matches_lectura       on matches       for select using (true);
create policy round_scores_lectura  on round_scores  for select using (true);
create policy pot_lectura           on pot_movements for select using (true);

-- El email de los compañeros no es público aunque la fila sí lo sea.
-- RLS filtra filas, no columnas: esto se resuelve con permisos de columna.
revoke select (email) on players from anon, authenticated;

-- ...y el admin lo lee por aquí. security_invoker queda desactivado a
-- propósito (es el modo por defecto) para que la vista pueda ver la columna,
-- con el filtro is_admin() como única puerta.
create view v_players_admin as
  select id, user_id, nombre, alias, email, is_admin, activo, created_at
  from players
  where public.is_admin();

-- ---------------------------------------------------------------------------
-- Escritura de la configuración · solo admin
-- ---------------------------------------------------------------------------
create policy players_admin_escribe on players
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy seasons_admin_escribe on seasons
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy rounds_admin_escribe on rounds
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy matches_admin_escribe on matches
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy round_scores_admin_escribe on round_scores
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy pot_admin_escribe on pot_movements
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Cada uno puede retocar su propio perfil (nombre visible, avatar).
-- No puede tocar is_admin ni activo: eso lo impide el trigger de más abajo.
create policy players_edita_su_perfil on players
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function guard_player_self_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then
    return new;
  end if;
  -- Un usuario normal no puede promocionarse ni reactivarse a sí mismo,
  -- ni robar la identidad de otro jugador.
  if new.is_admin is distinct from old.is_admin
     or new.activo  is distinct from old.activo
     or new.user_id is distinct from old.user_id
     or new.alias   is distinct from old.alias
     or new.email   is distinct from old.email then
    raise exception 'Solo el administrador puede cambiar ese campo';
  end if;
  return new;
end;
$$;

create trigger players_guard_self_update
  before update on players
  for each row execute function guard_player_self_update();

-- ---------------------------------------------------------------------------
-- Apuestas · la parte delicada
-- ---------------------------------------------------------------------------

-- Cada uno ve siempre la suya.
create policy bets_ve_la_suya on bets
  for select to authenticated
  using (player_id = public.me());

-- Las de los demás, solo cuando la jornada ya no admite cambios.
-- Mientras `estado = 'abierta'` (o sigue en borrador) son invisibles: es lo
-- que impide copiarse la columna del compañero.
create policy bets_ve_las_ajenas_tras_el_cierre on bets
  for select
  using (
    exists (
      select 1 from rounds r
      where r.id = bets.round_id
        and r.estado in ('cerrada', 'en_juego', 'finalizada')
    )
  );

create policy bets_admin on bets
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Rellenar y modificar la propia columna, solo con el plazo abierto.
-- La comprobación de `cierra_at` va aquí y no solo en la cuenta atrás de la
-- interfaz: el reloj del navegador lo controla el usuario, el de Postgres no.
create policy bets_crea_la_suya on bets
  for insert to authenticated
  with check (
    player_id = public.me()
    and exists (
      select 1 from rounds r
      where r.id = bets.round_id
        and r.estado = 'abierta'
        and (r.cierra_at is null or now() < r.cierra_at)
    )
  );

create policy bets_edita_la_suya on bets
  for update to authenticated
  using (
    player_id = public.me()
    and exists (
      select 1 from rounds r
      where r.id = bets.round_id
        and r.estado = 'abierta'
        and (r.cierra_at is null or now() < r.cierra_at)
    )
  )
  with check (
    player_id = public.me()
    and exists (
      select 1 from rounds r
      where r.id = bets.round_id
        and r.estado = 'abierta'
        and (r.cierra_at is null or now() < r.cierra_at)
    )
  );

-- ---------------------------------------------------------------------------
-- Ledger · cada uno ve su dinero; solo el admin lo mueve
-- ---------------------------------------------------------------------------
create policy ledger_ve_el_suyo on ledger
  for select to authenticated
  using (player_id = public.me() or public.is_admin());

create policy ledger_admin_escribe on ledger
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Realtime · lo que se mueve solo en la pantalla de clasificación
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table matches;
alter publication supabase_realtime add table round_scores;
alter publication supabase_realtime add table rounds;
