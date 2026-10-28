-- ===========================================================================
-- 0023 · El saldo del bote se acumula por jornada, no por fecha de apunte
-- ===========================================================================
-- v_bote_evolucion (0002) sumaba los movimientos del bote en orden de
-- `fecha`, que es cuándo se APUNTÓ cada uno. Al recalcular una jornada (a
-- mano o sola, 0020) su apunte se borra y se vuelve a crear con la fecha de
-- ese momento, así que una jornada recalculada hoy pasaba por delante de las
-- posteriores: con J1 4,50 €, J2 7,00 € y J3 5,50 €, si la J3 se recalculaba
-- antes que la J2 salía «J2 · queda 17,00» y «J3 · queda 10,00». El total
-- estaba bien; el camino no.
--
-- Ahora el orden es el de la quiniela: por número de jornada. Los movimientos
-- sueltos sin jornada (una cena, un ajuste del bote) van detrás, por fecha.
-- Es el mismo criterio que ya usaba recalcular_jornada para saber cuánto bote
-- había antes de cada jornada.
-- ===========================================================================

create or replace view v_bote_evolucion with (security_invoker = on) as
select pm.id,
       pm.season_id,
       pm.round_id,
       r.numero as jornada,
       pm.fecha,
       pm.motivo,
       pm.aporte_cents,
       pm.salida_cents,
       sum(pm.aporte_cents - pm.salida_cents)
         over (partition by pm.season_id
               order by r.numero nulls last, pm.fecha, pm.id
               rows between unbounded preceding and current row) as saldo_cents
from pot_movements pm
left join rounds r on r.id = pm.round_id;
