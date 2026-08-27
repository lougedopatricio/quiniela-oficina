-- ===========================================================================
-- 0012 · Las cuentas que se registran y no son de nadie
-- ===========================================================================
-- El enlace automático de 0008 ata `auth.users` con `players` por correo,
-- pero solo dispara en un sentido: cuando alguien se registra DESPUÉS de que
-- el administrador le haya creado la ficha. Faltaban los otros dos casos:
--
--   1) Alguien entra con un correo que no está dado de alta. Su cuenta existe
--      y puede navegar, pero no es participante de nada. Eso es deliberado
--      —entrar con un correo cualquiera no debe meterte en la quiniela—, pero
--      el administrador no tenía forma de verlo: el panel lee de
--      `v_players_admin`, que es `select ... from players`, así que una cuenta
--      sin ficha no aparecía por ningún lado. El comentario de 0008 decía que
--      "el administrador puede asignarla luego desde el panel"; ese panel no
--      existía. Esta migración lo hace posible.
--
--   2) El administrador crea la ficha DESPUÉS de que la persona se haya
--      registrado. El trigger de 0008 está en `after insert on auth.users`, y
--      esa inserción ya pasó, así que no volvía a dispararse nunca y la ficha
--      se quedaba con user_id NULL para siempre. 0009 arregló los casos que
--      había en ese momento con un UPDATE puntual, pero no el problema.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1 · El enlace por correo, también en el otro sentido
-- ---------------------------------------------------------------------------
-- Ahora que engancha por los dos lados, dar de alta a alguien que ya había
-- entrado lo vincula solo, sin que nadie tenga que acordarse.
--
-- Solo actúa cuando user_id viene NULL: nunca pisa un enlace que ya existe, y
-- así tampoco despierta a players_guard_self_update() cuando alguien edita su
-- propio perfil (ahí user_id ya está puesto y no cambia).
create or replace function public.enlazar_cuenta_por_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is null and new.email is not null then
    select u.id into new.user_id
      from auth.users u
     where lower(u.email) = lower(new.email)
     limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists players_enlaza_por_email on players;
create trigger players_enlaza_por_email
  before insert or update of email on players
  for each row execute function public.enlazar_cuenta_por_email();

comment on function public.enlazar_cuenta_por_email is
  'Ata la ficha a una cuenta ya registrada con el mismo correo. Es el reverso del trigger de 0008, que solo cubría registrarse después de existir la ficha.';

-- ---------------------------------------------------------------------------
-- 2 · Las cuentas huérfanas, para que el administrador las vea
-- ---------------------------------------------------------------------------
-- Mismo patrón que v_players_admin (0003): security_invoker desactivado —el
-- modo por defecto— para que la vista pueda leer auth.users, con is_admin()
-- como única puerta. Sin ese filtro, cualquiera con sesión leería los correos
-- de todo el mundo.
create or replace view public.v_cuentas_sin_ficha as
  select u.id                as user_id,
         u.email,
         u.created_at,
         u.last_sign_in_at
  from auth.users u
  where public.is_admin()
    and not exists (select 1 from players p where p.user_id = u.id);

revoke all on public.v_cuentas_sin_ficha from anon;
grant select on public.v_cuentas_sin_ficha to authenticated;

comment on view public.v_cuentas_sin_ficha is
  'Cuentas de auth.users que no están enlazadas a ningún participante. Solo la ve el administrador; se filtra ella sola con is_admin().';

-- ---------------------------------------------------------------------------
-- 3 · Recoger lo que quedara suelto del caso 2
-- ---------------------------------------------------------------------------
-- Fichas creadas después de que la persona se registrara, que hasta ahora no
-- tenían ningún trigger que las atara. Idempotente: si no hay ninguna, no
-- hace nada.
update players p
   set user_id = u.id
  from auth.users u
 where lower(u.email) = lower(p.email)
   and p.user_id is null;
