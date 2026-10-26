import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leerPartidosPegados } from '../src/lib/pegado.js'

// Lo que llega aquí es el texto entero de una página copiado desde la consola
// (TuLotero, LAE…), con menús, cabeceras y botones alrededor. Tiene que salir
// la jornada limpia en cualquiera de las formas habituales.

const JORNADA = [
  ['Rayo Vallecano', 'Athletic'], ['Alavés', 'Atlético de Madrid'], ['Barcelona', 'Getafe'],
  ['Elche', 'Celta'], ['Real Sociedad', 'Deportivo'], ['Betis', 'Osasuna'],
  ['Racing de Santander', 'Valencia'], ['Levante', 'Sevilla'], ['Eldense', 'Córdoba'],
  ['Andorra', 'Castellón'], ['Almería', 'Leganés'], ['Mallorca', 'Las Palmas'],
  ['Burgos', 'Granada'], ['Real Oviedo', 'Eibar'], ['Real Madrid', 'Villarreal'],
]

const comprobar = (r, conGoles = false) => {
  assert.equal(r.partidos.length, 15)
  r.partidos.forEach((p, i) => {
    assert.equal(p.orden, i + 1)
    assert.equal(p.local, JORNADA[i][0])
    assert.equal(p.visitante, JORNADA[i][1])
    if (conGoles) assert.ok(p.goles_local != null && p.goles_visitante != null, `goles del ${i + 1}`)
  })
}

test('una línea por partido, numerada y con ruido alrededor', () => {
  const texto = [
    'Inicio', 'Mis jugadas', 'Quiniela', 'Jornada 12 · Domingo 8 de octubre', 'Cierra en 2 d 4 h',
    ...JORNADA.map(([l, v], i) => `${i === 14 ? 'P15' : i + 1} ${l} - ${v}`),
    'Total: 0,75 €', 'Jugar',
  ].join('\n')
  const r = leerPartidosPegados(texto)
  assert.equal(r.metodo, 'lineas')
  comprobar(r)
})

test('cada equipo en su línea, con el número del partido suelto', () => {
  const texto = ['Quiniela', 'Jornada 12',
    ...JORNADA.flatMap(([l, v], i) => [String(i + 1), l, v, '1', 'X', '2']),
    'Validar'].join('\n')
  const r = leerPartidosPegados(texto)
  assert.equal(r.metodo, 'equipos')
  comprobar(r)
})

test('jornada pasada: recoge también los marcadores, en línea o sueltos', () => {
  const enLinea = JORNADA.map(([l, v], i) => `${i + 1}. ${l} ${i % 3} - ${(i + 1) % 3} ${v}`).join('\n')
  const r1 = leerPartidosPegados(enLinea)
  comprobar(r1, true)
  assert.deepEqual([r1.partidos[1].goles_local, r1.partidos[1].goles_visitante], [1, 2])

  const sueltos = JORNADA.flatMap(([l, v], i) => [String(i + 1), l, `${i % 3}-${(i + 2) % 3}`, v]).join('\n')
  const r2 = leerPartidosPegados(sueltos)
  comprobar(r2, true)
  assert.deepEqual([r2.partidos[0].goles_local, r2.partidos[0].goles_visitante], [0, 2])
})

test('el sufijo de categoría de LAE no estorba', () => {
  const r = leerPartidosPegados('Sevilla (M) - Betis (M)\nBarcelona (F) - Real Madrid (F)')
  assert.equal(r.partidos[0].local, 'Sevilla')
  assert.equal(r.partidos[1].local, 'Barcelona (F)')
})

test('un texto sin partidos no se inventa ninguno', () => {
  assert.equal(leerPartidosPegados('Hola\nEsto no es una quiniela\n12 - 14').partidos.length, 0)
})
