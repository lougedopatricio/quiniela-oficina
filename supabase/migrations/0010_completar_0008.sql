-- ===========================================================================
-- 0010 · Termina lo que 0008 no llegó a aplicar
-- ===========================================================================
-- El SQL Editor de Supabase ejecuta todo el bloque pegado como UNA transacción.
-- Cuando el UPDATE de 0008 chocó con guard_player_self_update() (arreglado
-- después en 0009), Postgres deshizo la migración 0008 ENTERA: no solo el
-- UPDATE que falló, también los GRANT a service_role, la columna
-- alias_alternativos y el trigger de enlace automático que iban unos
-- statements antes en el mismo bloque. 0009 solo rehizo el guardián y volvió
-- a lanzar el UPDATE — el resto de 0008 seguía sin existir.
--
-- Esta migración repite esa parte, ahora que el guardián ya no la bloquea.
-- Todo aquí es seguro de repetir si por lo que sea ya se hubiera aplicado.
-- ===========================================================================

grant usage on schema public to service_role;
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;

alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on functions to service_role;

revoke select on v_players_admin from anon;

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

alter table players
  add column if not exists alias_alternativos text[] not null default '{}';

grant select (alias_alternativos) on players to anon, authenticated;
