-- ===========================================================================
-- 0004 · Puntuación y liquidación
-- ===========================================================================
-- Este archivo es el único sitio de todo el sistema donde se mueve dinero.
-- Por eso concentra todas las invariantes y por eso tiene tests propios.
--
-- Reglas implementadas:
--   · Puntúan los partidos 1..14. El Pleno al 15 NO cuenta.
--   · Recaudación = boletos confirmados × precio de la jornada.
--   · 50 % al máximo acertante, a partes iguales si hay empate.
--   · 50 % al bote. El céntimo impar de una recaudación impar va al bote.
--   · Un 14/14 se lleva además el bote entero (incluido el aporte de esa
--     misma jornada) y el bote queda a cero.
--
-- IDEMPOTENTE: se puede llamar mil veces y el resultado es el mismo. No suma
-- cuotas repetidas ni infla el bote. Se apoya en borrar y recalcular los
-- apuntes derivados de la jornada, nunca los pagos reales.
-- ===========================================================================

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
  v_signos_listos  integer;
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
  -- Un usuario autenticado que no sea admin no tiene nada que hacer aquí.
  -- Cuando llama el script de ingesta (service_role) no hay auth.uid(), así
  -- que la condición lo deja pasar, igual que al editor SQL del panel.
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

  -- -------------------------------------------------------------------------
  -- 1) Aciertos. Solo los partidos 1..14.
  -- -------------------------------------------------------------------------
  insert into round_scores (round_id, player_id, aciertos, aciertos_provisional)
  select b.round_id,
         b.player_id,
         count(*) filter (
           where m.signo is not null and m.signo = b.picks[m.orden]
         )::smallint,
         count(*) filter (
           where coalesce(m.signo, m.signo_provisional) is not null
             and coalesce(m.signo, m.signo_provisional) = b.picks[m.orden]
         )::smallint
  from bets b
  join matches m
    on m.round_id = b.round_id
   and m.orden between 1 and 14
  where b.round_id = p_round_id
    and b.estado = 'confirmada'
  group by b.round_id, b.player_id
  on conflict (round_id, player_id) do update
    set aciertos             = excluded.aciertos,
        aciertos_provisional = excluded.aciertos_provisional;

  -- Si alguien borró su boleto, que no quede su puntuación colgando.
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

  -- -------------------------------------------------------------------------
  -- 2) ¿Se puede liquidar? Hacen falta los 14 signos oficiales.
  -- Si hay un partido aplazado sin signo, no se reparte nada: se espera. El
  -- script de ingesta llama a esta función tras cada sincronización, así que
  -- la jornada se liquida sola en cuanto LAE publica lo que falta.
  -- -------------------------------------------------------------------------
  select count(*) into v_signos_listos
  from matches
  where round_id = p_round_id and orden between 1 and 14 and signo is not null;

  if v_signos_listos < 14 then
    return jsonb_build_object(
      'liquidada', false,
      'motivo', 'faltan_signos',
      'signos_publicados', v_signos_listos
    );
  end if;

  -- -------------------------------------------------------------------------
  -- 3) Borrar lo derivado de esta jornada para poder recalcular limpio.
  -- Solo cuotas y premios, que los calcula esta función. Los apuntes de tipo
  -- 'pago' y 'ajuste' son dinero real que alguien entregó: no se tocan jamás.
  -- -------------------------------------------------------------------------
  delete from ledger where round_id = p_round_id and tipo in ('cuota', 'premio');
  delete from pot_movements where round_id = p_round_id;

  select count(*) into v_boletos
  from bets where round_id = p_round_id and estado = 'confirmada';

  if v_boletos = 0 then
    update rounds set estado = 'finalizada', liquidada_at = now() where id = p_round_id;
    return jsonb_build_object('liquidada', true, 'boletos', 0, 'motivo', 'sin_boletos');
  end if;

  -- -------------------------------------------------------------------------
  -- 4) Reparto del dinero
  -- -------------------------------------------------------------------------
  v_recaudacion    := v_boletos * v_round.precio_cents;
  v_premio_jornada := v_recaudacion / 2;                    -- división entera
  v_al_bote        := v_recaudacion - v_premio_jornada;     -- se queda el impar

  -- Cuota de cada participante.
  insert into ledger (player_id, round_id, tipo, importe_cents, nota)
  select b.player_id, p_round_id, 'cuota', -v_round.precio_cents,
         format('Cuota jornada %s', v_round.numero)
  from bets b
  where b.round_id = p_round_id and b.estado = 'confirmada';

  select max(aciertos) into v_max from round_scores where round_id = p_round_id;

  update round_scores set es_ganador = (aciertos = v_max) where round_id = p_round_id;

  select count(*) into v_ganadores
  from round_scores where round_id = p_round_id and aciertos = v_max;

  -- Bote acumulado ANTES de esta jornada. Se filtra por número de jornada y no
  -- por fecha para que recalcular una jornada antigua dé siempre lo mismo,
  -- independientemente del orden en que se hayan recalculado las demás.
  select coalesce(sum(pm.aporte_cents - pm.salida_cents), 0) into v_bote_antes
  from pot_movements pm
  left join rounds r2 on r2.id = pm.round_id
  where pm.season_id = v_round.season_id
    and (r2.numero is null or r2.numero < v_round.numero);

  if v_max = 14 then
    v_bote_pagado := v_bote_antes + v_al_bote;   -- se lo lleva todo, bote a cero
  end if;

  insert into pot_movements (season_id, round_id, aporte_cents, salida_cents, motivo)
  values (
    v_round.season_id, p_round_id, v_al_bote, v_bote_pagado,
    case when v_max = 14
         then format('Jornada %s · ¡PLENO! El bote se reparte', v_round.numero)
         else format('Jornada %s · 50%% de la recaudación', v_round.numero)
    end
  );

  -- Premio + bote (si lo hay) repartido a partes iguales. El resto de la
  -- división se reparte de uno en uno entre los primeros ganadores por id, en
  -- vez de perderse: así lo entregado cuadra al céntimo con lo recaudado.
  v_reparto_total := v_premio_jornada + v_bote_pagado;
  v_base  := v_reparto_total / v_ganadores;
  v_resto := v_reparto_total % v_ganadores;

  if v_reparto_total > 0 then
    insert into ledger (player_id, round_id, tipo, importe_cents, nota)
    select g.player_id, p_round_id, 'premio',
           v_base + case when g.rn <= v_resto then 1 else 0 end,
           case when v_max = 14
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
    'ganadores',        v_ganadores
  );
end;
$$;

comment on function recalcular_jornada is
  'Idempotente. Llamarla tras cada sincronización con LAE: no hace nada hasta que están los 14 signos, y entonces liquida sola.';

-- ---------------------------------------------------------------------------
-- Comprobación de integridad · para los tests y para dormir tranquilo.
-- Cuadra, jornada a jornada, lo recaudado contra lo entregado más el bote.
-- ---------------------------------------------------------------------------
create or replace function auditar_temporada(p_season_id uuid)
returns table (
  numero            integer,
  recaudado_cents   bigint,
  premios_cents     bigint,
  aporte_bote_cents bigint,
  descuadre_cents   bigint
)
language sql stable security definer set search_path = public as $$
  select r.numero,
         coalesce(-sum(l.importe_cents) filter (where l.tipo = 'cuota'), 0)  as recaudado,
         coalesce( sum(l.importe_cents) filter (where l.tipo = 'premio'), 0) as premios,
         coalesce(max(pm.aporte_cents), 0)::bigint                           as aporte_bote,
         -- Lo recaudado tiene que ser exactamente premios + aporte al bote,
         -- menos lo que haya salido del bote (que no se recaudó esta jornada).
         coalesce(-sum(l.importe_cents) filter (where l.tipo = 'cuota'), 0)
           - coalesce(sum(l.importe_cents) filter (where l.tipo = 'premio'), 0)
           - coalesce(max(pm.aporte_cents), 0)
           + coalesce(max(pm.salida_cents), 0)                               as descuadre
  from rounds r
  left join ledger l         on l.round_id = r.id
  left join pot_movements pm on pm.round_id = r.id
  where r.season_id = p_season_id and r.liquidada_at is not null
  group by r.numero
  order by r.numero;
$$;

comment on function auditar_temporada is
  'descuadre_cents debe ser 0 en todas las filas. Cualquier otro valor es un bug de reparto.';

-- ---------------------------------------------------------------------------
-- Fase 2 · abrir y cerrar plazos solos (para pg_cron)
-- ---------------------------------------------------------------------------
create or replace function aplicar_plazos()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_abiertas integer; v_cerradas integer;
begin
  update rounds set estado = 'abierta'
  where estado = 'borrador' and abre_at is not null and now() >= abre_at
    and (cierra_at is null or now() < cierra_at);
  get diagnostics v_abiertas = row_count;

  update rounds set estado = 'cerrada'
  where estado = 'abierta' and cierra_at is not null and now() >= cierra_at;
  get diagnostics v_cerradas = row_count;

  return jsonb_build_object('abiertas', v_abiertas, 'cerradas', v_cerradas);
end;
$$;

revoke execute on function recalcular_jornada(uuid, boolean) from public, anon;
grant   execute on function recalcular_jornada(uuid, boolean) to authenticated;
revoke execute on function auditar_temporada(uuid) from public, anon;
grant   execute on function auditar_temporada(uuid) to authenticated;
revoke execute on function aplicar_plazos() from public, anon, authenticated;
