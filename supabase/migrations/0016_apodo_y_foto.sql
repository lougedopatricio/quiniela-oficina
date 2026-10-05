-- ===========================================================================
-- 0016 · Apodo, foto de perfil y una plantilla que se puede vigilar
-- ===========================================================================
-- Tres cosas que pedía el panel de participantes:
--
-- 1) Un APODO. `nombre` es el nombre real —muchas veces sacado del correo al
--    dar de alta a alguien desde una cuenta suelta— y `alias` es la llave con
--    la que el importador casa el Excel, así que ninguno de los dos sirve para
--    decidir cómo sale cada uno en la clasificación. El apodo es solo eso: lo
--    que se enseña. Si está vacío, se enseña el nombre, como hasta ahora.
--    Lo puede cambiar el propio jugador (el guardián de 0014 no lo bloquea) y
--    el administrador.
--
-- 2) La FOTO. `avatar_url` existía desde 0001 pero nadie podía rellenarla.
--    Las fotos van a un bucket público de Supabase Storage, cada una en la
--    carpeta del jugador: uno solo puede escribir en la suya, el
--    administrador en todas.
--
-- 3) Monitorizar. `v_players_admin` se queda con todo lo que el panel
--    necesita de un vistazo: última entrada, columnas jugadas y si ya ha
--    echado la de la jornada abierta. De paso trae `is_owner`, que 0014 se
--    olvidó de añadir y por eso la etiqueta de «Dueño» nunca salía.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1 · Apodo
-- ---------------------------------------------------------------------------
alter table players add column if not exists apodo text;

comment on column players.apodo is
  'Cómo sale esta persona en la clasificación y en el resto de pantallas públicas. NULL = se usa `nombre`.';

alter table players drop constraint if exists players_apodo_forma;
alter table players add constraint players_apodo_forma
  check (apodo is null or char_length(btrim(apodo)) between 1 and 24);

-- Dos personas con el mismo apodo en la clasificación serían indistinguibles.
create unique index if not exists players_apodo_lower_idx
  on players (lower(btrim(apodo))) where apodo is not null;

-- 0007 dejó `players` con permisos columna a columna (para mantener `email`
-- fuera), así que cada columna pública nueva hay que concederla a mano.
grant select (apodo, is_owner) on players to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2 · Las vistas públicas, con apodo y foto
-- ---------------------------------------------------------------------------
-- `create or replace view` solo deja AÑADIR columnas al final: por eso van
-- detrás de las que ya había, aunque no sea donde quedarían más bonitas.
create or replace view v_saldos with (security_invoker = on) as
select p.id as player_id,
       p.nombre,
       p.alias,
       coalesce(sum(l.importe_cents), 0)                                    as saldo_cents,
       coalesce(-sum(l.importe_cents) filter (where l.tipo = 'cuota'), 0)   as cuotas_cents,
       coalesce(sum(l.importe_cents) filter (where l.tipo = 'premio'), 0)   as premios_cents,
       coalesce(sum(l.importe_cents) filter (where l.tipo = 'pago'), 0)     as pagado_cents,
       p.apodo,
       p.avatar_url
from players p
left join ledger l on l.player_id = p.id
group by p.id, p.nombre, p.alias, p.apodo, p.avatar_url;

create or replace view v_clasificacion_temporada with (security_invoker = on) as
select r.season_id,
       p.id as player_id,
       p.nombre,
       p.alias,
       p.avatar_url,
       count(rs.round_id)                                 as jornadas_jugadas,
       coalesce(sum(rs.aciertos), 0)                      as aciertos_total,
       coalesce(max(rs.aciertos), 0)                      as mejor_jornada,
       count(*) filter (where rs.es_ganador)              as victorias,
       round(avg(rs.aciertos)::numeric, 2)                as media_aciertos,
       p.apodo
from round_scores rs
join rounds  r on r.id = rs.round_id and r.estado = 'finalizada'
join players p on p.id = rs.player_id
group by r.season_id, p.id, p.nombre, p.alias, p.avatar_url, p.apodo;

-- ---------------------------------------------------------------------------
-- 3 · La ficha del administrador, con lo necesario para vigilar la plantilla
-- ---------------------------------------------------------------------------
-- Igual que en 0003: sin security_invoker para poder leer `email` y
-- `auth.users`, con is_admin() como única puerta.
--
-- `juega_abierta` es NULL cuando no hay ninguna jornada abierta: así el panel
-- distingue «no ha jugado» de «no hay nada que jugar».
create or replace view v_players_admin as
  select p.id, p.user_id, p.nombre, p.alias, p.email, p.is_admin, p.activo, p.created_at,
         p.is_owner,
         p.alias_alternativos,
         p.apodo,
         p.avatar_url,
         u.last_sign_in_at                                         as ultima_entrada,
         (select count(*) from bets b
           where b.player_id = p.id and b.estado = 'confirmada')   as columnas,
         (select max(b.updated_at) from bets b
           where b.player_id = p.id)                               as ultima_columna,
         case when exists (select 1 from rounds r where r.estado = 'abierta')
              then exists (select 1 from bets b
                             join rounds r on r.id = b.round_id
                            where b.player_id = p.id
                              and b.estado = 'confirmada'
                              and r.estado = 'abierta')
         end                                                       as juega_abierta
  from players p
  left join auth.users u on u.id = p.user_id
  where public.is_admin();

-- ---------------------------------------------------------------------------
-- 4 · Fotos en Supabase Storage
-- ---------------------------------------------------------------------------
-- Cada foto vive en `avatares/<player_id>/foto.jpg`. La ruta es la que manda:
-- la primera carpeta tiene que ser tu propia ficha (me()), salvo para el
-- administrador. El bucket es público porque las fotos salen en la
-- clasificación, que se ve sin entrar.
--
-- Va dentro de un bloque condicional porque el esquema `storage` es cosa de
-- Supabase: los tests corren sobre un Postgres pelado donde no existe, y nada
-- de esto toca ninguna regla de juego ni de dinero.
do $bloque$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then
    raise notice 'Sin esquema storage: se omite el bucket de avatares';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('avatares', 'avatares', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  execute 'drop policy if exists avatares_lectura on storage.objects';
  execute 'drop policy if exists avatares_sube on storage.objects';
  execute 'drop policy if exists avatares_cambia on storage.objects';
  execute 'drop policy if exists avatares_borra on storage.objects';

  -- La lectura ya es pública por ser bucket público; esta policy hace falta
  -- igualmente para que el `upsert` del cliente pueda comprobar si el archivo
  -- existía antes de sobrescribirlo.
  execute $p$
    create policy avatares_lectura on storage.objects
      for select using (bucket_id = 'avatares')
  $p$;

  execute $p$
    create policy avatares_sube on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'avatares'
        and ((storage.foldername(name))[1] = public.me()::text or public.is_admin())
      )
  $p$;

  execute $p$
    create policy avatares_cambia on storage.objects
      for update to authenticated
      using (
        bucket_id = 'avatares'
        and ((storage.foldername(name))[1] = public.me()::text or public.is_admin())
      )
      with check (
        bucket_id = 'avatares'
        and ((storage.foldername(name))[1] = public.me()::text or public.is_admin())
      )
  $p$;

  execute $p$
    create policy avatares_borra on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'avatares'
        and ((storage.foldername(name))[1] = public.me()::text or public.is_admin())
      )
  $p$;
end
$bloque$;
