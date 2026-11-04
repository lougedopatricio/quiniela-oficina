import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  mensajeApertura, mensajeCierre, mensajeResultados, boteAntesDe, boteDespuesDe, eurosCorto,
} from '../src/lib/mensajes.js'
import { liquidar } from '../src/lib/reglas.js'

const MOVIMIENTOS = [
  { jornada: 1, fecha: '2026-09-01', saldo_cents: 450, aporte_cents: 450, salida_cents: 0 },
  { jornada: 2, fecha: '2026-11-03', saldo_cents: 1150, aporte_cents: 700, salida_cents: 0 },
  { jornada: 3, fecha: '2026-11-02', saldo_cents: 1700, aporte_cents: 550, salida_cents: 0 },
]

test('euros como en el grupo: sin ceros de relleno', () => {
  assert.equal(eurosCorto(4550), '45,5 €')
  assert.equal(eurosCorto(100), '1 €')
  assert.equal(eurosCorto(950), '9,5 €')
})

test('el bote antes y después de cada jornada va por número, no por fecha de apunte', () => {
  assert.equal(boteAntesDe(1, MOVIMIENTOS), 0)
  assert.equal(boteAntesDe(3, MOVIMIENTOS), 1150)
  assert.equal(boteDespuesDe(3, MOVIMIENTOS), 1700)
  assert.equal(boteDespuesDe(4, MOVIMIENTOS, 1700), 1700)
})

test('apertura: bote, aporte y reparto a medias', () => {
  const t = mensajeApertura({
    jornada: { numero: 4, cierra_at: '2026-11-06T17:00:00Z', precio_cents: 100 },
    bote: 4550, ajustes: { papeletas: 'hablar con Silvia', pago: 'en mano o por Bizum' },
  })
  assert.match(t, /Bote acumulado actual: 45,5 €/)
  assert.match(t, /Papeletas disponibles: hablar con Silvia/)
  assert.match(t, /viernes 6 de noviembre a las 18:00 h/)
  assert.match(t, /Aporte semanal: 1 € \(en mano o por Bizum\)/)
  assert.match(t, /0,5 € de cada jugador van al premio semanal/)
})

test('cierre: lo que se lleva un pleno es lo mismo que pagaría la base', () => {
  const jornada = { numero: 4, boletos: 19, recaudacion_cents: 1900 }
  const t = mensajeCierre({ jornada, boteAntes: 4550 })
  // El reparto de verdad si uno de los 19 lo acierta todo (15 de 15).
  const real = liquidar([15, ...Array(18).fill(9)], 100, 4550, 15)
  const seLleva = real.premio + real.botePagado
  assert.equal(seLleva, 6450)
  assert.match(t, /Han participado 19 personas/)
  assert.match(t, /Se juegan 9,5 € como premio semanal/)
  assert.match(t, /hay 45,5 € de bote acumulado/)
  assert.ok(t.includes(`se lleva ${eurosCorto(seLleva)}`), 'el mensaje dice lo mismo que reparte la base')
})

test('resultados: ganador, últimos, tabla con puestos y bote', () => {
  const t = mensajeResultados({
    jornada: { numero: 3, premio_cents: 650 },
    boletos: [
      { nombre: 'Nieto Menéndez, J.', aciertos: 10, es_ganador: true },
      { nombre: 'Marta', aciertos: 2, es_ganador: false },
      { nombre: 'Ana', aciertos: 7, es_ganador: false },
      { nombre: 'Bruno', aciertos: 7, es_ganador: false },
    ],
    boteDespues: 3600,
  })
  assert.match(t, /Ganador de la semana:\nNieto Menéndez, J\. con 10 aciertos/)
  assert.match(t, /Último clasificado: Marta con 2/)
  assert.match(t, / 2\. Ana — 7\n 2\. Bruno — 7\n 4\. Marta — 2/, 'los empatados comparten puesto')
  assert.match(t, /Premio semanal: 6,5 € para el ganador/)
  assert.match(t, /Bote acumulado: 36 €/)
})

test('resultados con empate arriba: se reparte y se dice cuánto a cada uno', () => {
  const t = mensajeResultados({
    jornada: { numero: 5, premio_cents: 1000 },
    boletos: [{ nombre: 'Ana', aciertos: 9, es_ganador: true }, { nombre: 'Bruno', aciertos: 9, es_ganador: true }, { nombre: 'Carla', aciertos: 4, es_ganador: false }],
    boteDespues: 5000,
  })
  assert.match(t, /Ganadores de la semana:\nAna y Bruno con 9 aciertos/)
  assert.match(t, /10 € a repartir entre los 2 ganadores \(5 € cada uno\)/)
})
