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

// ---------------------------------------------------------------------------
// TuLotero de verdad: el texto de web.tulotero.es/resultados/11196 (quiniela
// J-4 de 2026-27) tal cual lo copia la consola, con su menú, la tabla de
// premios y la barra de otras jornadas alrededor. Recortado lo que no
// importa; los partidos y el orden, intactos.
// ---------------------------------------------------------------------------
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { signoDeMarcador } from '../scripts/lae.mjs'
import { limpiarNombrePegado } from '../src/lib/pegado.js'

const TULOTERO_J4 = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'tulotero-resultados-j4.txt'), 'utf8')
// Los signos oficiales de esa jornada, de la propia barra lateral de TuLotero.
const SIGNOS_J4 = ['1', '1', '2', '2', '1', 'X', 'X', 'X', '2', '1', '2', '2', '1', 'X']

test('TuLotero, jornada pasada copiada como texto: 15 partidos con sus marcadores', () => {
  const { partidos } = leerPartidosPegados(TULOTERO_J4)
  assert.equal(partidos.length, 15)
  assert.deepEqual(partidos[0], { orden: 1, local: 'Athletic Club', visitante: 'At. Madrid', goles_local: 3, goles_visitante: 0, completo: true })
  assert.equal(partidos[7].local, 'Real Sociedad B', 'un filial que no está en la lista de escudos no descuadra nada')
  assert.equal(partidos[7].visitante, 'Tenerife')
  assert.equal(partidos[10].local, 'Sevilla (F)')
  assert.equal(partidos[11].local, 'Logroño (F)')
  assert.deepEqual(
    partidos.slice(0, 14).map(p => signoDeMarcador(p.goles_local, p.goles_visitante)),
    SIGNOS_J4,
    'los marcadores dan los signos oficiales de la jornada'
  )
  assert.deepEqual([partidos[14].local, partidos[14].visitante, partidos[14].goles_local, partidos[14].goles_visitante],
    ['Getafe', 'Celta', 1, 1], 'el pleno, sin confundir su marcador con las opciones 0/1/2/M')
})

test('TuLotero, lo que copia su comando propio: una línea por partido', () => {
  const texto = [
    'Athletic Club (m) (12º) 3 - 0 At. Madrid (m) (4º)',
    'Real Sociedad B (m) (13º) 1 - 1 Tenerife (m) (7º)',
    'Logroño (f) (5º) 0 - 1 Athletic Club (f) (3º)',
    'Getafe (m) (15º) M - 1 Celta (m) (17º)',
    'Betis (m) (3º) M - M Sevilla (m) (9º)',
    'Real Madrid (m) (1º) - Barcelona (m) (2º)',
  ].join('\n')
  const { partidos, metodo } = leerPartidosPegados(texto)
  assert.equal(metodo, 'lineas')
  assert.deepEqual(partidos.map(p => [p.local, p.visitante, p.goles_local, p.goles_visitante]), [
    ['Athletic Club', 'At. Madrid', 3, 0],
    ['Real Sociedad B', 'Tenerife', 1, 1],
    ['Logroño (F)', 'Athletic Club (F)', 0, 1],
    ['Getafe', 'Celta', 3, 1],
    ['Betis', 'Sevilla', null, null],
    ['Real Madrid', 'Barcelona', null, null],
  ])
})

test('los nombres de TuLotero salen limpios', () => {
  assert.equal(limpiarNombrePegado('ATHLETIC CLUB (M) (12º)'), 'Athletic Club')
  assert.equal(limpiarNombrePegado('RACING DE SANTANDER (M) (10º)'), 'Racing de Santander')
  assert.equal(limpiarNombrePegado('SEVILLA (F) (8º)'), 'Sevilla (F)')
  assert.equal(limpiarNombrePegado('Alavés (m) (5º)'), 'Alavés')
})

test('los dos comandos de consola son JavaScript válido', async () => {
  const { COMANDO_TULOTERO, COMANDO_COPIAR_PAGINA } = await import('../src/lib/pegado.js')
  // Un escape mal puesto (\s que acaba siendo «s») ya rompió uno una vez.
  assert.doesNotThrow(() => new Function(COMANDO_TULOTERO))
  assert.doesNotThrow(() => new Function(COMANDO_COPIAR_PAGINA))
  assert.match(COMANDO_TULOTERO, /\\s/, 'la expresión regular conserva sus \\s')
})

test('una jornada de selecciones copiada de TuLotero también se lee', () => {
  const texto = ['1', 'ESPAÑA (M) (1º)', '2', 'TURQUÍA (M) (2º)', '0', '2', 'ITALIA (M) (3º)', '1', 'REP. CHECA (M) (4º)', '1'].join('\n')
  const { partidos } = leerPartidosPegados(texto)
  assert.deepEqual(partidos.map(p => [p.local, p.visitante, p.goles_local, p.goles_visitante]),
    [['España', 'Turquía', 2, 0], ['Italia', 'Rep. Checa', 1, 1]])
})
