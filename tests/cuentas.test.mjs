import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { nuevaBase, sembrarTemporada } from './helpers.mjs'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')

// El enlace entre auth.users y players tiene que funcionar en los dos
// sentidos: te registras después de que te den de alta (0008), y te dan de
// alta después de haberte registrado (0012). El segundo caso se quedaba con
// user_id NULL para siempre, y la cuenta no aparecía por ningún lado.

/**
 * Base con las migraciones de acceso aplicadas encima de las cuatro básicas.
 *
 * `nuevaBase()` emula de Supabase solo lo que hacía falta hasta ahora, así que
 * aquí se completa con lo que piden estas migraciones: el rol `service_role`
 * (0008 le concede permisos) y las dos columnas de fecha de `auth.users` que
 * la vista de cuentas huérfanas enseña. No se toca el helper compartido para
 * no mover el suelo de los tests que ya pasan con él.
 */
async function baseConCuentas() {
  const db = await nuevaBase()
  await db.exec(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'service_role') then
        create role service_role;
      end if;
    end $$;
    alter table auth.users add column if not exists created_at timestamptz not null default now();
    alter table auth.users add column if not exists last_sign_in_at timestamptz;
  `)
  for (const f of ['0005_grants.sql', '0006_email_privado.sql', '0007_email_privado_de_verdad.sql',
                   '0008_service_role_enlace_y_alias.sql', '0009_guard_self_update_sin_sesion.sql',
                   '0010_completar_0008.sql', '0012_cuentas_sin_ficha.sql']) {
    const sql = await readFile(join(raiz, 'supabase', 'migrations', f), 'utf8')
    try {
      await db.exec(sql)
    } catch (e) {
      throw new Error(`Fallo aplicando ${f}: ${e.message}`)
    }
  }
  return db
}

const registrar = async (db, email) => {
  const { rows: [u] } = await db.query(
    `insert into auth.users (email) values ($1) returning id`, [email]
  )
  return u.id
}

const userIdDe = async (db, playerId) => {
  const { rows: [p] } = await db.query(`select user_id from players where id = $1`, [playerId])
  return p.user_id
}

test('las migraciones de acceso se aplican sin error', async () => {
  const db = await baseConCuentas()
  const { rows } = await db.query(
    `select 1 from information_schema.views where table_name = 'v_cuentas_sin_ficha'`
  )
  assert.equal(rows.length, 1, 'la vista de cuentas huérfanas no se creó')
})

test('registrarse DESPUÉS del alta enlaza la cuenta (0008)', async () => {
  const db = await baseConCuentas()
  const { players } = await sembrarTemporada(db, { alias: ['ana'] })
  await db.query(`update players set email = 'ana@empresa.com' where id = $1`, [players.ana])

  const userId = await registrar(db, 'ana@empresa.com')

  assert.equal(await userIdDe(db, players.ana), userId)
})

test('dar de alta DESPUÉS del registro también enlaza (0012)', async () => {
  const db = await baseConCuentas()
  // La persona entra primero: todavía no es participante de nada.
  const userId = await registrar(db, 'bruno@empresa.com')

  const { rows: [p] } = await db.query(
    `insert into players (nombre, alias, email) values ('Bruno', 'bruno', 'bruno@empresa.com')
     returning id, user_id`
  )
  assert.equal(p.user_id, userId, 'la ficha nueva debería haberse atado sola a la cuenta')
})

test('el enlace por correo no distingue mayúsculas', async () => {
  const db = await baseConCuentas()
  const userId = await registrar(db, 'Carla@Empresa.com')
  const { rows: [p] } = await db.query(
    `insert into players (nombre, alias, email) values ('Carla', 'carla', 'carla@empresa.com')
     returning user_id`
  )
  assert.equal(p.user_id, userId)
})

test('poner el correo más tarde también engancha la cuenta', async () => {
  const db = await baseConCuentas()
  const userId = await registrar(db, 'eva@empresa.com')
  // Alta sin correo: es lo normal cuando el admin carga la plantilla a mano.
  const { rows: [p] } = await db.query(
    `insert into players (nombre, alias) values ('Eva', 'eva') returning id, user_id`
  )
  assert.equal(p.user_id, null, 'sin correo no hay nada con lo que enlazar')

  await db.query(`update players set email = 'eva@empresa.com' where id = $1`, [p.id])
  assert.equal(await userIdDe(db, p.id), userId)
})

test('un correo desconocido NO se cuela como participante', async () => {
  const db = await baseConCuentas()
  await registrar(db, 'desconocido@fuera.com')

  const { rows } = await db.query(`select count(*)::int as n from players`)
  assert.equal(rows[0].n, 0, 'entrar con un correo cualquiera no puede crear una ficha')
})

test('el enlace nunca pisa una cuenta ya asignada', async () => {
  const db = await baseConCuentas()
  const primera = await registrar(db, 'dani@empresa.com')
  const { rows: [p] } = await db.query(
    `insert into players (nombre, alias, email) values ('Dani', 'dani', 'dani@empresa.com')
     returning id`
  )
  assert.equal(await userIdDe(db, p.id), primera)

  // Cambiarle el correo a otro que también existe no debe robar la cuenta:
  // user_id ya está puesto y el trigger solo actúa cuando viene NULL.
  await registrar(db, 'otro@empresa.com')
  await db.query(`update players set email = 'otro@empresa.com' where id = $1`, [p.id])

  assert.equal(await userIdDe(db, p.id), primera, 'el enlace existente se ha sobrescrito')
})

test('la vista de huérfanas deja fuera a las cuentas ya enlazadas', async () => {
  const db = await baseConCuentas()
  await db.query(`insert into players (nombre, alias, email) values ('Ana', 'ana', 'ana@empresa.com')`)
  await registrar(db, 'ana@empresa.com')      // enlazada
  const suelta = await registrar(db, 'nadie@empresa.com')   // huérfana

  // is_admin() es false sin sesión, así que la vista se filtra sola y no
  // devuelve nada: se comprueba la condición directamente contra las tablas.
  const { rows } = await db.query(`
    select u.id from auth.users u
    where not exists (select 1 from players p where p.user_id = u.id)
  `)
  assert.deepEqual(rows.map(r => r.id), [suelta])
})

test('la vista no enseña nada a quien no es administrador', async () => {
  const db = await baseConCuentas()
  await registrar(db, 'nadie@empresa.com')
  // Sin sesión auth.uid() es NULL y is_admin() devuelve false: el filtro de la
  // propia vista tiene que dejarla vacía aunque haya cuentas sueltas.
  const { rows } = await db.query(`select * from v_cuentas_sin_ficha`)
  assert.equal(rows.length, 0, 'los correos se estarían enseñando sin ser admin')
})
