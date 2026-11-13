import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nuevaBase } from './helpers.mjs'

// 0027: las cuentas se enlazan solas con la ficha del mismo correo, sea cual
// sea la forma de entrar, y el registro con contraseña no manda correos
// porque la cuenta se crea ya confirmada desde la base.

async function ficha(db, alias, email) {
  const { rows: [p] } = await db.query(
    `insert into players (nombre, alias, email) values ($1, $1, $2) returning id`, [alias, email])
  return p.id
}
const cuenta = async (db, email, password = null) => (await db.query(
  `insert into auth.users (email, encrypted_password) values ($1, $2) returning id`, [email, password])).rows[0].id
const userDe = async (db, id) => (await db.query(`select user_id from players where id = $1`, [id])).rows[0].user_id

test('quien entra con enlace al correo se enlaza solo con su ficha', async () => {
  const db = await nuevaBase()
  const p = await ficha(db, 'ana', 'ana@empresa.com')
  const u = await cuenta(db, 'ana@empresa.com', '')
  assert.equal(await userDe(db, p), u)
})

test('quien se registra con contraseña también se enlaza solo', async () => {
  const db = await nuevaBase()
  const p = await ficha(db, 'ana', 'Ana@Empresa.com')
  const u = await cuenta(db, 'ana@empresa.com', '$2a$10$hash')
  assert.equal(await userDe(db, p), u)
})

test('al ponerle el correo a una ficha, busca la cuenta sin enlazar y la une', async () => {
  const db = await nuevaBase()
  const u = await cuenta(db, 'bruno@empresa.com', '$2a$10$hash')
  const p = await ficha(db, 'bruno', null)
  await db.query(`update players set email = 'bruno@empresa.com' where id = $1`, [p])
  assert.equal(await userDe(db, p), u)
})

test('una cuenta que ya tiene ficha no se roba para otra', async () => {
  const db = await nuevaBase()
  const u = await cuenta(db, 'carla@empresa.com', null)
  const p1 = await ficha(db, 'carla', null)
  await db.query(`update players set user_id = $2 where id = $1`, [p1, u])
  const p2 = await ficha(db, 'carla2', 'carla@empresa.com')
  assert.equal(await userDe(db, p2), null)
  assert.equal(await userDe(db, p1), u)
})

test('registrar_cuenta crea la cuenta confirmada, con identidad, y la enlaza', async () => {
  const db = await nuevaBase()
  const p = await ficha(db, 'dani', 'dani@empresa.com')
  const { rows: [r] } = await db.query(`select public.registrar_cuenta(' Dani@Empresa.com ', 'secreta1') as r`)
  assert.equal(r.r, 'creada')
  const { rows: [u] } = await db.query(`select * from auth.users where email = 'dani@empresa.com'`)
  assert.ok(u.email_confirmed_at, 'confirmada: así Supabase no manda correo')
  assert.notEqual(u.encrypted_password, 'secreta1')
  assert.equal(u.confirmation_token, '')
  const { rows: ids } = await db.query(`select * from auth.identities where user_id = $1`, [u.id])
  assert.equal(ids.length, 1)
  assert.equal(ids[0].provider, 'email')
  assert.equal(await userDe(db, p), u.id)
})

test('registrar_cuenta no toca una cuenta que ya existe y valida lo que entra', async () => {
  const db = await nuevaBase()
  await cuenta(db, 'eva@empresa.com', '$2a$10$hash')
  const { rows: [r] } = await db.query(`select public.registrar_cuenta('eva@empresa.com', 'otra123') as r`)
  assert.equal(r.r, 'existe')
  const { rows: [u] } = await db.query(`select encrypted_password from auth.users where email = 'eva@empresa.com'`)
  assert.equal(u.encrypted_password, '$2a$10$hash')
  await assert.rejects(db.query(`select public.registrar_cuenta('eva', 'secreta1')`), /correo/)
  await assert.rejects(db.query(`select public.registrar_cuenta('f@e.com', '123')`), /6 caracteres/)
})
