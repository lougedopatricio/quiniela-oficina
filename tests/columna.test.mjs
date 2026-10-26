import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nuevaBase, sembrarTemporada, crearJornada } from './helpers.mjs'

// 0017: «columna completa» ya no es «sin un solo guion», sino «con signo en
// todo lo que puntúa por signo». Antes la base rechazaba justo las columnas
// bien hechas de cualquier jornada con el Pleno al 15 activo.

const UNOS = Array(14).fill('1')

const echar = (db, round, player, picks, pleno = [null, null]) =>
  db.query(
    `insert into bets (round_id, player_id, picks, pleno_local, pleno_visitante, estado, origen)
     values ($1, $2, $3, $4, $5, 'confirmada', 'admin')`,
    [round, player, picks, ...pleno]
  )

test('con el pleno por goles, su casilla de signo se queda vacía y vale', async () => {
  const db = await nuevaBase()
  const { seasonId, players } = await sembrarTemporada(db)
  const r = await crearJornada(db, seasonId, 1, UNOS, { estado: 'abierta', pleno: true })

  await echar(db, r, players.ana, [...UNOS, '-'], ['1', '2'])
  const { rows } = await db.query(`select pleno_local, pleno_visitante from bets where player_id = $1`, [players.ana])
  assert.deepEqual(rows[0], { pleno_local: '1', pleno_visitante: '2' })
})

test('un partido que no puntúa tampoco necesita signo', async () => {
  const db = await nuevaBase()
  const { seasonId, players } = await sembrarTemporada(db)
  const r = await crearJornada(db, seasonId, 1, UNOS, { estado: 'abierta' })
  await db.query(`update matches set modo_puntuacion = 'no_puntua' where round_id = $1 and orden = 7`, [r])

  const picks = [...UNOS, '-']; picks[6] = '-'
  await echar(db, r, players.ana, picks)
})

test('el pleno jugado por signo sí lo necesita', async () => {
  const db = await nuevaBase()
  const { seasonId, players } = await sembrarTemporada(db)
  const r = await crearJornada(db, seasonId, 1, UNOS, { estado: 'abierta' })
  await db.query(`update matches set modo_puntuacion = 'pleno', exige_resultado = false where round_id = $1 and orden = 15`, [r])

  await assert.rejects(echar(db, r, players.ana, [...UNOS, '-']), /partido 15/)
  await echar(db, r, players.bruno, [...UNOS, 'X'])
})

test('una columna de 14 del Excel sigue entrando aunque haya pleno', async () => {
  const db = await nuevaBase()
  const { seasonId, players } = await sembrarTemporada(db)
  const r = await crearJornada(db, seasonId, 1, UNOS, { estado: 'abierta', pleno: true })
  await echar(db, r, players.ana, UNOS)
})

test('un hueco en un partido normal se sigue rechazando', async () => {
  const db = await nuevaBase()
  const { seasonId, players } = await sembrarTemporada(db)
  const r = await crearJornada(db, seasonId, 1, UNOS, { estado: 'abierta', pleno: true })
  const picks = [...UNOS, '-']; picks[2] = '-'
  await assert.rejects(echar(db, r, players.ana, picks, ['1', '1']), /partido 3/)
})

// ---------------------------------------------------------------------------
// 0018: el pleno puntúa como en el Excel de la oficina
// ---------------------------------------------------------------------------
import { recalcular } from './helpers.mjs'

async function jornadaConPlenoPorSigno(db, seasonId) {
  const r = await crearJornada(db, seasonId, 1, UNOS, { estado: 'cerrada' })
  await db.query(`update matches set modo_puntuacion = 'pleno', exige_resultado = false, signo = 'X'
                   where round_id = $1 and orden = 15`, [r])
  return r
}

test('13 aciertos y el pleno acertado siguen siendo 13, como en el Excel', async () => {
  const db = await nuevaBase()
  const { seasonId, players } = await sembrarTemporada(db)
  const r = await jornadaConPlenoPorSigno(db, seasonId)
  const trece = [...UNOS]; trece[0] = '2'
  await echar(db, r, players.ana, [...trece, 'X'])
  await recalcular(db, r)
  const { rows: [s] } = await db.query(`select aciertos from round_scores where player_id = $1`, [players.ana])
  assert.equal(s.aciertos, 13)
})

test('los 14 y el pleno son 15, y se llevan el bote', async () => {
  const db = await nuevaBase()
  const { seasonId, players } = await sembrarTemporada(db)
  const r = await jornadaConPlenoPorSigno(db, seasonId)
  await echar(db, r, players.ana, [...UNOS, 'X'])
  await echar(db, r, players.bruno, [...UNOS, '1'])
  const res = await recalcular(db, r)
  const { rows } = await db.query(`select player_id, aciertos from round_scores order by aciertos desc`)
  assert.deepEqual(rows.map(x => x.aciertos), [15, 14])
  assert.equal(res.max_aciertos, 15)
  assert.ok(res.bote_pagado_cents > 0, 'acertarlo todo revienta el bote')
})

test('una jornada nueva nace con el 15 como pleno por signo', async () => {
  const db = await nuevaBase()
  const { seasonId } = await sembrarTemporada(db)
  const { rows: [r] } = await db.query(
    `insert into rounds (season_id, numero) values ($1, 9) returning id`, [seasonId])
  await db.query(`insert into matches (round_id, orden, local, visitante) values ($1, 15, 'A', 'B')`, [r.id])
  const { rows: [m] } = await db.query(`select modo_puntuacion, exige_resultado from matches where round_id = $1`, [r.id])
  assert.deepEqual(m, { modo_puntuacion: 'pleno', exige_resultado: false })
})
