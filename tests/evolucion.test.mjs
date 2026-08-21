import { test } from 'node:test'
import assert from 'node:assert/strict'
import { acumularAciertos } from '../src/lib/evolucion.js'

// El gráfico de la portada se lee como una carrera, así que lo único que no
// puede fallar es que el final de cada línea sea exactamente el total que
// enseña la clasificación. Lo demás son los dos casos raros de una quiniela de
// oficina: gente que se incorpora tarde y gente que se salta semanas.

/** Atajo: jornadas 1..n con los aciertos de cada uno por nombre. */
const correr = (porJornada) =>
  acumularAciertos(porJornada, j => Object.entries(j))

test('suma corrida de quien juega todas las jornadas', () => {
  const acc = acumularAciertos(
    [{ ana: 10 }, { ana: 8 }, { ana: 11 }],
    j => Object.entries(j)
  )
  assert.deepEqual(acc.ana, [10, 18, 29])
})

test('quien se salta una jornada se queda plano, no interpola', () => {
  const acc = correr([{ ana: 10 }, {}, { ana: 5 }])
  assert.deepEqual(acc.ana, [10, 10, 15])
})

test('quien deja de jugar mantiene su total hasta el final', () => {
  const acc = correr([{ ana: 9 }, { ana: 4 }, {}, {}])
  assert.deepEqual(acc.ana, [9, 13, 13, 13])
})

test('quien debuta tarde arrastra ceros por las jornadas anteriores', () => {
  const acc = correr([{ ana: 7 }, { ana: 6 }, { ana: 5, luis: 12 }])
  assert.deepEqual(acc.luis, [0, 0, 12])
  // Todas las series miden lo mismo: si no, no se pueden pintar juntas.
  assert.equal(acc.luis.length, acc.ana.length)
})

test('el final de cada línea es el total de la clasificación', () => {
  const jornadas = [
    { ana: 10, luis: 7, eva: 13 },
    { ana: 8, eva: 9 },
    { ana: 11, luis: 6 },
    { luis: 14, eva: 4 },
  ]
  const acc = correr(jornadas)

  for (const quien of ['ana', 'luis', 'eva']) {
    const total = jornadas.reduce((a, j) => a + (j[quien] ?? 0), 0)
    assert.equal(acc[quien].at(-1), total, `el acumulado de ${quien} no cuadra`)
  }
})

test('sin jornadas no hay series', () => {
  assert.deepEqual(correr([]), {})
})

test('una jornada en la que no juega nadie no rompe la serie', () => {
  const acc = correr([{}, { ana: 5 }])
  assert.deepEqual(acc.ana, [0, 5])
})

test('el acumulado nunca baja', () => {
  const acc = correr([{ ana: 3 }, {}, { ana: 0 }, { ana: 9 }, {}])
  for (let i = 1; i < acc.ana.length; i++) {
    assert.ok(acc.ana[i] >= acc.ana[i - 1], `bajó entre la jornada ${i} y la ${i + 1}`)
  }
})
