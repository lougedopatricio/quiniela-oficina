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
