-- ===========================================================================
-- 0013 · El Pleno al 15 puntúa, y cada partido se puede configurar
-- ===========================================================================
-- Hasta ahora el partido 15 no contaba nunca: "Puntúan los 14 partidos. El
-- Pleno al 15 no cuenta". En la quiniela de verdad sí cuenta, y así se quiere
-- aquí:
--
--   · suma como un acierto más (el máximo pasa a ser 15), y
--   · es lo que abre el bote: para reventarlo hay que acertarlo TODO,
--     incluido el pleno.
--
-- Y se puede cambiar partido a partido, porque alguna jornada querrá jugarse
-- de otra manera:
--
--   modo_puntuacion = 'normal'     -> 1/X/2 como cualquier otro partido
--                     'pleno'      -> cuenta igual, pero además es el que abre
--                                     el bote
--                     'no_puntua'  -> ni cuenta ni abre nada (el
--                                     comportamiento viejo del 15)
--
--   exige_resultado = true  -> hay que clavar los goles (0/1/2/M por equipo,
--                              como el boleto oficial)
--                     false -> basta con acertar quién gana
--
-- Lo de 0/1/2/M no es capricho: es como se rellena el Pleno al 15 oficial, y
-- con marcador libre no caería el bote jamás.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1 · Configuración por partido
-- ---------------------------------------------------------------------------
alter table matches
  add column if not exists modo_puntuacion text not null default 'normal',
  add column if not exists exige_resultado boolean not null default false;

alter table matches drop constraint if exists matches_modo_puntuacion_valido;
alter table matches add constraint matches_modo_puntuacion_valido
  check (modo_puntuacion in ('normal', 'pleno', 'no_puntua'));

-- Solo un pleno por jornada: si hubiera dos, "acertarlo todo" dejaría de tener
-- un significado único y el bote no sabría a quién abrirse.
drop index if exists matches_un_solo_pleno;
create unique index matches_un_solo_pleno
  on matches (round_id) where modo_puntuacion = 'pleno';

comment on column matches.modo_puntuacion is
  'normal = 1/X/2 y suma. pleno = suma Y abre el bote. no_puntua = ni una cosa ni la otra.';
comment on column matches.exige_resultado is
  'Solo mira al modo pleno: true exige clavar los goles (0/1/2/M), false se conforma con el 1/X/2.';

-- ---------------------------------------------------------------------------
-- 2 · El pronóstico del pleno en el boleto
-- ---------------------------------------------------------------------------
-- Aparte de `picks`, que son los 14 signos. Nulos mientras no se rellene: una
-- jornada sin pleno no obliga a nadie a poner nada.
alter table bets
  add column if not exists pleno_local text,
  add column if not exists pleno_visitante text;

alter table bets drop constraint if exists bets_pleno_forma;
alter table bets add constraint bets_pleno_forma check (
  (pleno_local is null or pleno_local in ('0', '1', '2', 'M')) and
  (pleno_visitante is null or pleno_visitante in ('0', '1', '2', 'M'))
);

comment on column bets.pleno_local is
  'Goles del local en el Pleno al 15, en el formato oficial: 0, 1, 2 o M (tres o más).';

-- `picks` estaba clavado a 14. Un partido 15 que se juegue como uno normal
-- —o como pleno pero sin exigir el resultado— necesita su propio 1/X/2, así
-- que ahora se admiten 14 o 15. Los boletos viejos, de 14, siguen valiendo.
alter table bets drop constraint if exists bets_picks_forma;
alter table bets add constraint bets_picks_forma check (
  array_length(picks, 1) in (14, 15)
  and picks <@ array['1', 'X', '2', '-']
);

-- ---------------------------------------------------------------------------
-- 3 · Los goles, al formato del boleto
-- ---------------------------------------------------------------------------
create or replace function public.goles_a_pleno(goles smallint)
returns text
language sql
immutable
as $$
  select case
    when goles is null then null
    when goles >= 3    then 'M'
    else goles::text
  end
$$;

comment on function public.goles_a_pleno is
  'Tres o más goles son "M" en el boleto oficial, así que 3-1 y 5-1 son el mismo pronóstico.';

-- Toda la regla de "¿esta columna acierta este partido?" en un solo sitio, en
-- vez de repartida por el filtro del insert. `provisional` decide si vale el
-- signo deducido del marcador en vivo o solo el oficial de LAE.
create or replace function public.acierta(m matches, b bets, provisional boolean)
returns boolean
language sql
immutable
as $$
  select case
    when m.modo_puntuacion = 'no_puntua' then false

    -- Pleno con resultado exigido: los goles, no el signo. Da igual que el
    -- signo esté publicado si todavía no hay marcador.
    when m.modo_puntuacion = 'pleno' and m.exige_resultado then
      m.goles_local is not null
      and m.goles_visitante is not null
      and b.pleno_local     = public.goles_a_pleno(m.goles_local)
      and b.pleno_visitante = public.goles_a_pleno(m.goles_visitante)

    -- Todo lo demás va por signo: los partidos normales y también el pleno
    -- cuando basta con acertar quién gana.
    else
      coalesce(
        case when provisional then coalesce(m.signo, m.signo_provisional) else m.signo end,
        ''
      ) <> ''
      and (case when provisional then coalesce(m.signo, m.signo_provisional) else m.signo end)
          is not distinct from b.picks[m.orden]
  end
$$;

comment on function public.acierta is
  'Regla única de acierto por partido, según su modo_puntuacion. La usan la liquidación y la clasificación provisional.';

-- ---------------------------------------------------------------------------
-- 4 · No reescribir el pasado
-- ---------------------------------------------------------------------------
-- El default deja el 15 como 'normal', que no es lo que queremos, pero
-- cambiarlo a 'pleno' a lo bruto reescribiría jornadas YA liquidadas: al
-- recalcularlas, el 15 empezaría a contar y podrían cambiar de ganador.
--
-- Así que: las jornadas cerradas se quedan exactamente como estaban
-- ('no_puntua', que es lo que hacían), y solo las que todavía no se han
-- liquidado estrenan el pleno.
update matches m
   set modo_puntuacion = case
         when r.estado = 'finalizada' then 'no_puntua'
         else 'pleno'
       end,
       exige_resultado = (r.estado <> 'finalizada')
  from rounds r
 where r.id = m.round_id
   and m.orden = 15;

-- Los partidos 1..14 son 'normal' por defecto y no hay nada que tocar.

-- ---------------------------------------------------------------------------
-- 5 · La puntuación, ahora mirando la configuración de cada partido
-- ---------------------------------------------------------------------------
-- Reemplaza entera la de 0004. Cambia tres cosas y ni una más:
--
--   · qué partidos cuentan (los que no son 'no_puntua', no "del 1 al 14"),
--   · cómo se acierta un pleno con resultado exigido (goles, no signo),
--   · cuándo se revienta el bote (acertarlo TODO, que ahora incluye el pleno,
--     en vez del 14 fijo de antes).
--
-- El reparto del dinero —mitad y mitad, el céntimo impar al bote, el resto de
-- la división repartido de uno en uno— no se toca.
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

  -- 1) Aciertos.
  insert into round_scores (round_id, player_id, aciertos, aciertos_provisional)
  select b.round_id,
         b.player_id,
         count(*) filter (where public.acierta(m, b, false))::smallint,
         count(*) filter (where public.acierta(m, b, true))::smallint
  from bets b
  join matches m
    on m.round_id = b.round_id
   and m.modo_puntuacion <> 'no_puntua'
  where b.round_id = p_round_id
    and b.estado = 'confirmada'
  group by b.round_id, b.player_id
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

  -- 2) ¿Se puede liquidar? Hace falta el dato de TODOS los que puntúan. Para
  -- un pleno con resultado exigido no basta el signo: hacen falta los goles.
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

  -- El bote se abre acertándolo TODO. Como el pleno cuenta como un acierto
  -- más, "todo" ya lo incluye: no hay que comprobarlo aparte.
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
  'Idempotente. Puntúa los partidos con modo_puntuacion <> no_puntua; el bote se abre al acertarlos todos.';
