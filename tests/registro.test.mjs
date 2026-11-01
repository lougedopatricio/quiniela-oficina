import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nuevaBase } from './helpers.mjs'

// 0025: con el registro por contraseña sin confirmar el correo, una cuenta
// con contraseña no puede quedarse sola con la ficha de nadie. Las de enlace
// al correo (sin contraseña) siguen enlazándose solas.

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

test('quien se registra con contraseña NO se enlaza solo: lo hace el administrador', async () => {
  const db = await nuevaBase()
  const p = await ficha(db, 'ana', 'ana@empresa.com')
  await cuenta(db, 'ana@empresa.com', '$2a$10$hash')
  assert.equal(await userDe(db, p), null, 'si no, cualquiera con el correo de Ana se quedaría con su ficha')
})

test('ni siquiera al ponerle después el correo a la ficha', async () => {
  const db = await nuevaBase()
  await cuenta(db, 'bruno@empresa.com', '$2a$10$hash')
  const p = await ficha(db, 'bruno', null)
  await db.query(`update players set email = 'bruno@empresa.com' where id = $1`, [p])
  assert.equal(await userDe(db, p), null)
})

test('una cuenta de enlace sí se enlaza al ponerle el correo a la ficha', async () => {
  const db = await nuevaBase()
  const u = await cuenta(db, 'carla@empresa.com', null)
  const p = await ficha(db, 'carla', null)
  await db.query(`update players set email = 'carla@empresa.com' where id = $1`, [p])
  assert.equal(await userDe(db, p), u)
})
