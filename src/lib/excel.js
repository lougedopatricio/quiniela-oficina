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
 * Lee el libro y devuelve las filas con sus problemas señalados.
 *
 * Formato esperado: primera columna el nombre o alias, y a continuación los 14
 * signos. Se salta la fila de cabecera si la detecta.
 *
 * @param {ArrayBuffer} buffer
 * @param {Array<{id, nombre, alias}>} jugadores  para casar los nombres
 */
export function leerBoletos(buffer, jugadores = []) {
  const libro = XLSX.read(buffer, { type: 'array' })
  const hoja = libro.Sheets[libro.SheetNames[0]]
  if (!hoja) return { filas: [], errores: ['El archivo no tiene ninguna hoja.'] }

  const matriz = XLSX.utils.sheet_to_json(hoja, { header: 1, blankrows: false, defval: '' })

  // Cada persona se reconoce por su alias, su nombre y cualquier otra forma
  // que el administrador haya registrado ("Alex", "Alejandro L.", el apodo de
  // la oficina...). Sin esto, cambiar cómo se escribe un nombre en el Excel
  // obliga a corregir el archivo en vez de la ficha.
  const porClave = new Map()
  for (const j of jugadores) {
    for (const forma of [j.alias, j.nombre, ...(j.alias_alternativos ?? [])]) {
      if (forma) porClave.set(sinAcentos(forma), j)
    }
  }

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

  // Un mismo nombre dos veces es casi siempre un copiar-pegar mal hecho.
  const vistos = new Map()
  for (const f of filas) {
    const k = sinAcentos(f.nombre)
    if (vistos.has(k)) {
      f.problemas.push(`repetido: ya aparece en la fila ${vistos.get(k)}`)
      f.valida = false
    } else {
      vistos.set(k, f.linea)
    }
  }

  return { filas, errores: [] }
}

/** Genera la plantilla que se descarga desde la propia app. */
export function plantillaBoletos(jugadores = []) {
  const cabecera = ['Jugador', ...Array.from({ length: 14 }, (_, i) => `P${i + 1}`)]
  const cuerpo = (jugadores.length ? jugadores.map(j => j.nombre) : ['Ejemplo'])
    .map(n => [n, ...Array(14).fill('')])

  const hoja = XLSX.utils.aoa_to_sheet([cabecera, ...cuerpo])
  hoja['!cols'] = [{ wch: 18 }, ...Array(14).fill({ wch: 4 })]

  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, hoja, 'Boletos')
  XLSX.writeFile(libro, 'plantilla-boletos.xlsx')
}
