import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nuevaBase } from './helpers.mjs'

// 0016: cada uno elige cómo sale en la clasificación, pero sin poder tocar
// lo que lo identifica (alias del Excel, correo, permisos). Simula sesiones de
// verdad, igual que owner.test.mjs: sin sesión los guardianes no actúan.

async function alta(db, nombre, { admin = false } = {}) {
  const { rows: [u] } = await db.query(
    `insert into auth.users (email, last_sign_in_at) values ($1, now()) returning id`, [`${nombre}@empresa.com`]
  )
  const { rows: [p] } = await db.query(
    `insert into players (nombre, alias, email, user_id, is_admin, is_owner)
     values ($1, $2, $3, $4, $5, $5) returning id`,
    [nombre, nombre.toLowerCase(), `${nombre}@empresa.com`, u.id, admin]
  )
  return { playerId: p.id, userId: u.id }
}

const entrarComo = (db, userId) =>
  db.exec(`create or replace function auth.uid() returns uuid language sql stable as $$
             select ${userId ? `'${userId}'::uuid` : 'null::uuid'} $$;`)

test('cada uno puede ponerse apodo y foto', async () => {
  const db = await nuevaBase()
  const ana = await alta(db, 'ana')
  await entrarComo(db, ana.userId)

  await db.query(`update players set apodo = 'La Jefa', avatar_url = 'https://x/foto.jpg' where id = $1`, [ana.playerId])

  const { rows: [p] } = await db.query(`select apodo, avatar_url from players where id = $1`, [ana.playerId])
  assert.equal(p.apodo, 'La Jefa')
  assert.equal(p.avatar_url, 'https://x/foto.jpg')
})

test('pero el alias del Excel sigue siendo cosa del administrador', async () => {
  const db = await nuevaBase()
  const ana = await alta(db, 'ana')
  await entrarComo(db, ana.userId)

  await assert.rejects(
    db.query(`update players set alias = 'otra' where id = $1`, [ana.playerId]),
    /Solo el administrador/
  )
})

test('dos personas no pueden llevar el mismo apodo, ni cambiando mayúsculas', async () => {
  const db = await nuevaBase()
  const ana = await alta(db, 'ana')
  const bruno = await alta(db, 'bruno')
  await db.query(`update players set apodo = 'El Crack' where id = $1`, [ana.playerId])

  await assert.rejects(
    db.query(`update players set apodo = 'el crack ' where id = $1`, [bruno.playerId]),
    /players_apodo_lower_idx/
  )
})

test('un apodo en blanco no vale: para salir con el nombre se deja a NULL', async () => {
  const db = await nuevaBase()
  const ana = await alta(db, 'ana')
  await assert.rejects(
    db.query(`update players set apodo = '   ' where id = $1`, [ana.playerId]),
    /players_apodo_forma/
  )
})

test('la clasificación y la caja traen apodo y foto', async () => {
  const db = await nuevaBase()
  for (const vista of ['v_clasificacion_temporada', 'v_saldos']) {
    const { rows } = await db.query(
      `select column_name from information_schema.columns where table_name = $1`, [vista]
    )
    const cols = rows.map(r => r.column_name)
    assert.ok(cols.includes('apodo'), `${vista} sin apodo`)
    assert.ok(cols.includes('avatar_url'), `${vista} sin avatar_url`)
  }
})

test('la ficha del administrador sirve para vigilar la plantilla', async () => {
  const db = await nuevaBase()
  const jefa = await alta(db, 'ana', { admin: true })
  const bruno = await alta(db, 'bruno')

  const { rows: [s] } = await db.query(
    `insert into seasons (nombre, precio_columna_cents, activa) values ('T', 200, true) returning id`
  )
  const { rows: [r] } = await db.query(
    `insert into rounds (season_id, numero, estado) values ($1, 1, 'abierta') returning id`, [s.id]
  )
  await db.query(
    `insert into bets (round_id, player_id, picks) values ($1, $2, $3)`,
    [r.id, bruno.playerId, Array(14).fill('1')]
  )

  await entrarComo(db, jefa.userId)
  const { rows } = await db.query(
    `select alias, is_owner, ultima_entrada, columnas::int, juega_abierta from v_players_admin order by alias`
  )
  const [ana, bru] = rows
  assert.equal(ana.is_owner, true, 'la etiqueta de dueño necesita is_owner en la vista')
  assert.ok(ana.ultima_entrada, 'la última entrada sale de auth.users')
  assert.equal(ana.juega_abierta, false)
  assert.equal(bru.juega_abierta, true)
  assert.equal(bru.columnas, 1)

  // Sin jornada abierta no se marca a nadie: NULL, no false.
  await db.query(`update rounds set estado = 'cerrada' where id = $1`, [r.id])
  const { rows: [sinAbierta] } = await db.query(`select juega_abierta from v_players_admin limit 1`)
  assert.equal(sinAbierta.juega_abierta, null)
})

test('la vista no enseña nada a quien no es administrador', async () => {
  const db = await nuevaBase()
  await alta(db, 'ana', { admin: true })
  const bruno = await alta(db, 'bruno')
  await entrarComo(db, bruno.userId)
  const { rows } = await db.query(`select * from v_players_admin`)
  assert.equal(rows.length, 0)
})
