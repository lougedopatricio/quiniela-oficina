-- ===========================================================================
-- 0021 · Los premios de cada jornada, a la vista de todos
-- ===========================================================================
-- La columna «Premio» de la página de cada jornada salía siempre vacía con
-- la base real: los premios viven en `ledger`, y la policy de 0003 solo deja
-- a cada uno ver SU dinero (cuotas, pagos, saldo). Eso está bien para la
-- caja, pero quién ganó una jornada y cuánto se llevó no es privado: sale en
-- la portada.
--
-- Esta vista expone únicamente los apuntes de tipo 'premio'. Sin
-- security_invoker (corre con los permisos de su dueño) para poder leerlos de
-- todos; cuotas, pagos y ajustes siguen siendo de cada uno.
--
-- Al recalcular una jornada (a mano o sola, 0020) los premios se rehacen en
-- `ledger`, y esta vista los refleja al momento: el reparto que se enseña es
-- siempre el que hay.
-- ===========================================================================

create or replace view public.v_premios as
  select round_id, player_id, sum(importe_cents)::integer as premio_cents
  from ledger
  where tipo = 'premio'
  group by round_id, player_id;

grant select on public.v_premios to anon, authenticated;

comment on view public.v_premios is
  'Premio de cada persona en cada jornada. Público, como la clasificación; el resto del dinero sigue protegido por la policy de ledger.';
