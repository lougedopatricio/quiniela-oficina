-- ===========================================================================
-- 0030 · Gestionar las cuentas desde la web, sin SQL
-- ===========================================================================
-- Hasta ahora, cambiar la contraseña de alguien, crearle la cuenta o unirla
-- con su perfil se hacía pegando comandos en el SQL Editor de Supabase. Esto
-- lo lleva a «Redacción → Cuentas»:
--
--   · v_cuentas: todas las cuentas, con su perfil (si lo tienen), si están
--     confirmadas, si tienen contraseña y cuándo entraron por última vez;
--   · admin_cambiar_contrasena: pone una contraseña nueva (y de paso confirma
--     y desbloquea la cuenta, que es lo que se hacía a mano);
--   · admin_enlazar_cuenta: une una cuenta con un perfil, o la suelta;
--   · admin_crear_cuenta: crea una cuenta ya confirmada y, si se dice, la une
--     a un perfil. No manda ningún correo.
--
-- Todo pasa por is_admin(). Y para que un administrador no pueda quedarse
-- con el puesto del dueño ni de otro administrador (cambiándole la
-- contraseña, o uniendo su propia cuenta a esa ficha), lo que toca a una
-- ficha con permisos solo lo puede hacer el dueño, salvo la propia.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1 · La lista
-- ---------------------------------------------------------------------------
-- Mismo patrón que v_cuentas_sin_ficha (0012): la vista lee auth.users con
-- los permisos de su dueño y se filtra ella sola con is_admin().
create or replace view public.v_cuentas as
  select u.id                                              as user_id,
         u.email,
         u.created_at,
         u.last_sign_in_at,
         u.email_confirmed_at is not null                  as confirmada,
         coalesce(u.encrypted_password, '') <> ''          as con_contrasena,
         p.id                                              as player_id,
         p.nombre                                          as player_nombre,
         p.alias                                           as player_alias,
         p.apodo                                           as player_apodo,
         coalesce(p.is_admin or p.is_owner, false)         as player_con_permisos
  from auth.users u
  left join players p on p.user_id = u.id
  where public.is_admin();

revoke all on public.v_cuentas from anon;
grant select on public.v_cuentas to authenticated;

comment on view public.v_cuentas is
  'Todas las cuentas con su perfil. Solo la ve el administrador; se filtra ella sola con is_admin().';

-- ---------------------------------------------------------------------------
-- 2 · Quién puede tocar qué
-- ---------------------------------------------------------------------------
-- Una cuenta o una ficha «con permisos» (administrador o dueño) solo la toca
-- el dueño, o su propio titular.
create or replace function public.puede_tocar_cuenta(p_user uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() and (
    public.is_owner()
    or p_user = auth.uid()
    or not exists (select 1 from players where user_id = p_user and (is_admin or is_owner))
  );
$$;

create or replace function public.puede_tocar_ficha(p_player uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() and (
    public.is_owner()
    or exists (select 1 from players where id = p_player and user_id = auth.uid())
    or not exists (select 1 from players where id = p_player and (is_admin or is_owner))
  );
$$;

revoke execute on function public.puede_tocar_cuenta(uuid) from public;
revoke execute on function public.puede_tocar_ficha(uuid) from public;

-- ---------------------------------------------------------------------------
-- 3 · Cambiar la contraseña
-- ---------------------------------------------------------------------------
create or replace function public.admin_cambiar_contrasena(p_user uuid, p_password text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_admin() then
    raise exception 'Solo el administrador puede cambiar contraseñas' using errcode = 'insufficient_privilege';
  end if;
  if not public.puede_tocar_cuenta(p_user) then
    raise exception 'Esa cuenta es de un administrador: solo el dueño puede cambiarle la contraseña' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(length(p_password), 0) < 6 then
    raise exception 'La contraseña tiene que tener al menos 6 caracteres.' using errcode = 'check_violation';
  end if;

  update auth.users
     set encrypted_password = crypt(p_password, gen_salt('bf')),
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         banned_until = null,
         updated_at = now()
   where id = p_user;
  if not found then
    raise exception 'No existe esa cuenta' using errcode = 'no_data_found';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4 · Unir una cuenta con un perfil (o soltarla, con p_player null)
-- ---------------------------------------------------------------------------
create or replace function public.admin_enlazar_cuenta(p_user uuid, p_player uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_email text;
  v_antes uuid;   -- la ficha a la que estaba unida la cuenta
  v_tenia uuid;   -- la cuenta que tenía la ficha
begin
  if not public.is_admin() then
    raise exception 'Solo el administrador puede unir cuentas' using errcode = 'insufficient_privilege';
  end if;

  select email into v_email from auth.users where id = p_user;
  if v_email is null then
    raise exception 'No existe esa cuenta' using errcode = 'no_data_found';
  end if;
  select id into v_antes from players where user_id = p_user;

  -- Soltar.
  if p_player is null then
    if v_antes is not null then
      if not public.puede_tocar_ficha(v_antes) then
        raise exception 'Ese perfil es de un administrador: solo el dueño puede soltarlo' using errcode = 'insufficient_privilege';
      end if;
      update players set user_id = null where id = v_antes;
    end if;
    return;
  end if;

  if not exists (select 1 from players where id = p_player) then
    raise exception 'No existe ese perfil' using errcode = 'no_data_found';
  end if;
  if not public.puede_tocar_ficha(p_player)
     or (v_antes is not null and v_antes <> p_player and not public.puede_tocar_ficha(v_antes)) then
    raise exception 'Ese perfil es de un administrador: solo el dueño puede cambiar su cuenta' using errcode = 'insufficient_privilege';
  end if;

  select user_id into v_tenia from players where id = p_player;
  if v_tenia is not distinct from p_user then
    return;   -- ya estaban unidas
  end if;

  -- La cuenta deja la ficha que tuviera; la ficha deja la cuenta que tuviera
  -- (esa cuenta se queda sin perfil y saldrá en el aviso de cuentas sueltas).
  update players set user_id = null where id = v_antes;
  -- El correo no se puede repetir entre fichas: se le quita a la que lo
  -- tuviera, que no es esta.
  update players set email = null where lower(email) = lower(v_email) and id <> p_player;
  update players set user_id = p_user, email = lower(v_email) where id = p_player;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5 · Crear una cuenta (ya confirmada, sin correo) y, si se dice, unirla
-- ---------------------------------------------------------------------------
create or replace function public.admin_crear_cuenta(p_email text, p_password text, p_player uuid default null)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_email text := lower(trim(p_email));
  v_user  uuid;
begin
  if not public.is_admin() then
    raise exception 'Solo el administrador puede crear cuentas' using errcode = 'insufficient_privilege';
  end if;
  if p_player is not null and not public.puede_tocar_ficha(p_player) then
    raise exception 'Ese perfil es de un administrador: solo el dueño puede darle cuenta' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'Ya hay una cuenta con el correo %. Búscala en la lista y cámbiale la contraseña o únela desde ahí.', v_email
      using errcode = 'unique_violation';
  end if;

  -- La misma alta que el registro sin correo (0027), que ya valida correo y
  -- contraseña. El trigger de 0027 la une sola a la ficha con ese correo.
  perform public.registrar_cuenta(v_email, p_password);
  select id into v_user from auth.users where lower(email) = v_email;

  if p_player is not null then
    perform public.admin_enlazar_cuenta(v_user, p_player);
  end if;
  return v_user;
end;
$$;

revoke execute on function public.admin_cambiar_contrasena(uuid, text) from public;
revoke execute on function public.admin_enlazar_cuenta(uuid, uuid) from public;
revoke execute on function public.admin_crear_cuenta(text, text, uuid) from public;
grant execute on function public.admin_cambiar_contrasena(uuid, text) to authenticated;
grant execute on function public.admin_enlazar_cuenta(uuid, uuid) to authenticated;
grant execute on function public.admin_crear_cuenta(text, text, uuid) to authenticated;
