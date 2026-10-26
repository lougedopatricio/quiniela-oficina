-- ===========================================================================
-- 0018 · El Pleno al 15, como lo cuenta el Excel de la oficina
-- ===========================================================================
-- El Excel con el que se lleva la quiniela de verdad (hoja «Pronosticos»)
-- puntúa así cada columna:
--
--     =IF(SUM(aciertos del 1 al 14) < 14,
--         SUM(aciertos del 1 al 14),
--         SUM(aciertos del 1 al 15))
--
-- Es decir: el pleno SOLO suma si se han acertado los 14. Quien hace 13 y
-- acierta el pleno se queda en 13, no en 14. 0013 lo sumaba siempre como un
-- acierto más, y eso cambia quién gana una jornada con empate arriba.
--
-- Y el pleno se juega con 1/X/2, igual que los otros catorce: la fila
-- «PLENO AL 15» del Excel y la del boleto impreso tienen las mismas tres
-- casillas. 0013 lo había dejado exigiendo el resultado exacto.
--
-- Esta migración:
--   1) cambia la regla de puntuación en `recalcular_jornada`,
--   2) hace que el 15 de una jornada nueva nazca como pleno por signo,
--   3) pasa a signo los plenos de las jornadas aún sin liquidar, salvo que
--      alguien ya haya jugado su resultado en goles.
--
-- NO recalcula ninguna jornada ya liquidada: sus premios se quedan como
-- están. Si se vuelve a pulsar «Recalcular» en una de ellas, se aplicará la
-- regla nueva.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1 · Aciertos de una columna en una jornada, con la regla del Excel
-- ---------------------------------------------------------------------------
-- Una sola función para la cuenta oficial y la provisional, como `acierta`.
create or replace function public.aciertos_columna(b bets, provisional boolean)
returns smallint
language sql
stable
set search_path = public
as $$
  with partidos as (
    select m.modo_puntuacion = 'pleno' as es_pleno,
           public.acierta(m, b, provisional) as ok
      from matches m
     where m.round_id = b.round_id
       and m.modo_puntuacion <> 'no_puntua'
  ),
  cuenta as (
    select count(*) filter (where not es_pleno)            as normales,
           count(*) filter (where not es_pleno and ok)     as acertados,
           coalesce(bool_or(es_pleno and ok), false)       as pleno_ok
      from partidos
  )
  select (acertados + case when acertados = normales and normales > 0 and pleno_ok then 1 else 0 end)::smallint
    from cuenta
$$;

comment on function public.aciertos_columna is
  'Aciertos de una columna como el Excel de la oficina: los partidos normales, y el pleno solo si se han acertado todos ellos.';

-- ---------------------------------------------------------------------------
-- 2 · recalcular_jornada con esa regla
-- ---------------------------------------------------------------------------
-- Idéntica a la de 0013 salvo el paso 1 (cómo se cuentan los aciertos). El
-- reparto del dinero y la condición del bote —acertarlo TODO, pleno incluido—
-- no cambian: con la regla nueva, 15 sigue siendo «todo».
create or replace function recalcular_jornada(
  p_round_id         uuid,
  p_solo_provisional boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round          record;
  v_puntuables     integer;
  v_listos         integer;
  v_boletos        integer;
  v_recaudacion    integer;
  v_premio_jornada integer;
  v_al_bote        integer;
  v_bote_antes     integer;
  v_bote_pagado    integer := 0;
  v_reparto_total  integer;
  v_max            smallint;
  v_ganadores      integer;
  v_base           integer;
  v_resto          integer;
begin
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Solo el administrador puede recalcular una jornada';
  end if;

  select r.*, coalesce(r.precio_override_cents, s.precio_columna_cents) as precio_cents
    into v_round
  from rounds r
  join seasons s on s.id = r.season_id
  where r.id = p_round_id
  for update of r;

  if not found then
    raise exception 'La jornada % no existe', p_round_id;
  end if;

  -- 1) Aciertos, con la regla del Excel.
  insert into round_scores (round_id, player_id, aciertos, aciertos_provisional)
  select b.round_id,
         b.player_id,
         public.aciertos_columna(b, false),
         public.aciertos_columna(b, true)
  from bets b
  where b.round_id = p_round_id
    and b.estado = 'confirmada'
  on conflict (round_id, player_id) do update
    set aciertos             = excluded.aciertos,
        aciertos_provisional = excluded.aciertos_provisional;

  delete from round_scores rs
  where rs.round_id = p_round_id
    and not exists (
      select 1 from bets b
      where b.round_id = rs.round_id
        and b.player_id = rs.player_id
        and b.estado = 'confirmada'
    );

  if p_solo_provisional then
    return jsonb_build_object('liquidada', false, 'motivo', 'solo_provisional');
  end if;

  -- 2) ¿Se puede liquidar? Hace falta el dato de TODOS los que puntúan.
  select count(*) into v_puntuables
  from matches where round_id = p_round_id and modo_puntuacion <> 'no_puntua';

  select count(*) into v_listos
  from matches m
  where m.round_id = p_round_id
    and m.modo_puntuacion <> 'no_puntua'
    and m.signo is not null
    and (
      m.modo_puntuacion <> 'pleno' or not m.exige_resultado
      or (m.goles_local is not null and m.goles_visitante is not null)
    );

  if v_puntuables = 0 or v_listos < v_puntuables then
    return jsonb_build_object(
      'liquidada', false,
      'motivo', case when v_puntuables = 0 then 'sin_partidos_puntuables' else 'faltan_signos' end,
      'signos_publicados', v_listos,
      'puntuables', v_puntuables
    );
  end if;

  -- 3) Limpiar lo derivado para recalcular sin duplicar.
  delete from ledger where round_id = p_round_id and tipo in ('cuota', 'premio');
  delete from pot_movements where round_id = p_round_id;

  select count(*) into v_boletos
  from bets where round_id = p_round_id and estado = 'confirmada';

  if v_boletos = 0 then
    update rounds set estado = 'finalizada', liquidada_at = now() where id = p_round_id;
    return jsonb_build_object('liquidada', true, 'boletos', 0, 'motivo', 'sin_boletos');
  end if;

  -- 4) Reparto.
  v_recaudacion    := v_boletos * v_round.precio_cents;
  v_premio_jornada := v_recaudacion / 2;
  v_al_bote        := v_recaudacion - v_premio_jornada;

  insert into ledger (player_id, round_id, tipo, importe_cents, nota)
  select b.player_id, p_round_id, 'cuota', -v_round.precio_cents,
         format('Cuota jornada %s', v_round.numero)
  from bets b
  where b.round_id = p_round_id and b.estado = 'confirmada';

  select max(aciertos) into v_max from round_scores where round_id = p_round_id;

  update round_scores set es_ganador = (aciertos = v_max) where round_id = p_round_id;

  select count(*) into v_ganadores
  from round_scores where round_id = p_round_id and aciertos = v_max;

  select coalesce(sum(pm.aporte_cents - pm.salida_cents), 0) into v_bote_antes
  from pot_movements pm
  left join rounds r2 on r2.id = pm.round_id
  where pm.season_id = v_round.season_id
    and (r2.numero is null or r2.numero < v_round.numero);

  if v_max = v_puntuables then
    v_bote_pagado := v_bote_antes + v_al_bote;
  end if;

  insert into pot_movements (season_id, round_id, aporte_cents, salida_cents, motivo)
  values (
    v_round.season_id, p_round_id, v_al_bote, v_bote_pagado,
    case when v_max = v_puntuables
         then format('Jornada %s · ¡PLENO! El bote se reparte', v_round.numero)
         else format('Jornada %s · 50%% de la recaudación', v_round.numero)
    end
  );

  v_reparto_total := v_premio_jornada + v_bote_pagado;
  v_base  := v_reparto_total / v_ganadores;
  v_resto := v_reparto_total % v_ganadores;

  if v_reparto_total > 0 then
    insert into ledger (player_id, round_id, tipo, importe_cents, nota)
    select g.player_id, p_round_id, 'premio',
           v_base + case when g.rn <= v_resto then 1 else 0 end,
           case when v_max = v_puntuables
                then format('¡PLENO! Jornada %s · premio + bote', v_round.numero)
                else format('Premio jornada %s · %s aciertos', v_round.numero, v_max)
           end
    from (
      select player_id, row_number() over (order by player_id) as rn
      from round_scores
      where round_id = p_round_id and aciertos = v_max
    ) g
    where v_base + case when g.rn <= v_resto then 1 else 0 end > 0;
  end if;

  update rounds set estado = 'finalizada', liquidada_at = now() where id = p_round_id;

  return jsonb_build_object(
    'liquidada',        true,
    'boletos',          v_boletos,
    'recaudacion_cents', v_recaudacion,
    'premio_cents',     v_premio_jornada,
    'al_bote_cents',    v_al_bote,
    'bote_pagado_cents', v_bote_pagado,
    'max_aciertos',     v_max,
    'puntuables',       v_puntuables,
    'ganadores',        v_ganadores
  );
end;
$$;

comment on function recalcular_jornada is
  'Idempotente. Cuenta como el Excel de la oficina: el pleno solo suma con los 14 acertados; el bote se abre acertándolo todo.';

-- ---------------------------------------------------------------------------
-- 3 · El 15 de una jornada nueva nace como pleno por signo
-- ---------------------------------------------------------------------------
-- Antes nacía 'normal' (el default de la columna), así que contaba como un
-- partido más sin ser pleno. Solo actúa al insertar y solo si nadie ha dicho
-- otra cosa: el administrador puede cambiarlo después en «Partidos».
create or replace function public.quince_es_pleno() returns trigger
language plpgsql as $$
begin
  if new.orden = 15 and new.modo_puntuacion = 'normal' then
    new.modo_puntuacion := 'pleno';
    new.exige_resultado := false;
  end if;
  return new;
end;
$$;

drop trigger if exists matches_quince_es_pleno on matches;
create trigger matches_quince_es_pleno
  before insert on matches
  for each row execute function public.quince_es_pleno();

-- ---------------------------------------------------------------------------
-- 4 · Los plenos de las jornadas sin liquidar, a signo
-- ---------------------------------------------------------------------------
-- Salvo que alguien ya haya echado su resultado en goles: esa columna se
-- respeta y el administrador decide.
update matches m
   set modo_puntuacion = 'pleno',
       exige_resultado = false
  from rounds r
 where r.id = m.round_id
   and r.estado <> 'finalizada'
   and m.orden = 15
   and m.modo_puntuacion in ('pleno', 'normal')
   and not exists (
     select 1 from bets b
      where b.round_id = m.round_id
        and b.pleno_local is not null
   );
