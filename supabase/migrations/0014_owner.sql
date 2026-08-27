-- ===========================================================================
-- 0014 · Un dueño por encima del administrador
-- ===========================================================================
-- Hasta ahora `is_admin` era plano: quien lo tuviera podía dárselo a
-- cualquiera y, sobre todo, QUITÁRSELO A QUIEN SE LO DIO. Eso hace que ceder
-- el panel a alguien de la oficina sea irreversible en la práctica.
--
-- Con esto:
--   · El dueño puede repartir y retirar el administrador cuando quiera.
--   · Un administrador NO puede tocar los roles de nadie, ni siquiera para
--     darse más permisos o para degradar al dueño.
--   · Siempre queda al menos un dueño: la base se niega a quedarse sin él,
--     porque nadie podría volver a repartir permisos.
--
-- El dueño ES administrador a todos los efectos: is_admin() lo incluye, así
-- que todas las policies escritas hasta ahora siguen valiendo tal cual.
-- ===========================================================================

alter table players
  add column if not exists is_owner boolean not null default false;

comment on column players.is_owner is
  'Manda sobre is_admin: reparte y retira el administrador. Un admin no puede tocarlo.';

-- ---------------------------------------------------------------------------
-- 1 · Quién es dueño
-- ---------------------------------------------------------------------------
create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_owner from players where user_id = auth.uid()), false);
$$;

revoke execute on function public.is_owner() from public;
grant   execute on function public.is_owner() to anon, authenticated;

-- El dueño manda sobre el administrador, así que cuenta como tal. Así ninguna
-- policy de las que ya existen necesita cambiar.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select is_admin or is_owner from players where user_id = auth.uid()),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- 2 · Quién puede tocar los roles
-- ---------------------------------------------------------------------------
-- Reemplaza al guardián de 0003/0009. Mantiene lo que ya hacía —que nadie se
-- autopromocione ni robe la identidad de otro— y añade la capa del dueño.
create or replace function guard_player_self_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_owners integer;
begin
  -- Nunca quedarse sin dueño: sin él nadie podría repartir permisos otra vez,
  -- y habría que entrar por SQL a arreglarlo. Se comprueba SIEMPRE, incluso
  -- para el propio dueño y para el service_role.
  if old.is_owner and not new.is_owner then
    select count(*) into v_owners from players where is_owner;
    if v_owners <= 1 then
      raise exception 'No puedes quitar al único dueño: la quiniela se quedaría sin quien reparta permisos';
    end if;
  end if;

  -- Sin sesión detrás (editor SQL del panel, service_role, migraciones) se
  -- deja pasar: quien llama ya pasó por una puerta de confianza anterior. Es
  -- el mismo criterio que 0009 y que recalcular_jornada.
  if auth.uid() is null then
    return new;
  end if;

  -- Los roles son cosa del dueño, y de nadie más. Un administrador no puede
  -- repartirse permisos ni degradar a quien se los dio.
  if (new.is_owner is distinct from old.is_owner
      or new.is_admin is distinct from old.is_admin)
     and not public.is_owner() then
    raise exception 'Solo el dueño puede cambiar los roles';
  end if;

  if public.is_admin() then
    return new;
  end if;

  -- Y lo de siempre para el resto: cada uno puede retocar su perfil, no su
  -- identidad ni su estado.
  if new.activo  is distinct from old.activo
     or new.user_id is distinct from old.user_id
     or new.alias   is distinct from old.alias
     or new.email   is distinct from old.email then
    raise exception 'Solo el administrador puede cambiar ese campo';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3 · Tampoco se borra a un dueño
-- ---------------------------------------------------------------------------
-- Borrar la fila entera se saltaría el guardián de UPDATE, y con ella se irían
-- sus boletos y su caja por cascada.
create or replace function guard_player_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.is_owner and auth.uid() is not null and not public.is_owner() then
    raise exception 'Solo el dueño puede borrar a un dueño';
  end if;
  return old;
end;
$$;

drop trigger if exists players_guard_delete on players;
create trigger players_guard_delete
  before delete on players
  for each row execute function guard_player_delete();

-- ---------------------------------------------------------------------------
-- 4 · El primer dueño
-- ---------------------------------------------------------------------------
-- Quien ya fuera administrador y esté enlazado a una cuenta pasa a ser dueño,
-- pero solo si no hay ninguno todavía. En una oficina normal es una sola
-- persona; si hubiera varios administradores, se puede afinar después desde el
-- panel — pero al menos nadie se queda fuera.
update players
   set is_owner = true
 where is_admin
   and user_id is not null
   and not exists (select 1 from players where is_owner);
