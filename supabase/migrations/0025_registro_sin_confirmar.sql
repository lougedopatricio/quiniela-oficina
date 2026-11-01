-- ===========================================================================
-- 0025 · Registro con contraseña sin correo de confirmación, sin suplantar
-- ===========================================================================
-- El correo de serie de Supabase deja mandar muy pocos por hora, así que el
-- registro con contraseña se usa con «Confirm email» DESACTIVADO (Supabase →
-- Authentication → Sign In / Providers → Email). Eso abre un agujero: las
-- cuentas se enlazan con su ficha por correo (0008, 0012), y sin confirmar
-- cualquiera podría registrarse con el correo de un compañero y quedarse con
-- su ficha: jugar por él, ver su caja.
--
-- Por eso, una cuenta CON CONTRASEÑA ya no se enlaza sola con ninguna ficha:
-- aparece en «Cuentas sin participante» (con aviso al administrador, y con su
-- ficha ya sugerida si el correo coincide) y la enlaza el administrador con
-- un clic, que es quien sabe si esa persona es quien dice.
--
-- Las que entran con el enlace al correo siguen enlazándose solas: abrir el
-- enlace ya demuestra que el correo es suyo. (En una cuenta de enlace,
-- `encrypted_password` está vacío; en una de contraseña, no.)
-- ===========================================================================

-- Al crearse la cuenta (reemplaza a la de 0008).
create or replace function public.enlazar_jugador_al_registrarse()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.encrypted_password, '') <> '' then
    return new;   -- registro con contraseña: lo enlaza el administrador
  end if;
  update players
     set user_id = new.id
   where user_id is null
     and lower(email) = lower(new.email);
  return new;
end;
$$;

-- Al poner o cambiar el correo de una ficha (reemplaza a la de 0012). Misma
-- regla: si la cuenta con ese correo se creó con contraseña, no se enlaza
-- sola, porque podría ser de alguien que se adelantó con un correo ajeno.
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
       and coalesce(u.encrypted_password, '') = ''
     limit 1;
  end if;
  return new;
end;
$$;
