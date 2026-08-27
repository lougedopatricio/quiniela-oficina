import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { nuevaBase, sembrarTemporada, crearJornada, apostar, columnaCon, recalcular, saldo } from './helpers.mjs'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')

// Jugar el boleto tiene que apuntar la cuota en el momento, no al liquidar.
// Lo delicado es que ese apunte NO se pelee con recalcular_jornada, que borra
// las cuotas de la jornada y las vuelve a poner: si se duplicaran, la deuda de
// la oficina dejaría de cuadrar.

const SIGNOS = ['1', 'X', '2', '1', 'X', '2', '1', 'X', '2', '1', 'X', '2', '1', 'X']

async function baseConCuota() {
  const db = await nuevaBase()
  const sql = await readFile(join(raiz, 'supabase', 'migrations', '0015_cuota_al_jugar.sql'), 'utf8')
  await db.exec(sql)
  return db
}

const cuotasDe = async (db, roundId, playerId) => {
  const { rows: [r] } = await db.query(
    `select count(*)::int as n, coalesce(sum(importe_cents),0)::int as suma
       from ledger where round_id = $1 and player_id = $2 and tipo = 'cuota'`,
    [roundId, playerId]
  )
  return r
}

test('jugar el boleto apunta la cuota en el momento', async () => {
  const db = await baseConCuota()
  const { seasonId, players } = await sembrarTemporada(db, { precio: 100, alias: ['ana'] })
  const r = await crearJornada(db, seasonId, 1, SIGNOS, { estado: 'abierta' })

  assert.equal(await saldo(db, players.ana), 0, 'sin jugar no se debe nada')

  await apostar(db, r, players.ana, columnaCon(SIGNOS, 10))

  assert.equal(await saldo(db, players.ana), -100, 'un euro a la deuda')
  assert.deepEqual(await cuotasDe(db, r, players.ana), { n: 1, suma: -100 })
})

test('editar la columna no vuelve a cobrar', async () => {
  const db = await baseConCuota()
  const { seasonId, players } = await sembrarTemporada(db, { precio: 200, alias: ['ana'] })
  const r = await crearJornada(db, seasonId, 1, SIGNOS, { estado: 'abierta' })
  await apostar(db, r, players.ana, columnaCon(SIGNOS, 10))

  for (let i = 0; i < 4; i++) {
    await db.query(`update bets set picks = $3 where round_id = $1 and player_id = $2`,
      [r, players.ana, columnaCon(SIGNOS, 5 + i)])
  }

  assert.deepEqual(await cuotasDe(db, r, players.ana), { n: 1, suma: -200 })
})

test('retirar el boleto devuelve la cuota', async () => {
  const db = await baseConCuota()
  const { seasonId, players } = await sembrarTemporada(db, { precio: 200, alias: ['ana'] })
  const r = await crearJornada(db, seasonId, 1, SIGNOS, { estado: 'abierta' })
  await apostar(db, r, players.ana, columnaCon(SIGNOS, 10))
  assert.equal(await saldo(db, players.ana), -200)

  await db.query(`delete from bets where round_id = $1 and player_id = $2`, [r, players.ana])

  assert.equal(await saldo(db, players.ana), 0, 'nadie debe una jornada que no ha jugado')
  assert.deepEqual(await cuotasDe(db, r, players.ana), { n: 0, suma: 0 })
})

test('liquidar después NO duplica la cuota ya cobrada', async () => {
  // El caso que de verdad importa: recalcular_jornada borra las cuotas y las
  // vuelve a insertar. Si el trigger y la liquidación se pisaran, la deuda
  // saldría del doble.
  const db = await baseConCuota()
  const { seasonId, players } = await sembrarTemporada(db, { precio: 200, alias: ['ana', 'bruno'] })
  const r = await crearJornada(db, seasonId, 1, SIGNOS, { estado: 'abierta' })

  await apostar(db, r, players.ana, columnaCon(SIGNOS, 12))
  await apostar(db, r, players.bruno, columnaCon(SIGNOS, 7))
  assert.deepEqual(await cuotasDe(db, r, players.ana), { n: 1, suma: -200 })

  await db.query(`update rounds set estado = 'cerrada' where id = $1`, [r])
  await recalcular(db, r)

  assert.deepEqual(await cuotasDe(db, r, players.ana), { n: 1, suma: -200 },
    'la cuota se ha duplicado al liquidar')
  assert.deepEqual(await cuotasDe(db, r, players.bruno), { n: 1, suma: -200 })
})

test('y recalcular diez veces sigue sin duplicarla', async () => {
  const db = await baseConCuota()
  const { seasonId, players } = await sembrarTemporada(db, { precio: 200, alias: ['ana'] })
  const r = await crearJornada(db, seasonId, 1, SIGNOS, { estado: 'abierta' })
  await apostar(db, r, players.ana, columnaCon(SIGNOS, 12))
  await db.query(`update rounds set estado = 'cerrada' where id = $1`, [r])

  for (let i = 0; i < 10; i++) await recalcular(db, r)

  assert.deepEqual(await cuotasDe(db, r, players.ana), { n: 1, suma: -200 })
})

test('la cuota es la de la jornada, no la de la temporada, si hay precio propio', async () => {
  const db = await baseConCuota()
  const { seasonId, players } = await sembrarTemporada(db, { precio: 200, alias: ['ana'] })
  const r = await crearJornada(db, seasonId, 1, SIGNOS, { estado: 'abierta' })
  await db.query(`update rounds set precio_override_cents = 500 where id = $1`, [r])

  await apostar(db, r, players.ana, columnaCon(SIGNOS, 10))

  assert.equal(await saldo(db, players.ana), -500, 'una jornada especial cuesta lo suyo')
})

test('un pago en efectivo sobrevive a jugar y a retirar el boleto', async () => {
  // El trigger solo toca apuntes de tipo 'cuota'. El dinero que alguien
  // entregó de verdad no se puede evaporar por retirar una columna.
  const db = await baseConCuota()
  const { seasonId, players } = await sembrarTemporada(db, { precio: 200, alias: ['ana'] })
  const r = await crearJornada(db, seasonId, 1, SIGNOS, { estado: 'abierta' })

  await db.query(
    `insert into ledger (player_id, tipo, importe_cents, nota)
     values ($1, 'pago', 1000, 'Pagó 5 jornadas de golpe')`, [players.ana]
  )
  await apostar(db, r, players.ana, columnaCon(SIGNOS, 10))
  assert.equal(await saldo(db, players.ana), 800)

  await db.query(`delete from bets where round_id = $1 and player_id = $2`, [r, players.ana])
  assert.equal(await saldo(db, players.ana), 1000, 'el pago sigue ahí')
})
