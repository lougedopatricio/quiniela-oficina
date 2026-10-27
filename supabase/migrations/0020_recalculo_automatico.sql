-- ===========================================================================
-- 0020 · Cambiar un partido recalcula la jornada sola
-- ===========================================================================
-- Hasta ahora, corregir un signo, un marcador, cómo puntúa un partido o un
-- equipo dejaba los aciertos y el ganador como estaban hasta que alguien se
-- acordaba de pulsar «Recalcular». Ahora lo hace la base, cambie el partido
-- desde donde cambie: el editor de partidos, el importador de Excel, la
-- sincronización con LAE o el SQL Editor.
--
-- Es un trigger POR SENTENCIA, no por fila: guardar los 15 partidos de una
-- jornada es una sola sentencia y recalcula esa jornada UNA vez, no quince.
--
-- recalcular_jornada no toca `matches`, así que esto no se llama a sí mismo.
-- Y como solo el administrador (o la sincronización, sin sesión) puede
-- escribir partidos, nunca dispara para alguien sin permiso para recalcular.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1 · Recalcular una jornada, deshaciendo la liquidación si ya no procede
-- ---------------------------------------------------------------------------
-- recalcular_jornada no reparte si falta algún signo, pero tampoco deshace un
-- reparto anterior. Si a una jornada ya liquidada se le quita un signo (o se
-- añade un partido que puntúa sin resultado), los premios de antes se
-- quedarían puestos con un ganador que ya no es seguro. Aquí se retiran y la
-- jornada vuelve a «en juego» hasta que estén todos los resultados.
--
-- Las cuotas no se tocan: se apuntan al jugar (0015), no al liquidar.
create or replace function public.recalcular_tras_cambio(p_round_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res    jsonb;
  v_estado round_estado;
begin
  select estado into v_estado from rounds where id = p_round_id;
  if not found then
    return;   -- la jornada se está borrando
  end if;

  -- Una jornada que todavía se está jugando (borrador o abierta) no se
  -- liquida sola por mucho que tenga signos: se actualizan los aciertos y
  -- nada más. Liquidar sigue siendo cosa de cuando se cierra.
  if v_estado in ('borrador', 'abierta') then
    perform recalcular_jornada(p_round_id, true);
    return;
  end if;

  v_res := recalcular_jornada(p_round_id);

  if v_estado = 'finalizada' and not coalesce((v_res ->> 'liquidada')::boolean, false) then
    delete from ledger where round_id = p_round_id and tipo = 'premio';
    delete from pot_movements where round_id = p_round_id;
    update round_scores set es_ganador = false where round_id = p_round_id;
    update rounds set estado = 'en_juego', liquidada_at = null where id = p_round_id;
  end if;
end;
$$;

revoke execute on function public.recalcular_tras_cambio(uuid) from public, anon, authenticated;

comment on function public.recalcular_tras_cambio is
  'La llaman los triggers de 0020. Recalcula, y si una jornada liquidada deja de tener todos los resultados, retira sus premios.';

-- ---------------------------------------------------------------------------
-- 2 · Al cambiar partidos
-- ---------------------------------------------------------------------------
-- Una tabla de transición por operación (Postgres no deja usar OLD y NEW
-- TABLE a la vez en un trigger de INSERT ni de DELETE).
create or replace function public.matches_recalcula_ins() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_round uuid;
begin
  for v_round in select distinct round_id from nuevos loop
    perform public.recalcular_tras_cambio(v_round);
  end loop;
  return null;
end;
$$;

create or replace function public.matches_recalcula_upd() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_round uuid;
begin
  -- Solo las jornadas en las que ha cambiado algo que puntúa o que se enseña.
  for v_round in
    select distinct n.round_id
      from nuevos n
      join viejos v on v.id = n.id
     where n.signo             is distinct from v.signo
        or n.signo_provisional is distinct from v.signo_provisional
        or n.goles_local       is distinct from v.goles_local
        or n.goles_visitante   is distinct from v.goles_visitante
        or n.modo_puntuacion   is distinct from v.modo_puntuacion
        or n.exige_resultado   is distinct from v.exige_resultado
        or n.orden             is distinct from v.orden
        or n.round_id          is distinct from v.round_id
    union
    select distinct v.round_id
      from viejos v join nuevos n on n.id = v.id
     where n.round_id is distinct from v.round_id
  loop
    perform public.recalcular_tras_cambio(v_round);
  end loop;
  return null;
end;
$$;

create or replace function public.matches_recalcula_del() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_round uuid;
begin
  for v_round in select distinct round_id from viejos loop
    perform public.recalcular_tras_cambio(v_round);
  end loop;
  return null;
end;
$$;

drop trigger if exists matches_recalcula_ins on matches;
drop trigger if exists matches_recalcula_upd on matches;
drop trigger if exists matches_recalcula_del on matches;

create trigger matches_recalcula_ins
  after insert on matches
  referencing new table as nuevos
  for each statement execute function public.matches_recalcula_ins();

create trigger matches_recalcula_upd
  after update on matches
  referencing old table as viejos new table as nuevos
  for each statement execute function public.matches_recalcula_upd();

create trigger matches_recalcula_del
  after delete on matches
  referencing old table as viejos
  for each statement execute function public.matches_recalcula_del();

-- ---------------------------------------------------------------------------
-- 3 · Al cambiar el precio de una jornada
-- ---------------------------------------------------------------------------
-- El precio decide el premio y el bote. recalcular_jornada escribe en
-- `rounds` (estado, liquidada_at) pero nunca el precio, así que mirar solo
-- esa columna no entra en bucle.
create or replace function public.rounds_recalcula_precio() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.recalcular_tras_cambio(new.id);
  return null;
end;
$$;

drop trigger if exists rounds_recalcula_precio on rounds;
create trigger rounds_recalcula_precio
  after update of precio_override_cents on rounds
  for each row
  when (old.precio_override_cents is distinct from new.precio_override_cents)
  execute function public.rounds_recalcula_precio();
