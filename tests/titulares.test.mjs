import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  titularClasificacion, titularJornada, titularBote, titularSaldos, titularPerfil,
} from '../src/lib/titulares.js'

// Los titulares son deterministas a propósito: los mismos datos tienen que
// dar siempre el mismo texto, para que se pueda hablar de él en la oficina
// sin que cambie al recargar. Lo que hay que fijar con test son los umbrales
// —dónde empieza "manda con comodidad" y dónde "se escapa"—, que hasta ahora
// solo estaban escritos a mano sin ninguna verificación.

const f = (nombre, aciertos_total) => ({ nombre, aciertos_total })

test('titularClasificacion: sin datos', () => {
  assert.equal(titularClasificacion([], 0), 'Todavía no ha rodado el balón')
})

test('titularClasificacion: primera jornada, se enseña quien abre', () => {
  assert.equal(titularClasificacion([f('Ana', 10)], 1), 'Ana abre la temporada al frente')
  assert.equal(titularClasificacion([f('Ana', 10), f('Bea', 8)], 1), 'Ana abre la temporada al frente')
})

test('titularClasificacion: solo hay un participante en toda la general', () => {
  assert.equal(titularClasificacion([f('Ana', 20)], 3), 'Ana, solo en la general')
})

test('titularClasificacion: empate exacto en cabeza', () => {
  assert.equal(
    titularClasificacion([f('Ana', 20), f('Bea', 20)], 3),
    'Ana y Bea, empatados arriba'
  )
})

test('titularClasificacion: ventaja de un acierto', () => {
  assert.equal(
    titularClasificacion([f('Ana', 21), f('Bea', 20)], 3),
    'Ana lidera por un solo acierto'
  )
})

// Los umbrales exactos del código: 1 -> "por un solo acierto", 2-5 ->
// "aguanta", 6-11 -> "con comodidad", 12+ -> "se escapa".
test('titularClasificacion: los umbrales de ventaja, uno por uno', () => {
  const caso = (ventaja) => titularClasificacion([f('Ana', 20 + ventaja), f('Bea', 20)], 3)
  assert.match(caso(2), /aguanta el liderato/)
  assert.match(caso(5), /aguanta el liderato/)
  assert.match(caso(6), /manda con comodidad/)
  assert.match(caso(11), /manda con comodidad/)
  assert.match(caso(12), /se escapa/)
})

test('titularJornada: jornada en juego, no se adelanta nada', () => {
  assert.equal(titularJornada({ numero: 4, estado: 'en_juego' }, [], null), 'La jornada 4, en directo')
})

test('titularJornada: nadie ha llegado a tiempo', () => {
  assert.equal(
    titularJornada({ numero: 4, estado: 'finalizada' }, [], null),
    'Jornada 4: nadie llegó a tiempo'
  )
})

test('titularJornada: pleno de uno solo', () => {
  const boletos = [{ nombre: 'Ana', aciertos: 14 }, { nombre: 'Bea', aciertos: 10 }]
  assert.equal(
    titularJornada({ numero: 5, estado: 'finalizada' }, boletos, {}),
    '¡Pleno de Ana en la jornada 5!'
  )
})

test('titularJornada: pleno compartido', () => {
  const boletos = [{ nombre: 'Ana', aciertos: 14 }, { nombre: 'Bea', aciertos: 14 }]
  assert.equal(
    titularJornada({ numero: 5, estado: 'finalizada' }, boletos, {}),
    'Pleno compartido en la jornada 5'
  )
})

test('titularJornada: cayó el bote manda sobre el empate', () => {
  // Dos empatados al máximo pero el resumen dice que el bote ha caído: eso
  // solo pasa con un 14, así que el titular del bote tiene prioridad.
  const boletos = [{ nombre: 'Ana', aciertos: 11 }, { nombre: 'Bea', aciertos: 11 }]
  assert.equal(
    titularJornada({ numero: 6, estado: 'finalizada' }, boletos, { bote_pagado_cents: 1500 }),
    'El bote cae en la jornada 6'
  )
})

test('titularJornada: empate normal, sin pleno ni bote', () => {
  const boletos = [{ nombre: 'Ana', aciertos: 9 }, { nombre: 'Bea', aciertos: 9 }, { nombre: 'Cel', aciertos: 5 }]
  assert.equal(
    titularJornada({ numero: 6, estado: 'finalizada' }, boletos, {}),
    'Empate a 9 en la jornada 6'
  )
})

test('titularJornada: ganador único sin empate', () => {
  const boletos = [{ nombre: 'Ana', aciertos: 10 }, { nombre: 'Bea', aciertos: 7 }]
  assert.equal(
    titularJornada({ numero: 6, estado: 'finalizada' }, boletos, {}),
    'Ana gana la jornada 6 con 10'
  )
})

test('titularBote: sin estrenar', () => {
  assert.equal(titularBote(0, 0), 'El bote está por estrenar')
})

test('titularBote: a cero pero ya ha caído algún pleno antes', () => {
  assert.equal(titularBote(0, 2), 'El bote vuelve a empezar de cero')
})

test('titularBote: umbral de "empieza a ser serio" (100 €)', () => {
  assert.equal(titularBote(9999, 0), 'El bote sigue engordando')
  assert.equal(titularBote(10000, 0), 'El bote empieza a ser serio')
})

test('titularSaldos: nadie debe nada', () => {
  assert.equal(titularSaldos([{ saldo_cents: 500 }, { saldo_cents: 0 }]), 'Nadie debe nada')
})

test('titularSaldos: uno solo pendiente, en singular', () => {
  assert.equal(
    titularSaldos([{ saldo_cents: -200 }, { saldo_cents: 500 }]),
    'Queda uno por pasar por caja'
  )
})

test('titularSaldos: varios pendientes, en plural', () => {
  assert.equal(
    titularSaldos([{ saldo_cents: -200 }, { saldo_cents: -100 }, { saldo_cents: 0 }]),
    '2 pendientes de pasar por caja'
  )
})

test('titularPerfil: todavía sin jugar', () => {
  assert.equal(titularPerfil({ nombre: 'Ana' }, 0, 0), 'Ana todavía no ha jugado')
})

test('titularPerfil: ha jugado pero nunca ha ganado', () => {
  assert.equal(titularPerfil({ nombre: 'Ana' }, 5, 0), 'El expediente de Ana')
})

test('titularPerfil: una victoria, en singular', () => {
  assert.equal(titularPerfil({ nombre: 'Ana' }, 5, 1), 'Ana, 1 jornada en el bolsillo')
})

test('titularPerfil: varias victorias, en plural', () => {
  assert.equal(titularPerfil({ nombre: 'Ana' }, 5, 2), 'Ana, 2 jornadas en el bolsillo')
})

test('titularPerfil: umbral de "el que más jornadas gana"', () => {
  assert.equal(titularPerfil({ nombre: 'Ana' }, 8, 3), 'Ana, el que más jornadas gana')
})
