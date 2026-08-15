-- ===========================================================================
-- 0008 · service_role, enlace de cuentas y alias para el Excel
-- ===========================================================================
-- Tres cosas que salieron a la luz con la app ya en producción.
--
-- 1) service_role no tenía acceso a NINGUNA tabla. 0005 concedió permisos a
--    anon y authenticated, pero se dejó fuera a service_role, que es el rol
--    con el que corre la ingesta de LAE desde GitHub Actions. Comprobado
--    contra la API real: 403 en las ocho tablas. La sincronización automática
--    habría fallado entera la primera vez que se lanzara.
--
-- 2) `players.user_id` se quedaba a NULL. La fila del jugador se crea a mano
--    (con su email) antes de que la persona se registre; cuando entra por
--    primera vez, Supabase crea su usuario en auth.users pero nada las unía,
--    así que `me()` devolvía NULL y la app no reconocía a nadie como jugador.
--
-- 3) El importador de Excel casa por `alias` o `nombre`. En la práctica la
--    gente escribe "Alex", "Alejandro L." o el apodo de la oficina, así que
--    hace falta poder registrar varias formas de escribir a cada uno.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1 · Permisos para service_role (la ingesta de LAE)
-- ---------------------------------------------------------------------------
-- service_role salta RLS por definición, pero necesita igualmente el permiso
-- de tabla de Postgres, que es una puerta anterior e independiente.
grant usage on schema public to service_role;
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;

alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on functions to service_role;

-- v_players_admin ya se filtra sola con is_admin(), pero no hay motivo para
-- que un visitante anónimo pueda siquiera consultarla.
revoke select on v_players_admin from anon;

-- ---------------------------------------------------------------------------
-- 2 · Enlazar cada jugador con su cuenta
-- ---------------------------------------------------------------------------

-- Los que ya se hayan registrado antes de esta migración.
update players p
   set user_id = u.id
  from auth.users u
 where lower(u.email) = lower(p.email)
   and p.user_id is null;

-- Y de aquí en adelante, automático: cuando alguien entra por primera vez,
-- Supabase inserta su fila en auth.users y este trigger la ata al jugador que
-- el administrador ya había dado de alta con ese mismo correo.
--
-- Si no hay ningún jugador con ese email no pasa nada: la cuenta existe pero
-- no queda vinculada, y el administrador puede asignarla luego desde el panel.
-- Es deliberado — así entrar con un correo cualquiera no te convierte en
-- participante de la quiniela.
create or replace function public.enlazar_jugador_al_registrarse()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update players
     set user_id = new.id
   where user_id is null
     and lower(email) = lower(new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.enlazar_jugador_al_registrarse();

-- ---------------------------------------------------------------------------
-- 3 · Varias formas de escribir el nombre de cada uno
-- ---------------------------------------------------------------------------
alter table players
  add column if not exists alias_alternativos text[] not null default '{}';

comment on column players.alias_alternativos is
  'Otras formas en que esa persona aparece escrita en los Excel: apodos, nombre con apellido, abreviaturas. El importador prueba todas.';

-- La columna es pública como el resto del perfil (no es dato sensible), pero
-- hay que concederla explícitamente porque 0007 dejó `players` con permisos
-- columna a columna para poder mantener `email` fuera.
grant select (alias_alternativos) on players to anon, authenticated;
