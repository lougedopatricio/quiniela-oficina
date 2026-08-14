-- ===========================================================================
-- 0002 · Vistas de lectura
-- ===========================================================================
-- Todo lo que el frontend pinta sale de aquí. La regla es que ningún agregado
-- de dinero ni de clasificación se guarda: se calcula. Así nunca hay dos
-- versiones de la verdad discrepando.
--
-- `security_invoker = on` es importante: hace que las vistas respeten las
-- policies RLS de quien consulta, en vez de saltárselas con los permisos del
-- creador. Sin esto, v_saldos filtraría la deuda de toda la oficina.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Precio efectivo de cada jornada (override de la jornada, si lo hay)
-- ---------------------------------------------------------------------------
create view v_rounds_precio with (security_invoker = on) as
select r.*,
       coalesce(r.precio_override_cents, s.precio_columna_cents) as precio_cents,
       s.nombre as season_nombre
from rounds r
join seasons s on s.id = r.season_id;

-- ---------------------------------------------------------------------------
-- Resumen económico y de participación por jornada
-- ---------------------------------------------------------------------------
create view v_jornada_resumen with (security_invoker = on) as
select r.id                as round_id,
       r.season_id,
       r.numero,
       r.estado,
       r.es_especial,
       r.cierra_at,
       r.precio_cents,
       count(b.id)                                as boletos,
       count(b.id) * r.precio_cents               as recaudacion_cents,
       (count(b.id) * r.precio_cents) / 2         as premio_cents,
       (count(b.id) * r.precio_cents)
         - ((count(b.id) * r.precio_cents) / 2)   as al_bote_cents,
       max(rs.aciertos)                           as mejor_puntuacion
from v_rounds_precio r
left join bets b        on b.round_id = r.id and b.estado = 'confirmada'
left join round_scores rs on rs.round_id = r.id
group by r.id, r.season_id, r.numero, r.estado, r.es_especial, r.cierra_at, r.precio_cents;

comment on view v_jornada_resumen is
  'El céntimo impar de una recaudación impar va al bote, no al premio. Es la misma regla que aplica recalcular_jornada.';

-- ---------------------------------------------------------------------------
-- Evolución del bote · suma acumulada, sin columna almacenada que derive
-- ---------------------------------------------------------------------------
create view v_bote_evolucion with (security_invoker = on) as
select pm.id,
       pm.season_id,
       pm.round_id,
       r.numero as jornada,
       pm.fecha,
       pm.motivo,
       pm.aporte_cents,
       pm.salida_cents,
       sum(pm.aporte_cents - pm.salida_cents)
         over (partition by pm.season_id order by pm.fecha, pm.id
               rows between unbounded preceding and current row) as saldo_cents
from pot_movements pm
left join rounds r on r.id = pm.round_id;

create view v_bote_actual with (security_invoker = on) as
select season_id,
       coalesce(sum(aporte_cents - salida_cents), 0) as saldo_cents
from pot_movements
group by season_id;

-- ---------------------------------------------------------------------------
-- Saldos · positivo = a favor, negativo = lo que debe
-- ---------------------------------------------------------------------------
create view v_saldos with (security_invoker = on) as
select p.id as player_id,
       p.nombre,
       p.alias,
       coalesce(sum(l.importe_cents), 0)                                    as saldo_cents,
       coalesce(-sum(l.importe_cents) filter (where l.tipo = 'cuota'), 0)   as cuotas_cents,
       coalesce(sum(l.importe_cents) filter (where l.tipo = 'premio'), 0)   as premios_cents,
       coalesce(sum(l.importe_cents) filter (where l.tipo = 'pago'), 0)     as pagado_cents
from players p
left join ledger l on l.player_id = p.id
group by p.id, p.nombre, p.alias;

-- ---------------------------------------------------------------------------
-- Clasificación acumulada de la temporada
-- ---------------------------------------------------------------------------
create view v_clasificacion_temporada with (security_invoker = on) as
select r.season_id,
       p.id as player_id,
       p.nombre,
       p.alias,
       p.avatar_url,
       count(rs.round_id)                                 as jornadas_jugadas,
       coalesce(sum(rs.aciertos), 0)                      as aciertos_total,
       coalesce(max(rs.aciertos), 0)                      as mejor_jornada,
       count(*) filter (where rs.es_ganador)              as victorias,
       round(avg(rs.aciertos)::numeric, 2)                as media_aciertos
from round_scores rs
join rounds  r on r.id = rs.round_id and r.estado = 'finalizada'
join players p on p.id = rs.player_id
group by r.season_id, p.id, p.nombre, p.alias, p.avatar_url;

comment on view v_clasificacion_temporada is
  'Ordenar por aciertos_total desc, victorias desc, media_aciertos desc. Solo cuenta jornadas finalizadas.';

-- ---------------------------------------------------------------------------
-- Consenso por partido · qué votó la oficina.
-- Base de "el valiente" y "el borreguito" de la Fase 3, y ya de por sí
-- interesante en la pantalla de jornada.
-- ---------------------------------------------------------------------------
create view v_consenso_partido with (security_invoker = on) as
select m.round_id,
       m.orden,
       m.local,
       m.visitante,
       m.signo,
       count(*)                                        as votos,
       count(*) filter (where b.picks[m.orden] = '1')  as votos_1,
       count(*) filter (where b.picks[m.orden] = 'X')  as votos_x,
       count(*) filter (where b.picks[m.orden] = '2')  as votos_2
from matches m
join rounds r on r.id = m.round_id
join bets   b on b.round_id = m.round_id and b.estado = 'confirmada'
where m.orden between 1 and 14
  -- Nunca revelar el sentido del voto mientras la jornada sigue abierta.
  and r.estado <> 'abierta'
group by m.round_id, m.orden, m.local, m.visitante, m.signo;
