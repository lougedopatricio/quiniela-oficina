-- ===========================================================================
-- 0005 · Permisos base de Postgres
-- ===========================================================================
-- RLS es una SEGUNDA puerta que filtra filas; antes de llegar a ella, Postgres
-- exige el permiso de tabla de toda la vida (GRANT). Sin este archivo, la API
-- devuelve 401 "permission denied for table X" antes de que ninguna policy
-- llegue a evaluarse — es justo lo que pasó al desplegar por primera vez.
--
-- El modelo de seguridad de Supabase es GRANT amplio + RLS como filtro real:
-- se concede acceso a las operaciones y las policies deciden qué fila entra o
-- sale. anon solo necesita SELECT (todo lo demás lo hace desde 'authenticated'
-- tras el login); authenticated necesita las cuatro para que las policies de
-- 0003 puedan permitir escribir la propia columna o, si es_admin(), cualquier
-- fila.
-- ===========================================================================

grant usage on schema public to anon, authenticated;

grant select on all tables in schema public to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- Para que las tablas que se creen en el futuro (Fase 2 y siguientes) no
-- vuelvan a caer en este mismo agujero sin que nadie lo pida explícitamente.
alter default privileges in schema public
  grant select on tables to anon;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
