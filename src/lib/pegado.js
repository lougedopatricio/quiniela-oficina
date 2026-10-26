// ===========================================================================
// Los partidos de una jornada, sacados de texto copiado de cualquier web.
//
// La fuente práctica es TuLotero, que deja elegir cualquier jornada —pasada o
// futura—, cosa que LAE no hace. Pero TuLotero pide cuenta propia y su web es
// una aplicación que cambia de maquetación sin avisar, así que en vez de
// depender de sus clases CSS, la consola copia el TEXTO visible de la página
// entera y aquí se encuentran los partidos reconociendo los equipos por su
// nombre (la misma tabla que pone los escudos, src/lib/equipos.js).
//
// Entiende las dos formas en que suele salir un partido al copiar:
//
//   · en una línea: «1 Betis - Sevilla», «Betis 2 - 1 Sevilla», «Betis vs
//     Sevilla»…
//   · cada equipo en su línea, con el número del partido o el marcador
//     sueltos entre medias, que es lo que da copiar una tabla de una web.
//
// Si la jornada ya se jugó y la página enseña los marcadores, se recogen.
// ===========================================================================

import { idDeEquipo } from './equipos.js'
import { limpiarNombreEquipo } from '../../scripts/lae.mjs'

/**
 * Lo que se pega en la consola de la página (TuLotero, LAE o cualquier otra).
 * Copia todo el texto visible, también el que vive dentro de componentes con
 * shadow DOM y de iframes del mismo origen, que es donde algunas webs pintan
 * los boletos.
 */
export const COMANDO_COPIAR_PAGINA =
  `(()=>{const t=[document.body.innerText];const v=r=>r.querySelectorAll('*').forEach(e=>{if(e.shadowRoot){t.push([...e.shadowRoot.querySelectorAll('*')].map(x=>x.childElementCount?'':x.textContent).filter(Boolean).join('\\n'));v(e.shadowRoot)}});v(document);document.querySelectorAll('iframe').forEach(f=>{try{t.push(f.contentDocument.body.innerText)}catch(e){}});copy(t.join('\\n'));console.log('Copiado: vuelve a la quiniela y pégalo.')})()`

const SEPARADOR = /\s+(?:-|–|—|vs\.?|v)\s+/i
// «Betis 2 - 1 Sevilla» o «Betis 2-1 Sevilla».
const CON_MARCADOR = /^(.+?)\s+(\d{1,2})\s*[-–—:]\s*(\d{1,2})\s+(.+)$/
// Lo que va delante del partido: «1», «1.», «14)», «P15», «Pleno al 15».
const NUMERACION = /^(?:(?:p\s?15|pleno(?:\s+al)?\s+15)\s*[:.·)-]?\s*|\d{1,2}\s*[.·)-]?\s+)/i

const limpiarLinea = (t) => String(t ?? '').replace(/\s+/g, ' ').trim()
const esEquipo = (t) => !!idDeEquipo(t)
// Un nombre de equipo razonable: corto, con letras, sin pinta de frase.
const pareceNombre = (t) => t.length >= 2 && t.length <= 32 && /\p{L}/u.test(t) && t.split(' ').length <= 5

/** Intento 1: un partido por línea. */
function porLineas(lineas) {
  const encontrados = []
  for (const cruda of lineas) {
    const linea = cruda.replace(NUMERACION, '')
    let local, visitante, gl = null, gv = null
    const m = linea.match(CON_MARCADOR)
    if (m && pareceNombre(m[1]) && pareceNombre(m[4])) {
      [, local, gl, gv, visitante] = m
    } else {
      const partes = linea.split(SEPARADOR)
      if (partes.length !== 2) continue
      ;[local, visitante] = partes
    }
    local = limpiarNombreEquipo(local)
    visitante = limpiarNombreEquipo(visitante)
    if (!pareceNombre(local) || !pareceNombre(visitante)) continue
    encontrados.push({
      local, visitante,
      goles_local: gl == null ? null : +gl,
      goles_visitante: gv == null ? null : +gv,
      conocidos: esEquipo(local) + esEquipo(visitante),
    })
  }
  // Si hay más candidatos de la cuenta (menús, anuncios, otras jornadas en la
  // misma página), mandan los que tienen equipos reconocidos.
  const buenos = encontrados.length > 15 ? encontrados.filter(p => p.conocidos > 0) : encontrados
  return buenos
}

/** Intento 2: cada equipo en su línea, emparejados en orden. */
function porEquipos(lineas) {
  const partidos = []
  let pendiente = null      // el local, esperando a su visitante
  let numeros = []          // lo numérico entre los dos: el marcador
  for (const cruda of lineas) {
    const linea = cruda.replace(NUMERACION, '').trim()
    if (/^\d{1,2}$/.test(cruda.trim())) {
      if (pendiente) numeros.push(+cruda.trim())
      continue
    }
    const marcador = cruda.trim().match(/^(\d{1,2})\s*[-–—:]\s*(\d{1,2})$/)
    if (marcador) {
      if (pendiente) numeros = [+marcador[1], +marcador[2]]
      continue
    }
    if (!linea || !esEquipo(linea)) continue
    const nombre = limpiarNombreEquipo(linea)
    if (!pendiente) {
      pendiente = nombre
      numeros = []
    } else {
      const [gl, gv] = numeros.length === 2 ? numeros : [null, null]
      partidos.push({ local: pendiente, visitante: nombre, goles_local: gl, goles_visitante: gv })
      pendiente = null
    }
  }
  return partidos
}

/**
 * Los partidos que haya en un texto pegado, en orden, con su número de la
 * quiniela (1..15).
 *
 * @returns {{ partidos: Array<{orden, local, visitante, goles_local, goles_visitante, completo}>, metodo }}
 */
export function leerPartidosPegados(texto) {
  const lineas = String(texto ?? '').split(/\r?\n/).map(limpiarLinea).filter(Boolean)

  let lista = porLineas(lineas)
  let metodo = 'lineas'
  // Se prefiere la lectura por líneas, que es exacta; si no llega a una
  // jornada, se prueba a emparejar equipos sueltos.
  if (lista.length < 14) {
    const sueltos = porEquipos(lineas)
    if (sueltos.length > lista.length) { lista = sueltos; metodo = 'equipos' }
  }

  return {
    metodo,
    partidos: lista.slice(0, 15).map((p, i) => ({
      orden: i + 1,
      local: p.local,
      visitante: p.visitante,
      goles_local: p.goles_local ?? null,
      goles_visitante: p.goles_visitante ?? null,
      completo: !!(p.local && p.visitante),
    })),
  }
}
