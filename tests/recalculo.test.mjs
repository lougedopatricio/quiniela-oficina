import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nuevaBase, sembrarTemporada, crearJornada, apostar, columnaCon, recalcular } from './helpers.mjs'

// 0020: cambiar un partido recalcula la jornada sola. Sin pulsar nada.

const SIGNOS = Array(14).fill('1')

async function jornadaLiquidada() {
  const db = await nuevaBase()
  const { seasonId, players } = await sembrarTemporada(db, { precio: 200 })
  const r = await crearJornada(db, seasonId, 1, SIGNOS)
  await apostar(db, r, players.ana, columnaCon(SIGNOS, 12))          // 12
  const bruno = [...SIGNOS]; bruno[0] = 'X'; bruno[1] = 'X'; bruno[2] = 'X'
  await apostar(db, r, players.bruno, bruno)                        // 11
  await recalcular(db, r)
  return { db, r, players }
}

const premios = async (db, r) => {
  const { rows } = await db.query(
    `select player_id, importe_cents::int as c from ledger where round_id = $1 and tipo = 'premio'`, [r])
  return Object.fromEntries(rows.map(x => [x.player_id, x.c]))
}

test('corregir un signo cambia los aciertos y el ganador, y el premio se va con él', async () => {
  const { db, r, players } = await jornadaLiquidada()
  assert.deepEqual(Object.keys(await premios(db, r)), [players.ana])

  // Resulta que los tres primeros fueron X: ahora Bruno tiene 14 y Ana 9.
  await db.query(`update matches set signo = 'X' where round_id = $1 and orden in (1, 2, 3)`, [r])

  const { rows } = await db.query(
    `select player_id, aciertos, es_ganador from round_scores where round_id = $1 order by aciertos desc`, [r])
  assert.equal(rows[0].player_id, players.bruno)
  assert.equal(rows[0].es_ganador, true)
  assert.equal(rows[1].es_ganador, false)
  const p = await premios(db, r)
  assert.ok(p[players.bruno] > 0, 'el premio pasa a Bruno')
  assert.equal(p[players.ana], undefined, 'y Ana deja de tenerlo')
})

test('quitar un resultado de una jornada liquidada retira los premios hasta que vuelva', async () => {
  const { db, r } = await jornadaLiquidada()
  await db.query(`update matches set signo = null where round_id = $1 and orden = 5`, [r])

  assert.deepEqual(await premios(db, r), {})
  const { rows: [j] } = await db.query(`select estado, liquidada_at from rounds where id = $1`, [r])
  assert.equal(j.estado, 'en_juego')
  assert.equal(j.liquidada_at, null)

  await db.query(`update matches set signo = '1' where round_id = $1 and orden = 5`, [r])
  const { rows: [j2] } = await db.query(`select estado from rounds where id = $1`, [r])
  assert.equal(j2.estado, 'finalizada', 'con el resultado de vuelta, se liquida otra vez sola')
  assert.equal(Object.keys(await premios(db, r)).length, 1)
})

test('cambiar solo el nombre de un equipo no recalcula nada', async () => {
  const { db, r } = await jornadaLiquidada()
  const { rows: [antes] } = await db.query(`select liquidada_at from rounds where id = $1`, [r])
  await db.query(`update matches set local = 'Otro' where round_id = $1 and orden = 1`, [r])
  const { rows: [despues] } = await db.query(`select liquidada_at from rounds where id = $1`, [r])
  assert.deepEqual(despues.liquidada_at, antes.liquidada_at)
})

test('una jornada abierta actualiza los aciertos pero no se liquida sola', async () => {
  const db = await nuevaBase()
  const { seasonId, players } = await sembrarTemporada(db)
  const r = await crearJornada(db, seasonId, 1, Array(14).fill(null), { estado: 'abierta' })
  await apostar(db, r, players.ana, SIGNOS)
  await db.query(`update matches set signo = '1', signo_provisional = '1' where round_id = $1 and orden <= 14`, [r])

  const { rows: [j] } = await db.query(`select estado from rounds where id = $1`, [r])
  assert.equal(j.estado, 'abierta')
  const { rows: [s] } = await db.query(`select aciertos_provisional from round_scores where round_id = $1`, [r])
  assert.equal(s.aciertos_provisional, 14)
})

test('cambiar el precio de la jornada rehace el reparto', async () => {
  const { db, r } = await jornadaLiquidada()
  await db.query(`update rounds set precio_override_cents = 500 where id = $1`, [r])
  const { rows: [v] } = await db.query(`select recaudacion_cents::int from v_jornada_resumen where round_id = $1`, [r])
  assert.equal(v.recaudacion_cents, 1000)
  const p = await premios(db, r)
  assert.equal(Object.values(p)[0], 500, 'la mitad de lo recaudado, al ganador')
})

test('los premios públicos (0021) siguen al recálculo', async () => {
  const { db, r, players } = await jornadaLiquidada()
  const ver = async () => (await db.query(
    `select player_id, premio_cents from v_premios where round_id = $1`, [r])).rows
  assert.deepEqual((await ver()).map(x => x.player_id), [players.ana])
  await db.query(`update matches set signo = 'X' where round_id = $1 and orden in (1, 2, 3)`, [r])
  assert.deepEqual((await ver()).map(x => x.player_id), [players.bruno])
})
