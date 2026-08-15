-- ===========================================================================
-- 0007 · El email de cada jugador, privado de verdad
-- ===========================================================================
-- 0006 no funcionó. La razón, comprobada en producción: en Postgres un
-- `GRANT SELECT ON TABLE` (todas las columnas) y un `REVOKE SELECT (columna)`
-- son privilegios independientes, y el de tabla completa manda. Revocar una
-- columna nunca deshace un grant de tabla que ya cubre esa misma columna.
--
-- La única forma de que `email` quede fuera es que anon/authenticated NUNCA
-- tengan el privilegio de tabla completa sobre `players`: hay que revocarlo y
-- conceder, columna a columna, solo las que sí son públicas. PostgREST, que es
-- quien traduce `select=*` a SQL real, introspecciona estos privilegios y
-- simplemente omite `email` de la respuesta en vez de dar error — es exactamente
-- el comportamiento que queremos.
-- ===========================================================================

revoke select on players from anon, authenticated;

grant select (id, user_id, nombre, alias, avatar_url, is_admin, activo, created_at)
  on players to anon, authenticated;

-- El propio jugador y el admin siguen pudiendo escribir su fila: eso lo
-- decide la policy de UPDATE (0003), no este grant de columnas de SELECT.
