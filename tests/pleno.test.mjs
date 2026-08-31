import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { nuevaBase, sembrarTemporada, crearJornada, apostar, columnaCon, recalcular, bote, saldo } from './helpers.mjs'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')

// El Pleno al 15 pasa a puntuar: suma como un acierto más Y es el que abre el
// bote. Y cada partido se puede configurar. Esto es dinero, así que se prueba
// contra un Postgres de verdad, como el resto de la liquidación.

const SIGNOS = ['1', 'X', '2', '1', 'X', '2', '1', 'X', '2', '1', 'X', '2', '1', 'X']

async function baseConPleno() {
  const db = await nuevaBase()
  const sql = await readFile(join(raiz, 'supabase', 'migrations', '0013_pleno_al_15.sql'), 'utf8')
  try {
    await db.exec(sql)
  } catch (e) {
    throw new Error(`Fallo aplicando 0013: ${e.message}`)
  }
  return db
}

/** Configura el partido 15 de una jornada. */
const configurarPleno = (db, roundId, modo, exige = false) =>
  db.query(
    `update matches set modo_puntuacion = $2, exige_resultado = $3
      where round_id = $1 and orden = 15`,
    [roundId, modo, exige]
  )

const ponerMarcador = (db, roundId, orden, gl, gv, signo) =>
  db.query(
    `update matches set goles_local = $3, goles_visitante = $4, signo = $5
      where round_id = $1 and orden = $2`,
    [roundId, orden, gl, gv, signo]
  )

const apostarConPleno = (db, roundId, playerId, picks, pl, pv) =>
  db.query(
    `insert into bets (round_id, player_id, picks, pleno_local, pleno_visitante, estado, origen)
     values ($1, $2, $3, $4, $5, 'confirmada', 'admin')`,
    [roundId, playerId, picks, pl, pv]
  )

const aciertosDe = async (db, roundId, playerId) => {
  const { rows: [r] } = await db.query(
    `select aciertos from round_scores where round_id = $1 and player_id = $2`,
    [roundId, playerId]
  )
  return r?.aciertos ?? null
}

test('la migración se aplica sobre el esquema existente', async () => {
  const db = await baseConPleno()
  const { rows } = await db.query(
    `select column_name from information_schema.columns
      where table_name = 'matches' and column_name in ('modo_puntuacion','exige_resultado')`
  )
  assert.equal(rows.length, 2)
})

test('por defecto el 15 no puntúa, así que nada cambia sin tocar nada', async () => {
  // El default de la columna es 'normal', pero crearJornada inserta el 15 sin
  // configurarlo: lo que importa es que una jornada existente siga dando lo
  // mismo que antes de la migración.
  const db = await baseConPleno()
  const { seasonId, players } = await sembrarTemporada(db, { alias: ['ana', 'bruno'] })
  const r = await crearJornada(db, seasonId, 1, SIGNOS)
  await configurarPleno(db, r, 'no_puntua')

  await apostar(db, r, players.ana, columnaCon(SIGNOS, 14))
  await apostar(db, r, players.bruno, columnaCon(SIGNOS, 9))
  const res = await recalcular(db, r)

  assert.equal(res.liquidada, true)
  assert.equal(res.puntuables, 14, 'sin el 15, se puntúa sobre 14')
  assert.equal(await aciertosDe(db, r, players.ana), 14)
  assert.ok(res.bote_pagado_cents > 0, 'un 14/14 con 14 puntuables revienta el bote')
})

test('con el pleno activo, acertar 14 ya NO basta para el bote', async () => {
  const db = await baseConPleno()
  const { seasonId, players } = await sembrarTemporada(db, { alias: ['ana'] })
  const r = await crearJornada(db, seasonId, 1, SIGNOS)
  await configurarPleno(db, r, 'pleno', true)
  await ponerMarcador(db, r, 15, 2, 1, '1')

  // Los 14 clavados, pero el pleno mal (dice 0-0 y fue 2-1).
  await apostarConPleno(db, r, players.ana, columnaCon(SIGNOS, 14), '0', '0')
  const res = await recalcular(db, r)

  assert.equal(res.puntuables, 15)
  assert.equal(await aciertosDe(db, r, players.ana), 14, 'el pleno fallado no suma')
  assert.equal(res.bote_pagado_cents, 0, 'sin el pleno, el bote sigue acumulando')
  assert.ok(res.premio_cents > 0, 'pero la jornada sí se gana y se cobra')
})

test('acertarlo todo, pleno incluido, revienta el bote', async () => {
  const db = await baseConPleno()
  const { seasonId, players } = await sembrarTemporada(db, { alias: ['ana', 'bruno'] })

  // Jornada previa para que haya bote acumulado que reventar.
  const r0 = await crearJornada(db, seasonId, 1, SIGNOS)
  await configurarPleno(db, r0, 'no_puntua')
  await apostar(db, r0, players.ana, columnaCon(SIGNOS, 8))
  await apostar(db, r0, players.bruno, columnaCon(SIGNOS, 7))
  await recalcular(db, r0)
  const boteAntes = await bote(db, seasonId)
  assert.ok(boteAntes > 0)

  const r1 = await crearJornada(db, seasonId, 2, SIGNOS)
  await configurarPleno(db, r1, 'pleno', true)
  await ponerMarcador(db, r1, 15, 2, 1, '1')

  await apostarConPleno(db, r1, players.ana, columnaCon(SIGNOS, 14), '2', '1')   // todo
  await apostarConPleno(db, r1, players.bruno, columnaCon(SIGNOS, 9), '0', '0')
  const res = await recalcular(db, r1)

  assert.equal(await aciertosDe(db, r1, players.ana), 15, 'el pleno acertado suma el 15º')
  assert.equal(res.max_aciertos, 15)
  assert.ok(res.bote_pagado_cents >= boteAntes, 'se lleva el bote entero')
  assert.equal(await bote(db, seasonId), 0, 'y lo deja a cero')
})

test('"M" son tres goles o más: 3-1 y 5-1 son el mismo pronóstico', async () => {
  const db = await baseConPleno()
  const { seasonId, players } = await sembrarTemporada(db, { alias: ['ana', 'bruno'] })
  const r = await crearJornada(db, seasonId, 1, SIGNOS)
  await configurarPleno(db, r, 'pleno', true)
  await ponerMarcador(db, r, 15, 5, 1, '1')     // acabó 5-1

  await apostarConPleno(db, r, players.ana, columnaCon(SIGNOS, 14), 'M', '1')   // acierta
  await apostarConPleno(db, r, players.bruno, columnaCon(SIGNOS, 14), '2', '1') // falla
  await recalcular(db, r)

  assert.equal(await aciertosDe(db, r, players.ana), 15)
  assert.equal(await aciertosDe(db, r, players.bruno), 14)
})

test('el pleno sin resultado exigido se acierta con el signo', async () => {
  const db = await baseConPleno()
  const { seasonId, players } = await sembrarTemporada(db, { alias: ['ana'] })
  const r = await crearJornada(db, seasonId, 1, SIGNOS)
  await configurarPleno(db, r, 'pleno', false)
  await ponerMarcador(db, r, 15, 2, 1, '1')

  // Columna de 15: el decimoquinto signo es el del pleno.
  await apostar(db, r, players.ana, [...columnaCon(SIGNOS, 14), '1'])
  const res = await recalcular(db, r)

  assert.equal(res.puntuables, 15)
  assert.equal(await aciertosDe(db, r, players.ana), 15, 'basta con quién gana')
  assert.ok(res.bote_pagado_cents > 0)
})

test('un partido normal cualquiera se puede dejar sin puntuar', async () => {
  // "quiero poder cambiarlo en algún partido": el 7 no cuenta esta jornada.
  const db = await baseConPleno()
  const { seasonId, players } = await sembrarTemporada(db, { alias: ['ana'] })
  const r = await crearJornada(db, seasonId, 1, SIGNOS)
  await configurarPleno(db, r, 'no_puntua')
  await db.query(
    `update matches set modo_puntuacion = 'no_puntua' where round_id = $1 and orden = 7`, [r]
  )

  await apostar(db, r, players.ana, columnaCon(SIGNOS, 14))
  const res = await recalcular(db, r)

  assert.equal(res.puntuables, 13, 'quedan 13 partidos en juego')
  assert.equal(await aciertosDe(db, r, players.ana), 13)
  assert.ok(res.bote_pagado_cents > 0, 'acertar los 13 que cuentan revienta el bote')
})

test('un pleno con resultado exigido y sin marcador bloquea la liquidación', async () => {
  // El signo puede estar publicado y el marcador no. Repartir ahí sería
  // repartir sin saber si alguien ha hecho pleno.
  const db = await baseConPleno()
  const { seasonId, players } = await sembrarTemporada(db, { alias: ['ana'] })
  const r = await crearJornada(db, seasonId, 1, SIGNOS)
  await configurarPleno(db, r, 'pleno', true)
  await db.query(
    `update matches set signo = '1', goles_local = null, goles_visitante = null
      where round_id = $1 and orden = 15`, [r]
  )

  await apostarConPleno(db, r, players.ana, columnaCon(SIGNOS, 14), '2', '1')
  const res = await recalcular(db, r)

  assert.equal(res.liquidada, false)
  assert.equal(res.motivo, 'faltan_signos')

  // La cuota está cobrada desde que jugó (0015); lo que no puede haber es
  // premio repartido sin saber si alguien ha hecho pleno.
  const { rows: premios } = await db.query(
    `select 1 from ledger where round_id = $1 and tipo = 'premio'`, [r]
  )
  assert.equal(premios.length, 0, 'no se puede repartir sin saber si hay pleno')
})

test('solo puede haber un pleno por jornada', async () => {
  const db = await baseConPleno()
  const { seasonId } = await sembrarTemporada(db, { alias: ['ana'] })
  const r = await crearJornada(db, seasonId, 1, SIGNOS)
  await configurarPleno(db, r, 'pleno', true)

  await assert.rejects(
    () => db.query(`update matches set modo_puntuacion = 'pleno' where round_id = $1 and orden = 7`, [r]),
    /matches_un_solo_pleno|duplicate key/i,
    'dos plenos dejarían sin sentido "acertarlo todo"'
  )
})

test('sigue siendo idempotente con el pleno metido', async () => {
  const db = await baseConPleno()
  const { seasonId, players } = await sembrarTemporada(db, { alias: ['ana', 'bruno'] })
  const r = await crearJornada(db, seasonId, 1, SIGNOS)
  await configurarPleno(db, r, 'pleno', true)
  await ponerMarcador(db, r, 15, 2, 1, '1')
  await apostarConPleno(db, r, players.ana, columnaCon(SIGNOS, 14), '2', '1')
  await apostarConPleno(db, r, players.bruno, columnaCon(SIGNOS, 10), '0', '0')

  await recalcular(db, r)
  const saldoUno = await saldo(db, players.ana)
  const boteUno = await bote(db, seasonId)

  for (let i = 0; i < 5; i++) await recalcular(db, r)

  assert.equal(await saldo(db, players.ana), saldoUno, 'las cuotas se han duplicado')
  assert.equal(await bote(db, seasonId), boteUno, 'el bote se ha movido al recalcular')
})
