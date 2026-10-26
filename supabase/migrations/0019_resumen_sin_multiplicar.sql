-- ===========================================================================
-- 0019 · El resumen de cada jornada contaba los boletos al cuadrado
-- ===========================================================================
-- v_jornada_resumen (0002) unía `bets` y `round_scores` a la vez contra la
-- jornada. Son tablas hermanas —una fila por persona cada una—, así que el
-- join producía todas las combinaciones: con 9 boletos salían 9 × 9 = 81, y
-- la recaudación, el premio y el aporte al bote que se enseñan salían
-- multiplicados por 9 también.
--
-- El dinero de verdad nunca se vio afectado: recalcular_jornada cuenta los
-- boletos directamente en `bets`. Era solo lo que se pintaba en Jornadas y en
-- la página de cada jornada.
--
-- Ahora cada cosa se cuenta por su lado. Mismas columnas y en el mismo orden,
-- así que nada del frontend cambia.
-- ===========================================================================

create or replace view v_jornada_resumen with (security_invoker = on) as
select r.id                as round_id,
       r.season_id,
       r.numero,
       r.estado,
       r.es_especial,
       r.cierra_at,
       r.precio_cents,
       b.boletos,
       b.boletos * r.precio_cents                       as recaudacion_cents,
       (b.boletos * r.precio_cents) / 2                 as premio_cents,
       (b.boletos * r.precio_cents)
         - ((b.boletos * r.precio_cents) / 2)           as al_bote_cents,
       s.mejor_puntuacion
from v_rounds_precio r
cross join lateral (
  select count(*) as boletos
  from bets
  where round_id = r.id and estado = 'confirmada'
) b
cross join lateral (
  select max(aciertos) as mejor_puntuacion
  from round_scores
  where round_id = r.id
) s;

comment on view v_jornada_resumen is
  'Una fila por jornada. Boletos y puntuaciones se cuentan por separado: unirlos en el mismo join multiplicaba unos por otros.';
