// ===========================================================================
// Lectura de los Excel de boletos.
//
// Se parsea ENTERO en el navegador y se enseña una previsualización antes de
// tocar la base. Un Excel pasado a mano desde 8 boletos de papel siempre trae
// alguna errata, y descubrirla después de haber insertado 8 filas es mucho más
// caro que verla antes.
// ===========================================================================

import * as XLSX from 'xlsx'
// Así "Lucía" y "Lucia" casan con el mismo jugador. Compartido con equipos.js
// para no tener dos veces el mismo truco de los diacríticos.
import { sinAcentos } from './texto.js'

const VALIDOS = new Set(['1', 'X', '2'])

/** Normaliza lo que la gente escribe de verdad en un Excel. */
export function normalizarSigno(v) {
  const s = String(v ?? '').trim().toUpperCase()
  if (s === '') return null
  if (VALIDOS.has(s)) return s
  // Errores habituales al teclear rápido en la columna del medio.
  if (s === 'X.' || s === '×' || s === 'EQUIS' || s === 'E') return 'X'
  if (s === 'L' || s === 'LOCAL') return '1'
  if (s === 'V' || s === 'VISITANTE' || s === 'F') return '2'
  if (s === '0') return null
  return { invalido: s }
}


/**
 * Índice para reconocer a cada persona por cualquiera de sus formas: alias,
 * nombre, apodo, las alternativas que haya registrado el administrador y el
 * usuario de su correo (lo de antes de la @), que es justo lo que pone el
 * Excel de la oficina en la cabecera de cada columna.
 */
function indiceDeJugadores(jugadores) {
  const porClave = new Map()
  for (const j of jugadores) {
    const usuario = j.email ? j.email.split('@')[0] : null
    for (const forma of [j.alias, j.nombre, j.apodo, usuario, ...(j.alias_alternativos ?? [])]) {
      if (forma) porClave.set(sinAcentos(forma), j)
    }
  }
  return porClave
}

const esPronosticos = (nombre) => sinAcentos(nombre).startsWith('pronostico')

/**
 * Lee el libro y devuelve los boletos con sus problemas señalados.
 *
 * Entiende dos formatos:
 *
 *  · El de la oficina (hoja «Pronosticos»): una COLUMNA por participante, con
 *    su usuario de correo en la cabecera; una fila por partido, con
 *    «Local - Visitante» en la columna B y el resultado en la C; y la fila
 *    «PLENO AL 15» al final. Trae también los partidos y los resultados.
 *  · El sencillo de la plantilla: una FILA por persona, el nombre primero y
 *    los catorce signos detrás.
 *
 * @param {ArrayBuffer} buffer
 * @param {Array<{id, nombre, alias, email?}>} jugadores  para casar los nombres
 */
export function leerBoletos(buffer, jugadores = []) {
  const libro = XLSX.read(buffer, { type: 'array' })
  if (!libro.SheetNames.length) return { filas: [], errores: ['El archivo no tiene ninguna hoja.'] }

  const porClave = indiceDeJugadores(jugadores)
  const aMatriz = (hoja) => XLSX.utils.sheet_to_json(hoja, { header: 1, blankrows: true, defval: '' })

  const nombreOficina = libro.SheetNames.find(esPronosticos)
  if (nombreOficina) return leerFormatoOficina(aMatriz(libro.Sheets[nombreOficina]), porClave)

  const hoja = libro.Sheets[libro.SheetNames[0]]
  const matriz = XLSX.utils.sheet_to_json(hoja, { header: 1, blankrows: false, defval: '' })
  // Una hoja con «Resultados» en la cabecera es el formato de la oficina
  // aunque alguien haya renombrado la pestaña.
  const cab = matriz.findIndex(f => f.some(c => sinAcentos(c) === 'resultados'))
  if (cab >= 0) return leerFormatoOficina(aMatriz(hoja), porClave)

  return leerFormatoFilas(matriz, porClave)
}

/** Letra de columna de Excel (0 → A, 26 → AA), para señalar dónde está cada cosa. */
export const letraColumna = (i) => {
  let s = ''
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

function leerFormatoOficina(matriz, porClave) {
  // La fila de cabecera es la que tiene «Resultados»; los participantes van a
  // su derecha.
  const filaCab = matriz.findIndex(f => f.some(c => sinAcentos(c) === 'resultados'))
  if (filaCab < 0) return { filas: [], errores: ['No encuentro la fila de cabecera con «Resultados».'] }
  const cabecera = matriz[filaCab]
  const colRes = cabecera.findIndex(c => sinAcentos(c) === 'resultados')
  const colPartido = colRes - 1

  // Las filas de partido: 1..14 en la primera columna, y la del pleno.
  const filasPartido = new Map()   // orden -> índice de fila
  for (let r = filaCab + 1; r < matriz.length; r++) {
    const marca = sinAcentos(matriz[r][0])
    if (marca.includes('pleno')) filasPartido.set(15, r)
    else if (/^\d+$/.test(marca) && +marca >= 1 && +marca <= 14) filasPartido.set(+marca, r)
  }
  const errores = []
  for (let o = 1; o <= 14; o++) if (!filasPartido.has(o)) errores.push(`No encuentro la fila del partido ${o}.`)
  const hayPleno = filasPartido.has(15)

  const partidos = []
  for (const [orden, r] of [...filasPartido].sort((a, b) => a[0] - b[0])) {
    const texto = String(matriz[r][colPartido] ?? '').trim()
    const [local, visitante] = texto.split(/\s+-\s+|\s*–\s*/).map(x => x?.trim())
    const res = normalizarSigno(matriz[r][colRes])
    partidos.push({
      orden, local: local || '', visitante: visitante || '',
      resultado: typeof res === 'string' ? res : null,
    })
  }

  const filas = []
  const total = hayPleno ? 15 : 14
  for (let c = colRes + 1; c < cabecera.length; c++) {
    const nombre = String(cabecera[c] ?? '').trim()
    if (!nombre) continue
    const crudos = Array.from({ length: total }, (_, k) => matriz[filasPartido.get(k + 1)]?.[c])
    // Columnas preparadas para alguien que esta semana no ha jugado: sin un
    // solo signo. No son un error, simplemente no hay boleto.
    if (crudos.every(v => String(v ?? '').trim() === '')) continue

    const problemas = []
    const picks = crudos.map((v, k) => {
      const r = normalizarSigno(v)
      const cual = k === 14 ? 'el pleno' : `el partido ${k + 1}`
      if (r === null) { problemas.push(`falta el signo de ${cual}`); return '-' }
      if (typeof r === 'object') { problemas.push(`"${r.invalido}" no es un signo válido (${cual})`); return '-' }
      return r
    })
    const jugador = porClave.get(sinAcentos(nombre)) ?? null
    if (!jugador) problemas.push(`no hay ningún participante «${nombre}»`)

    filas.push({ linea: letraColumna(c), nombre, jugador, picks, problemas, valida: problemas.length === 0 })
  }

  marcarRepetidos(filas)
  return { formato: 'oficina', filas, errores, partidos }
}

/** Un mismo nombre dos veces es casi siempre un copiar-pegar mal hecho. */
function marcarRepetidos(filas) {
  const vistos = new Map()
  for (const f of filas) {
    const k = f.jugador?.id ?? sinAcentos(f.nombre)
    if (vistos.has(k)) {
      f.problemas.push(`repetido: ya aparece en ${vistos.get(k)}`)
      f.valida = false
    } else {
      vistos.set(k, typeof f.linea === 'number' ? `la fila ${f.linea}` : `la columna ${f.linea}`)
    }
  }
}

function leerFormatoFilas(matriz, porClave) {
  const filas = []
  for (const [i, cruda] of matriz.entries()) {
    const nombre = String(cruda[0] ?? '').trim()
    if (!nombre) continue

    // Cabecera: "Jugador | 1 | 2 | ..." o similar. Se reconoce porque su
    // segunda celda no es un signo válido.
    const primerSigno = normalizarSigno(cruda[1])
    if (i === 0 && (primerSigno === null || primerSigno?.invalido)) {
      const pinta = sinAcentos(nombre)
      if (['jugador', 'nombre', 'alias', 'participante', ''].includes(pinta)) continue
    }

    const problemas = []
    const picks = []
    for (let c = 1; c <= 14; c++) {
      const r = normalizarSigno(cruda[c])
      if (r === null) {
        picks.push('-')
        problemas.push(`falta el signo del partido ${c}`)
      } else if (typeof r === 'object') {
        picks.push('-')
        problemas.push(`"${r.invalido}" no es un signo válido (partido ${c})`)
      } else {
        picks.push(r)
      }
    }

    const jugador = porClave.get(sinAcentos(nombre)) ?? null
    if (!jugador) problemas.push(`no hay ningún jugador que se llame "${nombre}"`)

    filas.push({ linea: i + 1, nombre, jugador, picks, problemas, valida: problemas.length === 0 })
  }

  marcarRepetidos(filas)
  return { formato: 'filas', filas, errores: [] }
}

/**
 * Genera la plantilla que se descarga desde la propia app, con la misma forma
 * que el Excel de la oficina: hoja «Pronosticos», una columna por persona
 * (activos, por su usuario de correo si lo tienen) y una fila por partido,
 * con el Pleno al 15 al final.
 */
export function plantillaBoletos(jugadores = [], partidos = []) {
  const quien = jugadores
    .filter(j => j.activo !== false)
    .map(j => (j.email ? j.email.split('@')[0] : j.alias || j.nombre))
  const nombreDe = (orden) => {
    const m = partidos.find(p => p.orden === orden)
    return m ? `${m.local} - ${m.visitante}` : ''
  }
  const filas = [
    ['', '', 'Resultados', ...(quien.length ? quien : ['usuario.correo'])],
    ...Array.from({ length: 14 }, (_, i) => [i + 1, nombreDe(i + 1), '']),
    ['PLENO AL 15', nombreDe(15), ''],
  ]

  const hoja = XLSX.utils.aoa_to_sheet(filas)
  hoja['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 10 }, ...quien.map(() => ({ wch: 6 }))]

  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Pronosticos')
  XLSX.writeFile(libro, 'quiniela-plantilla.xlsx')
}
