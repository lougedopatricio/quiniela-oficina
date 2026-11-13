-- ===========================================================================
-- 0027 · Registro con contraseña SIN ningún correo, y enlace automático
-- ===========================================================================
-- Dos cosas:
--
-- 1 · `registrar_cuenta(email, contraseña)`: crea la cuenta YA CONFIRMADA
--     desde la base, así que Supabase no manda ningún correo, esté como esté
--     «Confirm email» en el panel. Es lo que usa la pantalla «Entrar →
--     Crear cuenta»; luego la web entra con la contraseña normal. Si el correo
--     ya tenía cuenta no toca nada y lo dice ('existe').
--
-- 2 · Las cuentas se vuelven a enlazar SOLAS con la ficha del mismo correo,
--     también las de contraseña (deshace la restricción de 0025, a petición
--     del administrador):
--       · al crearse la cuenta, si ya hay una ficha con ese correo;
--       · al poner o cambiar el correo de una ficha, si ya hay una cuenta con
--         ese correo que no esté enlazada a otra ficha;
--       · y una pasada al final para las que ya están creadas y sin enlazar.
--     El riesgo que asume: alguien que se registre con el correo de otro se
--     queda con su ficha. El aviso de cuentas nuevas sigue saliendo al
--     administrador, que puede deshacerlo en Participantes.
-- ===========================================================================

-- --- 2 · Enlace automático -------------------------------------------------

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
     and lower(email) = lower(new.email)
     and not exists (select 1 from players x where x.user_id = new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.enlazar_jugador_al_registrarse();

create or replace function public.enlazar_cuenta_por_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is null and new.email is not null then
    -- Busca entre las cuentas que todavía no tienen ficha.
    select u.id into new.user_id
      from auth.users u
     where lower(u.email) = lower(new.email)
       and not exists (select 1 from players p where p.user_id = u.id and p.id <> new.id)
     limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists players_enlaza_por_email on players;
create trigger players_enlaza_por_email
  before insert or update of email on players
  for each row execute function public.enlazar_cuenta_por_email();

-- Las que ya existen y se quedaron sin enlazar (por 0025 o por llegar antes
-- que el trigger). Idempotente.
update players p
   set user_id = u.id
  from auth.users u
 where p.user_id is null
   and p.email is not null
   and lower(u.email) = lower(p.email)
   and not exists (select 1 from players x where x.user_id = u.id);

-- --- 1 · Crear la cuenta sin correo ----------------------------------------

create or replace function public.registrar_cuenta(p_email text, p_password text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_email text := lower(trim(p_email));
  v_id    uuid := gen_random_uuid();
begin
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Ese correo no parece válido.' using errcode = 'check_violation';
  end if;
  if coalesce(length(p_password), 0) < 6 then
    raise exception 'La contraseña tiene que tener al menos 6 caracteres.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then
    return 'existe';
  end if;

  -- Los cuatro tokens van a '' y no a NULL: GoTrue no sabe leer NULL ahí y
  -- la cuenta luego no podría entrar.
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    crypt(p_password, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
  );
  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_id,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true),
    'email', v_id::text, now(), now(), now()
  );
  -- El trigger on_auth_user_created ya la ha enlazado con su ficha, si la hay.
  return 'creada';
end;
$$;

revoke all on function public.registrar_cuenta(text, text) from public;
grant execute on function public.registrar_cuenta(text, text) to anon, authenticated;

comment on function public.registrar_cuenta is
  'Alta con correo y contraseña ya confirmada: Supabase no manda ningún correo. Devuelve creada | existe.';
