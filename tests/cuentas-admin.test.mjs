import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nuevaBase } from './helpers.mjs'

// 0030: las cuentas se gestionan desde la web. Solo el administrador, y lo
// que toca a un administrador o al dueño, solo el dueño.

async function escenario() {
  const db = await nuevaBase()
  const cuenta = async (email, password = '') => (await db.query(
    `insert into auth.users (email, encrypted_password) values ($1, $2) returning id`, [email, password])).rows[0].id
  const ficha = async (alias, extra = {}) => (await db.query(
    `insert into players (nombre, alias, email, is_admin, is_owner) values ($1, $1, $2, $3, $4) returning id`,
    [alias, extra.email ?? null, !!extra.admin, !!extra.owner])).rows[0].id
  const como = async (uid) => db.exec(`create or replace function auth.uid() returns uuid language sql stable as $$ select ${uid ? `'${uid}'::uuid` : 'null::uuid'} $$`)
  const userDe = async (id) => (await db.query(`select user_id from players where id = $1`, [id])).rows[0].user_id

  // Dueña, un administrador y dos jugadores.
  const uDuena = await cuenta('duena@e.com'); const fDuena = await ficha('duena', { email: 'duena@e.com', owner: true })
  const uAdmin = await cuenta('admin@e.com'); const fAdmin = await ficha('admin', { email: 'admin@e.com', admin: true })
  const uAna = await cuenta('ana@e.com', '$2a$viejo'); const fAna = await ficha('ana', { email: 'ana@e.com' })
  const uSuelta = await cuenta('suelta@e.com')
  const fBruno = await ficha('bruno')
  return { db, cuenta, ficha, como, userDe, uDuena, fDuena, uAdmin, fAdmin, uAna, fAna, uSuelta, fBruno }
}

test('la lista de cuentas solo la ve un administrador, con su perfil', async () => {
  const e = await escenario()
  await e.como(e.uAna)
  assert.equal((await e.db.query(`select * from v_cuentas`)).rows.length, 0)
  await e.como(e.uAdmin)
  const filas = (await e.db.query(`select * from v_cuentas order by email`)).rows
  assert.equal(filas.length, 4)
  const ana = filas.find(f => f.email === 'ana@e.com')
  assert.equal(ana.player_alias, 'ana')
  assert.equal(ana.con_contrasena, true)
  assert.equal(filas.find(f => f.email === 'suelta@e.com').player_id, null)
  assert.equal(filas.find(f => f.email === 'admin@e.com').player_con_permisos, true)
})

test('el administrador cambia la contraseña de un jugador y lo deja confirmado', async () => {
  const e = await escenario()
  await e.como(e.uAdmin)
  await e.db.query(`select admin_cambiar_contrasena($1, 'nueva123')`, [e.uAna])
  const { rows: [u] } = await e.db.query(`select encrypted_password, email_confirmed_at from auth.users where id = $1`, [e.uAna])
  assert.notEqual(u.encrypted_password, '$2a$viejo')
  assert.notEqual(u.encrypted_password, 'nueva123')
  assert.ok(u.email_confirmed_at)
  await assert.rejects(e.db.query(`select admin_cambiar_contrasena($1, '123')`, [e.uAna]), /6 caracteres/)
})

test('un jugador no puede cambiar contraseñas ni unir cuentas', async () => {
  const e = await escenario()
  await e.como(e.uAna)
  await assert.rejects(e.db.query(`select admin_cambiar_contrasena($1, 'nueva123')`, [e.uSuelta]), /Solo el administrador/)
  await assert.rejects(e.db.query(`select admin_enlazar_cuenta($1, $2)`, [e.uSuelta, e.fBruno]), /Solo el administrador/)
  await assert.rejects(e.db.query(`select admin_crear_cuenta('x@e.com', 'secreta1', null)`), /Solo el administrador/)
})

test('un administrador no puede quedarse con la cuenta de la dueña', async () => {
  const e = await escenario()
  await e.como(e.uAdmin)
  await assert.rejects(e.db.query(`select admin_cambiar_contrasena($1, 'nueva123')`, [e.uDuena]), /solo el dueño/)
  await assert.rejects(e.db.query(`select admin_enlazar_cuenta($1, $2)`, [e.uSuelta, e.fDuena]), /solo el dueño/)
  await assert.rejects(e.db.query(`select admin_enlazar_cuenta($1, null)`, [e.uDuena]), /solo el dueño/)
  assert.equal(await e.userDe(e.fDuena), e.uDuena)
  // La suya sí.
  await e.db.query(`select admin_cambiar_contrasena($1, 'mia1234')`, [e.uAdmin])
  // Y la dueña puede con todo.
  await e.como(e.uDuena)
  await e.db.query(`select admin_cambiar_contrasena($1, 'nueva123')`, [e.uAdmin])
})

test('unir una cuenta suelta a un perfil le pone el correo; soltarla la deja libre', async () => {
  const e = await escenario()
  await e.como(e.uAdmin)
  await e.db.query(`select admin_enlazar_cuenta($1, $2)`, [e.uSuelta, e.fBruno])
  assert.equal(await e.userDe(e.fBruno), e.uSuelta)
  assert.equal((await e.db.query(`select email from players where id = $1`, [e.fBruno])).rows[0].email, 'suelta@e.com')
  await e.db.query(`select admin_enlazar_cuenta($1, null)`, [e.uSuelta])
  assert.equal(await e.userDe(e.fBruno), null)
})

test('mover una cuenta de un perfil a otro suelta el primero y quita el correo repetido', async () => {
  const e = await escenario()
  await e.como(e.uAdmin)
  await e.db.query(`select admin_enlazar_cuenta($1, $2)`, [e.uAna, e.fBruno])
  assert.equal(await e.userDe(e.fBruno), e.uAna)
  assert.equal(await e.userDe(e.fAna), null)
  assert.equal((await e.db.query(`select email from players where id = $1`, [e.fAna])).rows[0].email, null)
})

test('crear una cuenta desde la web la deja confirmada y unida al perfil elegido', async () => {
  const e = await escenario()
  await e.como(e.uAdmin)
  const { rows: [r] } = await e.db.query(`select admin_crear_cuenta(' Carla@E.com ', 'secreta1', $1) as id`, [e.fBruno])
  assert.equal(await e.userDe(e.fBruno), r.id)
  const { rows: [u] } = await e.db.query(`select email, email_confirmed_at from auth.users where id = $1`, [r.id])
  assert.equal(u.email, 'carla@e.com')
  assert.ok(u.email_confirmed_at)
  await assert.rejects(e.db.query(`select admin_crear_cuenta('ana@e.com', 'secreta1', null)`), /Ya hay una cuenta/)
  await assert.rejects(e.db.query(`select admin_crear_cuenta('x@e.com', 'secreta1', $1)`, [e.fDuena]), /solo el dueño/)
})
