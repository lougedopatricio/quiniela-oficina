-- ===========================================================================
-- 0011 · Botón "Sincronizar" desde el panel, sin exponer ningún token
-- ===========================================================================
-- El botón de la web NO puede llamar a GitHub directamente: cualquier token
-- capaz de lanzar workflows que viajara dentro del bundle público sería
-- legible por cualquiera con las herramientas de desarrollador del navegador.
--
-- En vez de eso, es la propia base la que hace la llamada:
--   Vault    guarda el token de GitHub cifrado. Nadie puede leerlo por SQL
--            normal, solo una función con permiso explícito.
--   pg_net   deja que Postgres haga una petición HTTP saliente.
--   La función disparar_sync_lae() ata las dos cosas detrás de la misma
--   comprobación is_admin() que ya protege recalcular_jornada.
-- ===========================================================================

create extension if not exists pg_net    with schema extensions;
create extension if not exists supabase_vault;

create or replace function public.disparar_sync_lae(
  p_desde text default null,
  p_hasta text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  v_token      text;
  v_request_id bigint;
begin
  if not (auth.uid() is not null and public.is_admin()) then
    raise exception 'Solo el administrador puede lanzar la sincronización';
  end if;

  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name = 'github_pat_sync_lae';

  if v_token is null then
    raise exception 'No hay ningún token de GitHub guardado en Vault todavía';
  end if;

  select net.http_post(
    url     := 'https://api.github.com/repos/lougedopatricio/quiniela-oficina/actions/workflows/sync-lae.yml/dispatches',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_token,
      'Accept',        'application/vnd.github+json',
      'User-Agent',    'quiniela-oficina'
    ),
    body := jsonb_build_object(
      'ref', 'main',
      'inputs', jsonb_strip_nulls(jsonb_build_object('desde', p_desde, 'hasta', p_hasta))
    )
  ) into v_request_id;

  -- pg_net es asíncrono: esto confirma que la petición se ha encolado, no que
  -- GitHub ya haya arrancado el workflow. Comprobarlo de verdad tarda 1-2 min.
  return jsonb_build_object('encolada', true, 'request_id', v_request_id);
end;
$$;

comment on function public.disparar_sync_lae is
  'Pide a GitHub Actions que lance sync-lae.yml. El token vive en Vault, nunca en el navegador.';

revoke execute on function public.disparar_sync_lae(text, text) from public, anon;
grant   execute on function public.disparar_sync_lae(text, text) to authenticated;
