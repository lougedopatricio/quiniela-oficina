import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { leerBoletos, normalizarSigno } from '../src/lib/excel.js'

const JUGADORES = [
  { id: 'p1', nombre: 'Alejandro', alias: 'alejandro' },
  { id: 'p2', nombre: 'Lucía',     alias: 'lucia' },
  { id: 'p3', nombre: 'Javi',      alias: 'javi' },
]

/** Construye un .xlsx en memoria a partir de una matriz. */
function comoExcel(filas) {
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(filas), 'Boletos')
  return XLSX.write(libro, { type: 'array', bookType: 'xlsx' })
}

const CABECERA = ['Jugador', ...Array.from({ length: 14 }, (_, i) => `P${i + 1}`)]
const COLUMNA = ['1', 'X', '2', '1', '1', 'X', '2', '1', '1', 'X', '2', '2', '1', 'X']

test('normaliza lo que la gente escribe de verdad', () => {
  assert.equal(normalizarSigno('1'), '1')
  assert.equal(normalizarSigno(' x '), 'X')
  assert.equal(normalizarSigno('EQUIS'), 'X')
  assert.equal(normalizarSigno('L'), '1')
  assert.equal(normalizarSigno('V'), '2')
  assert.equal(normalizarSigno(''), null)
  assert.deepEqual(normalizarSigno('7'), { invalido: '7' })
})

test('lee un Excel correcto y casa a cada jugador', () => {
  const buf = comoExcel([CABECERA, ['Alejandro', ...COLUMNA], ['Lucía', ...COLUMNA]])
  const { filas } = leerBoletos(buf, JUGADORES)

  assert.equal(filas.length, 2, 'la cabecera no cuenta como boleto')
  assert.equal(filas[0].jugador.id, 'p1')
  assert.equal(filas[1].jugador.id, 'p2')
  assert.ok(filas.every(f => f.valida))
  assert.deepEqual(filas[0].picks, COLUMNA)
})

test('casa los nombres sin depender de acentos ni mayúsculas', () => {
  const buf = comoExcel([CABECERA, ['LUCIA', ...COLUMNA]])
  const { filas } = leerBoletos(buf, JUGADORES)
  assert.equal(filas[0].jugador.id, 'p2')
  assert.ok(filas[0].valida)
})

test('señala un nombre que no existe en vez de tragárselo', () => {
  const buf = comoExcel([CABECERA, ['Fulanito', ...COLUMNA]])
  const { filas } = leerBoletos(buf, JUGADORES)
  assert.equal(filas[0].valida, false)
  assert.match(filas[0].problemas[0], /no hay ningún jugador/)
})

test('señala signos inválidos y huecos, indicando el partido', () => {
  const rota = [...COLUMNA]; rota[3] = 'Y'; rota[9] = ''
  const buf = comoExcel([CABECERA, ['Javi', ...rota]])
  const { filas } = leerBoletos(buf, JUGADORES)

  assert.equal(filas[0].valida, false)
  assert.match(filas[0].problemas.join(' | '), /"Y" no es un signo válido \(partido 4\)/)
  assert.match(filas[0].problemas.join(' | '), /falta el signo del partido 10/)
  assert.deepEqual(filas[0].picks[3], '-')
})

test('una columna de 13 signos deja el hueco marcado', () => {
  const corta = COLUMNA.slice(0, 13)
  const buf = comoExcel([CABECERA, ['Javi', ...corta]])
  const { filas } = leerBoletos(buf, JUGADORES)
  assert.equal(filas[0].picks.length, 14)
  assert.equal(filas[0].valida, false)
  assert.match(filas[0].problemas.join(' '), /partido 14/)
})

test('detecta a la misma persona dos veces', () => {
  const buf = comoExcel([CABECERA, ['Javi', ...COLUMNA], ['javi', ...COLUMNA]])
  const { filas } = leerBoletos(buf, JUGADORES)
  assert.equal(filas[1].valida, false)
  assert.match(filas[1].problemas.join(' '), /repetido/)
})

test('funciona también sin fila de cabecera', () => {
  const buf = comoExcel([['Alejandro', ...COLUMNA], ['Javi', ...COLUMNA]])
  const { filas } = leerBoletos(buf, JUGADORES)
  assert.equal(filas.length, 2)
  assert.ok(filas.every(f => f.valida))
})

// ---------------------------------------------------------------------------
// El Excel de la oficina: una columna por persona, identificada por el
// usuario de su correo, y el Pleno al 15 jugado con 1/X/2.
// ---------------------------------------------------------------------------

const PARTIDOS = Array.from({ length: 14 }, (_, i) => `Local ${i + 1} - Visitante ${i + 1}`)
const RESULTADOS = ['1', 'X', '2', '1', 'x', '2', '1', 'X', '2', '1', 'X', '2', '1', 'X']

function hojaOficina(columnas, { resultados = RESULTADOS, pleno = '1' } = {}) {
  const nombres = Object.keys(columnas)
  const filas = [['', '', 'Resultados', ...nombres]]
  for (let i = 0; i < 14; i++) {
    filas.push([i + 1, PARTIDOS[i], resultados[i] ?? '', ...nombres.map(n => columnas[n][i] ?? '')])
  }
  filas.push(['PLENO AL 15', 'Betis - Sevilla', pleno, ...nombres.map(n => columnas[n][14] ?? '')])
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([['#', 'Participante']]), 'Resultados')
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(filas), 'Pronosticos')
  return XLSX.write(libro, { type: 'array', bookType: 'xlsx' })
}

const CON_CORREO = [
  { id: 'p1', nombre: 'Alejandro', alias: 'alejandro', email: 'a.lougedo.patricio@empresa.com' },
  { id: 'p2', nombre: 'Lucía', alias: 'lucia', email: 'lucia.a.gomez@empresa.com' },
]

test('formato oficina: lee columnas, casa por el usuario del correo y trae el pleno', () => {
  const col = [...COLUMNA, 'X']
  const { formato, filas, partidos } = leerBoletos(hojaOficina({ 'a.lougedo.patricio': col }), CON_CORREO)
  assert.equal(formato, 'oficina')
  assert.equal(filas.length, 1)
  assert.equal(filas[0].jugador.id, 'p1')
  assert.equal(filas[0].linea, 'D')
  assert.deepEqual(filas[0].picks, col)
  assert.ok(filas[0].valida)
  assert.equal(partidos.length, 15)
  assert.deepEqual(partidos[0], { orden: 1, local: 'Local 1', visitante: 'Visitante 1', resultado: '1' })
  assert.equal(partidos[4].resultado, 'X', 'la x minúscula del Excel también vale')
  assert.deepEqual(partidos[14], { orden: 15, local: 'Betis', visitante: 'Sevilla', resultado: '1' })
})

test('formato oficina: las columnas vacías no son boletos', () => {
  const { filas } = leerBoletos(hojaOficina({
    'a.lougedo.patricio': [...COLUMNA, '1'],
    'lucia.a.gomez': [],
  }), CON_CORREO)
  assert.equal(filas.length, 1)
})

test('formato oficina: sin pleno la columna no está completa', () => {
  const { filas } = leerBoletos(hojaOficina({ 'a.lougedo.patricio': COLUMNA }), CON_CORREO)
  assert.equal(filas[0].valida, false)
  assert.match(filas[0].problemas.join(' '), /falta el signo de el pleno/)
})

test('formato oficina: señala a quien no está dado de alta', () => {
  const { filas } = leerBoletos(hojaOficina({ 'nuevo.compi': [...COLUMNA, '2'] }), CON_CORREO)
  assert.equal(filas[0].jugador, null)
  assert.match(filas[0].problemas[0], /no hay ningún participante «nuevo.compi»/)
})

test('formato oficina: la misma persona en dos columnas', () => {
  const { filas } = leerBoletos(hojaOficina({
    'a.lougedo.patricio': [...COLUMNA, '1'],
    'alejandro': [...COLUMNA, '1'],
  }), CON_CORREO)
  assert.equal(filas[1].valida, false)
  assert.match(filas[1].problemas.join(' '), /repetido: ya aparece en la columna D/)
})
