import { test } from 'node:test'
import assert from 'node:assert/strict'
import { puestoEn } from '../src/lib/puestos.js'

// El puesto de una jornada no lo calcula el SQL: sale de comparar con el
// resto. Lo que hay que pinchar es el empate, que antes se resolvía por el
// orden en que la base devolviera las filas.

test('sin empates, el puesto es la posición de siempre', () => {
  const todos = [13, 11, 9, 7]
  assert.deepEqual(todos.map(a => puestoEn(a, todos)), [1, 2, 3, 4])
})

test('los empatados comparten puesto y el siguiente salta', () => {
  const todos = [13, 11, 11, 9]
  assert.deepEqual(todos.map(a => puestoEn(a, todos)), [1, 2, 2, 4])
})

test('empate en lo más alto: los dos son primeros', () => {
  const todos = [14, 14, 10]
  assert.deepEqual(todos.map(a => puestoEn(a, todos)), [1, 1, 3])
})

test('todos empatados, todos primeros', () => {
  const todos = [9, 9, 9, 9]
  assert.deepEqual(todos.map(a => puestoEn(a, todos)), [1, 1, 1, 1])
})

test('el puesto no depende del orden de la lista', () => {
  const todos = [11, 13, 9, 11]
  const revuelto = [9, 11, 11, 13]
  for (const a of [9, 11, 13]) {
    assert.equal(puestoEn(a, todos), puestoEn(a, revuelto), `cambia para ${a} aciertos`)
  }
})

test('quien juega solo es primero', () => {
  assert.equal(puestoEn(7, [7]), 1)
})

test('nadie queda por encima del máximo', () => {
  const todos = [12, 8, 3]
  assert.equal(puestoEn(Math.max(...todos), todos), 1)
})
