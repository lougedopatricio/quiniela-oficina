-- ===========================================================================
-- 0006 · El email de cada jugador vuelve a ser privado
-- ===========================================================================
-- Bug introducido por 0005: `GRANT SELECT ON ALL TABLES` concede SELECT sobre
-- TODAS las columnas, incluida `email`, y eso pisó silenciosamente el
-- `REVOKE SELECT (email) ...` que ya existía en 0003. Comprobado en producción:
-- la API devolvía el correo de todo el mundo con la sola anon key.
--
-- La lección para las próximas migraciones de esta serie: cualquier GRANT a
-- nivel de tabla debe revisarse contra los REVOKE de columna que ya existan, y
-- este archivo tiene que ejecutarse SIEMPRE después de cualquier GRANT amplio
-- que se añada en el futuro.
-- ===========================================================================

revoke select (email) on players from anon, authenticated;

-- v_players_admin ya filtraba por is_admin() en su propia definición (0003),
-- así que sigue siendo el único sitio por el que el admin ve los correos.
