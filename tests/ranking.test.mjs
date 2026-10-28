import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calcularRanking, ordenarPor } from '../src/lib/ranking.js'

const partido = (orden, signo, extra = {}) => ({ orden, signo, modo_puntuacion: 'normal', ...extra })
// Una jornada de 4 partidos (para que las cuentas se sigan a mano) y el pleno.
const JORNADA = (id, numero, boletos) => ({
  id, numero,
  partidos: [partido(1, '1'), partido(2, 'X'), partido(3, '2'), partido(4, '1'),
             partido(15, 'X', { modo_puntuacion: 'pleno' })],
  boletos,
})
const JUGADORES = [
  { id: 'a', nombre: 'Ana' }, { id: 'b', nombre: 'Bruno' }, { id: 'c', nombre: 'Carla' }, { id: 'd', nombre: 'Dani' },
]
const col = (s) => s.split('').concat(Array(10).fill('1'))   // 4 primeros + relleno hasta 14
const conPleno = (s, p) => { const c = col(s); c[14] = p; return c }

test('cuenta aciertos, media y porcentajes como se haría a mano', () => {
  const { filas } = calcularRanking([
    JORNADA('r1', 1, [
      { player_id: 'a', picks: conPleno('1X21', 'X'), aciertos: 4, es_ganador: true },
      { player_id: 'b', picks: conPleno('1112', '1'), aciertos: 1, es_ganador: false },
      { player_id: 'c', picks: conPleno('2222', '2'), aciertos: 1, es_ganador: false },
    ]),
    JORNADA('r2', 2, [
      { player_id: 'a', picks: conPleno('1111', '1'), aciertos: 2, es_ganador: false },
      { player_id: 'b', picks: conPleno('1X21', 'X'), aciertos: 4, es_ganador: true },
    ]),
  ], JUGADORES)
  const ana = filas.find(f => f.player_id === 'a')
  assert.equal(ana.jornadas, 2)
  assert.equal(ana.aciertos, 6)
  assert.equal(ana.media, 3)
  assert.equal(ana.pctAcierto, 6 / 8)
  assert.equal(ana.victorias, 1)
  assert.equal(ana.mejor, 4)
  // Partidos que ganó el local: el 1 y el 4, dos jornadas → 4. Ana los acierta todos.
  assert.equal(ana.pctLocal, 1)
  // Empates: el 2 en las dos jornadas. Ana acierta el primero.
  assert.equal(ana.pctEmpate, 0.5)
  assert.equal(ana.plenos, 1)
  assert.deepEqual(ana.serie, [4, 6])
  assert.ok(!filas.some(f => f.player_id === 'd'), 'quien no ha jugado nada no sale')
  const carla = filas.find(f => f.player_id === 'c')
  assert.deepEqual(carla.serie, [1, 1], 'la jornada que no juega, su línea se queda plana')
  assert.deepEqual(carla.porJornada, [1, null])
})

test('«a contracorriente» es acertar lo que no puso ni un tercio', () => {
  const { filas } = calcularRanking([JORNADA('r1', 1, [
    { player_id: 'a', picks: col('1X21'), aciertos: 4 },   // solo ella pone X en el 2 y 2 en el 3
    { player_id: 'b', picks: col('1111'), aciertos: 2 },
    { player_id: 'c', picks: col('1111'), aciertos: 2 },
    { player_id: 'd', picks: col('1111'), aciertos: 2 },
  ])], JUGADORES)
  assert.equal(filas.find(f => f.player_id === 'a').valientes, 2)
  assert.equal(filas.find(f => f.player_id === 'b').valientes, 0)
})

test('un partido aplazado o que no puntúa no cuenta para los porcentajes', () => {
  const j = JORNADA('r1', 1, [{ player_id: 'a', picks: col('1X21'), aciertos: 3 }])
  j.partidos[3] = partido(4, null, { modo_puntuacion: 'no_puntua', estado: 'aplazado' })
  const { filas } = calcularRanking([j], JUGADORES)
  assert.equal(filas[0].partidos, 3)
  assert.equal(filas[0].pctAcierto, 1)
})

test('ordena por cualquier criterio y desempata por la general', () => {
  const filas = [
    { player_id: 'a', nombre: 'Ana', aciertos: 10, victorias: 1, pctEmpate: 0.5 },
    { player_id: 'b', nombre: 'Bruno', aciertos: 12, victorias: 0, pctEmpate: 0.5 },
    { player_id: 'c', nombre: 'Carla', aciertos: 8, victorias: 2, pctEmpate: 0.9 },
  ]
  assert.deepEqual(ordenarPor(filas, 'pctEmpate').map(f => f.player_id), ['c', 'b', 'a'])
  assert.deepEqual(ordenarPor(filas, 'victorias').map(f => f.player_id), ['c', 'a', 'b'])
  assert.deepEqual(ordenarPor(filas, 'aciertos', true).map(f => f.player_id), ['c', 'a', 'b'])
})
