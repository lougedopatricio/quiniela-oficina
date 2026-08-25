import { test } from 'node:test'
import assert from 'node:assert/strict'
import { euros, eurosConSigno, claseDinero, decimal, iniciales, cuentaAtras } from '../src/lib/formato.js'

// El dinero circula en céntimos enteros en toda la app; estas son las únicas
// funciones que lo convierten a texto. Un fallo aquí no rompe un test, rompe
// la cifra que ve todo el mundo.

test('euros: los céntimos se dividen entre 100, a la española', () => {
  assert.match(euros(1234), /12,34/)
  assert.match(euros(0), /0,00/)
  assert.match(euros(null), /0,00/, 'sin cantidad se trata como cero, no como error')
  assert.match(euros(undefined), /0,00/)
})

test('euros: siempre con dos decimales, aunque sean redondos', () => {
  assert.match(euros(500), /5,00/)
  assert.doesNotMatch(euros(500), /5\s*€$/, 'nunca "5 €" pelado')
})

test('eurosConSigno: signo solo en positivo, nunca doble signo en negativo', () => {
  assert.match(eurosConSigno(500), /^\+/)
  assert.match(eurosConSigno(-500), /^-/)
  assert.doesNotMatch(eurosConSigno(-500), /^\+-/)
  assert.doesNotMatch(eurosConSigno(0), /^\+/, 'cero no lleva signo')
})

test('claseDinero: positivo, negativo, cero', () => {
  assert.equal(claseDinero(500), 'positivo')
  assert.equal(claseDinero(-500), 'negativo')
  assert.equal(claseDinero(0), '')
})

test('decimal: coma española y decimales fijos', () => {
  assert.equal(decimal(11.166666, 2), '11,17')
  assert.equal(decimal(8, 2), '8,00')
  assert.equal(decimal(null), '0,00')
})

test('iniciales: una o dos palabras, en mayúsculas', () => {
  assert.equal(iniciales('Alejandro'), 'A')
  assert.equal(iniciales('Alejandro Lougedo'), 'AL')
  assert.equal(iniciales('ana maría del pilar'), 'AM', 'solo se cogen las dos primeras palabras')
})

test('cuentaAtras: sin fecha no hay cuenta atrás', () => {
  assert.equal(cuentaAtras(null), null)
  assert.equal(cuentaAtras(undefined), null)
})

test('cuentaAtras: plazo ya pasado', () => {
  assert.equal(cuentaAtras(new Date(Date.now() - 1000).toISOString()), 'cerrado')
})

test('cuentaAtras: en días, horas y minutos según lo que quede', () => {
  // Un margen de un minuto/hora hacia abajo: el Math.floor() de la función y
  // los milisegundos que pasan entre construir la fecha y llamarla pueden
  // hacer que "20 min" salga "19 min" según el instante exacto en que corra.
  const en = (ms) => new Date(Date.now() + ms).toISOString()
  assert.match(cuentaAtras(en(2 * 86400000 + 3 * 3600000)), /^2 d [23] h$/)
  assert.match(cuentaAtras(en(5 * 3600000 + 20 * 60000)), /^[45] h (19|20) min$/)
  assert.match(cuentaAtras(en(15 * 60000)), /^1[45] min$/)
})
