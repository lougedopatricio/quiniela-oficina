import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nuevaBase, sembrarTemporada, crearJornada, apostar, columnaCon, recalcular } from './helpers.mjs'
import { compararColumnas, PUNTUAN } from '../src/lib/comparar.js'

// El cara a cara cuenta la jornada de otra manera: en vez de "cuántas acertó
// cada uno", dice en qué partidos se separaron y quién ganó cada uno de esos.
// Las dos cuentas tienen que llevar al mismo sitio, porque en los partidos
// donde los dos ponen lo mismo nadie saca ventaja:
//
//     ganaA - ganaB  ===  aciertosA - aciertosB
//
// Si eso no se cumple, el cara a cara está contando una jornada distinta de la
// que puntuó la base de datos. Igual que en espejo.test.mjs, la autoridad es
// el SQL y esto se ata a él.

const SIGNOS = ['1', 'X', '2', '1', 'X', '2', '1', 'X', '2', '1', 'X', '2', '1', 'X']

test('la ventaja en los partidos discrepantes explica la diferencia de aciertos', async () => {
  const db = await nuevaBase()
  const alias = ['ana', 'bruno', 'carla', 'dani', 'eva']
  const { seasonId, players } = await sembrarTemporada(db, { alias })

  // Cada uno con un número de aciertos distinto, para que haya pares con
  // ventaja a favor, en contra y empatados.
  const columnas = {
    ana: columnaCon(SIGNOS, 14),
    bruno: columnaCon(SIGNOS, 11),
    carla: columnaCon(SIGNOS, 11),
    dani: columnaCon(SIGNOS, 6),
    eva: columnaCon(SIGNOS, 0),
  }

  const roundId = await crearJornada(db, seasonId, 1, SIGNOS)
  for (const a of alias) await apostar(db, roundId, players[a], columnas[a])
  await recalcular(db, roundId)

  const { rows: scores } = await db.query(
    `select player_id, aciertos from round_scores where round_id = $1`, [roundId]
  )
  const aciertosDe = Object.fromEntries(scores.map(s => [s.player_id, s.aciertos]))

  let pares = 0
  for (let i = 0; i < alias.length; i++) {
    for (let j = i + 1; j < alias.length; j++) {
      const [x, y] = [alias[i], alias[j]]
      const c = compararColumnas(SIGNOS, columnas[x], columnas[y])
      const segunLaBase = aciertosDe[players[x]] - aciertosDe[players[y]]

      assert.equal(c.ventaja, segunLaBase, `${x} contra ${y}: la ventaja no cuadra con los aciertos`)
      assert.equal(c.coinciden + c.discrepan, PUNTUAN, `${x} contra ${y}: no suman 14`)
      assert.equal(c.ganaA + c.ganaB + c.fallanLosDos + c.sinResolver, c.discrepan,
        `${x} contra ${y}: las discrepancias no se reparten en los cubos`)
      pares++
    }
  }
  assert.equal(pares, 10)
})

test('el Pleno al 15 no entra en la comparación', () => {
  // Aunque lleguen 15 signos y 15 picks, solo se miran los 14 que puntúan.
  const quince = [...SIGNOS, '1']
  const iguales = [...columnaCon(SIGNOS, 14), '1']
  const distintoSoloEnEl15 = [...columnaCon(SIGNOS, 14), '2']

  const c = compararColumnas(quince, iguales, distintoSoloEnEl15)
  assert.equal(c.filas.length, PUNTUAN)
  assert.equal(c.discrepan, 0)
  assert.equal(c.ventaja, 0)
})

test('columnas idénticas no dan ventaja a nadie', () => {
  const misma = columnaCon(SIGNOS, 9)
  const c = compararColumnas(SIGNOS, misma, misma)
  assert.equal(c.coinciden, PUNTUAN)
  assert.equal(c.discrepan, 0)
  assert.equal(c.ganaA, 0)
  assert.equal(c.ganaB, 0)
  assert.equal(c.ventaja, 0)
})

test('un partido sin signo queda por decidir, no cuenta como fallo de los dos', () => {
  // Jornada a medias: solo los tres primeros resueltos.
  const aMedias = [SIGNOS[0], SIGNOS[1], SIGNOS[2], ...Array(11).fill(null)]
  const a = columnaCon(SIGNOS, 14)                     // acierta los tres
  const b = columnaCon(SIGNOS, 0)                      // falla los tres

  const c = compararColumnas(aMedias, a, b)
  assert.equal(c.resueltos, 3)
  assert.equal(c.ganaA, 3)
  assert.equal(c.ganaB, 0)
  assert.equal(c.fallanLosDos, 0, 'lo no jugado no puede contar como fallo')
  assert.equal(c.sinResolver, c.discrepan - 3)
})

test('discrepar y fallar los dos no mueve la ventaja', () => {
  // En el partido 0 el signo es '1'; uno pone 'X' y el otro '2'.
  const signos = ['1', ...Array(13).fill(null)]
  const c = compararColumnas(signos, ['X'], ['2'])
  assert.equal(c.fallanLosDos, 1)
  assert.equal(c.ganaA, 0)
  assert.equal(c.ganaB, 0)
  assert.equal(c.ventaja, 0)
})

test('una columna a medio rellenar no rompe la cuenta', () => {
  const c = compararColumnas(SIGNOS, columnaCon(SIGNOS, 14), [])
  assert.equal(c.filas.length, PUNTUAN)
  assert.equal(c.discrepan, PUNTUAN, 'un hueco no es lo mismo que el signo del otro')
  assert.equal(c.ganaA + c.ganaB + c.fallanLosDos + c.sinResolver, PUNTUAN)
})
