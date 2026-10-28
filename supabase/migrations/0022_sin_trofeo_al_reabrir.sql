-- ===========================================================================
-- 0022 · Una jornada que se vuelve a abrir no conserva el trofeo de antes
-- ===========================================================================
-- El trofeo es `round_scores.es_ganador`, y solo lo escribe la liquidación.
-- recalcular_tras_cambio (0020) actualiza los aciertos de una jornada en
-- borrador o abierta pero no la liquida, así que si una jornada ya liquidada
-- se devolvía a «abierta» seguía enseñando el trofeo del reparto anterior,
-- aunque los aciertos ya no le dieran la razón.
--
-- Una jornada que todavía se está jugando no tiene ganador: se apaga.
-- ===========================================================================

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
    return;
  end if;

  if v_estado in ('borrador', 'abierta') then
    perform recalcular_jornada(p_round_id, true);
    update round_scores set es_ganador = false where round_id = p_round_id and es_ganador;
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

-- Y al cambiar el estado de la jornada a mano también se recalcula: pasarla
-- de «abierta» a «cerrada» o «en juego» con todos los resultados la liquida,
-- y devolverla a «abierta» le quita el trofeo. recalcular_jornada solo pone
-- 'finalizada', así que el WHEN de abajo impide el bucle.
create or replace function public.rounds_recalcula_estado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.recalcular_tras_cambio(new.id);
  return null;
end;
$$;

drop trigger if exists rounds_recalcula_estado on rounds;
create trigger rounds_recalcula_estado
  after update of estado on rounds
  for each row
  when (old.estado is distinct from new.estado and new.estado <> 'finalizada')
  execute function public.rounds_recalcula_estado();

-- Lo que ya hubiera quedado así antes de esta migración.
update round_scores rs
   set es_ganador = false
  from rounds r
 where r.id = rs.round_id
   and r.estado in ('borrador', 'abierta')
   and rs.es_ganador;
