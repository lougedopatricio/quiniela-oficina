-- ===========================================================================
-- 0009 · El guardián de players deja pasar al panel del SQL Editor y a
-- service_role, no solo a quien tenga sesión de administrador
-- ===========================================================================
-- guard_player_self_update() (0003) solo comprobaba is_admin(), y esa función
-- depende de auth.uid(). Cuando la consulta corre sin una sesión de usuario
-- detrás —el SQL Editor del panel, un script con service_role, la propia
-- migración 0008 enlazando cuentas— auth.uid() es NULL, is_admin() devuelve
-- false, y el trigger bloqueaba hasta un UPDATE legítimo.
--
-- Es exactamente el mismo caso ya resuelto en recalcular_jornada (0004):
-- "si no hay auth.uid(), quien pregunta ya pasó por una puerta de confianza
-- anterior (postgres superuser o service_role), déjalo pasar". Un usuario
-- normal autenticado SIEMPRE tiene auth.uid(), así que esto no abre ningún
-- hueco para que alguien se autopromocione desde la app.
-- ===========================================================================

create or replace function guard_player_self_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
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

-- Y ahora sí, lo que 0008 no pudo terminar: enlazar a quien ya se hubiera
-- registrado antes de que existiera el trigger de enlace automático.
update players p
   set user_id = u.id
  from auth.users u
 where lower(u.email) = lower(p.email)
   and p.user_id is null;
