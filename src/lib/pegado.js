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
 * Para TuLotero, jornadas pasadas y próximas. Lee los partidos directamente de
 * su tabla (`.tl-selection-team__name`, comprobado el 2026-10-26 contra
 * web.tulotero.es/resultados/11196), en orden, y los copia uno por línea:
 * «Athletic Club (m) (12º) 3 - 0 At. Madrid (m) (4º)». El marcador se coge del
 * primer número que haya en la fila de cada equipo, detrás de su nombre; en el
 * pleno, detrás vienen además las opciones 0/1/2/M, que se ignoran.
 *
 * Si TuLotero cambia su maquetación y no encuentra la tabla, copia el texto
 * de la página entera, que el lector de abajo también entiende.
 */
export const COMANDO_TULOTERO =
  `(()=>{const ns=[...document.querySelectorAll('.tl-selection-team__name')];if(!ns.length){copy(document.body.innerText);console.warn('No encuentro la tabla de partidos de TuLotero: copio el texto de la página entera.');return}const gol=n=>{const f=n.closest('.tl-selection-team-table__match-row')||n.closest('tl-selection-team')?.parentElement;if(!f)return'';const todo=f.innerText||'',nom=n.innerText||n.textContent,k=todo.indexOf(nom);let t=(k<0?todo:todo.slice(k+nom.length)).match(/(?:^|\\s)(\\d{1,2}|M)(?=\\s|$)/g)||[];t=t.map(x=>x.trim());if(t.slice(-4).join()==='0,1,2,M')t=t.slice(0,-4);return t[0]||''};const l=[];for(let i=0;i+1<ns.length;i+=2){const a=ns[i],b=ns[i+1],ga=gol(a),gb=gol(b),na=a.textContent.trim(),nb=b.textContent.trim();l.push(ga&&gb?na+' '+ga+' - '+gb+' '+nb:na+' - '+nb)}copy(l.join('\\n'));console.log(l.length+' partidos copiados. Vuelve a la quiniela y pégalos.')})()`

/**
 * Para LAE o cualquier otra web.
 * Copia todo el texto visible, también el que vive dentro de componentes con
 * shadow DOM y de iframes del mismo origen, que es donde algunas webs pintan
 * los boletos.
 */
export const COMANDO_COPIAR_PAGINA =
  `(()=>{const t=[document.body.innerText];const v=r=>r.querySelectorAll('*').forEach(e=>{if(e.shadowRoot){t.push([...e.shadowRoot.querySelectorAll('*')].map(x=>x.childElementCount?'':x.textContent).filter(Boolean).join('\\n'));v(e.shadowRoot)}});v(document);document.querySelectorAll('iframe').forEach(f=>{try{t.push(f.contentDocument.body.innerText)}catch(e){}});copy(t.join('\\n'));console.log('Copiado: vuelve a la quiniela y pégalo.')})()`

const SEPARADOR = /\s+(?:-|–|—|vs\.?|v)\s+/i
// «Betis 2 - 1 Sevilla», «Betis 2-1 Sevilla» o, en el pleno, «Getafe M - 1 Celta».
const CON_MARCADOR = /^(.+?)\s+(\d{1,2}|M)\s*[-–—:]\s*(\d{1,2}|M)\s+(.+)$/i
// TuLotero apellida cada equipo con su categoría y su puesto en la liga:
// «ATHLETIC CLUB (M) (12º)». Es también lo que lo delata como equipo cuando
// no está en nuestra lista (un filial, uno de Segunda RFEF…).
const SUFIJO_TULOTERO = /\s*\((?:m|f|\d{1,2}\s*º)\)\s*$/i

/**
 * El nombre limpio: sin el puesto en la liga, sin el «(m)» que no aporta
 * nada, conservando el «(F)» que sí distingue un partido femenino, y en
 * minúsculas normales si venía todo en mayúsculas.
 */
export function limpiarNombrePegado(nombre) {
  let n = String(nombre ?? '').replace(/\s+/g, ' ').trim()
  n = n.replace(/\s*\(\d{1,2}\s*º\)\s*$/i, '')
  n = limpiarNombreEquipo(n).replace(/\(f\)$/i, '(F)')
  if (n && n === n.toUpperCase()) {
    n = n.toLowerCase()
      .replace(/(^|[\s.(-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase())
      .replace(/\b(De|Del|La|Las|Los)\b(?!$)/g, w => w.toLowerCase())
      .replace(/^(de|del|la|las|los)\b/, w => w[0].toUpperCase() + w.slice(1))
      .replace(/\(f\)$/i, '(F)')
  }
  return n
}

// «M» en el pleno son tres goles o más. Si los dos son «M», el marcador no
// dice quién ganó: mejor no apuntar nada que apuntar un empate falso.
const goles = (a, b) => {
  if (a == null || b == null || a === '' || b === '') return [null, null]
  const A = String(a).toUpperCase(), B = String(b).toUpperCase()
  if (A === 'M' && B === 'M') return [null, null]
  return [A === 'M' ? 3 : +A, B === 'M' ? 3 : +B]
}
// Lo que va delante del partido: «1», «1.», «14)», «P15», «Pleno al 15».
const NUMERACION = /^(?:(?:p\s?15|pleno(?:\s+al)?\s+15)\s*[:.·)-]?\s*|\d{1,2}\s*[.·)-]?\s+)/i

const limpiarLinea = (t) => String(t ?? '').replace(/\s+/g, ' ').trim()
const esEquipo = (t) => !!idDeEquipo(limpiarNombrePegado(t)) || SUFIJO_TULOTERO.test(t)
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
    local = limpiarNombrePegado(local)
    visitante = limpiarNombrePegado(visitante)
    if (!pareceNombre(local) || !pareceNombre(visitante)) continue
    const [g1, g2] = goles(gl, gv)
    encontrados.push({
      local, visitante,
      goles_local: g1,
      goles_visitante: g2,
      conocidos: esEquipo(local) + esEquipo(visitante),
    })
  }
  // Si hay más candidatos de la cuenta (menús, anuncios, otras jornadas en la
  // misma página), mandan los que tienen equipos reconocidos.
  const buenos = encontrados.length > 15 ? encontrados.filter(p => p.conocidos > 0) : encontrados
  return buenos
}

/**
 * Intento 2: cada equipo en su línea, emparejados en orden.
 *
 * Los números sueltos se interpretan por su posición: el primero detrás del
 * local es su marcador, y el primero detrás del visitante, el suyo (así lo
 * pinta TuLotero: «1 · ATHLETIC · 3 · AT. MADRID · 0 · 2 · RAYO…»). Un
 * marcador entero en una línea («2-1») entre los dos equipos también vale.
 */
function porEquipos(lineas) {
  const partidos = []
  let local = null, gl = null, gv = null
  let ultimo = null          // el partido recién cerrado, esperando su segundo marcador
  for (const cruda of lineas) {
    const t = cruda.trim()
    if (/^(\d{1,2}|M)$/i.test(t)) {
      if (local && gl == null) gl = t
      else if (!local && ultimo && ultimo.gv == null) ultimo.gv = t
      continue
    }
    const marcador = t.match(/^(\d{1,2}|M)\s*[-–—:]\s*(\d{1,2}|M)$/i)
    if (marcador) {
      if (local) { gl = marcador[1]; gv = marcador[2] }
      continue
    }
    const linea = t.replace(NUMERACION, '').trim()
    if (!linea || !esEquipo(linea)) continue
    if (!local) {
      local = limpiarNombrePegado(linea); gl = null; gv = null
      if (ultimo) ultimo = null
    } else {
      ultimo = { local, visitante: limpiarNombrePegado(linea), gl, gv }
      partidos.push(ultimo)
      local = null
    }
  }
  return partidos.map(p => {
    const [g1, g2] = goles(p.gl, p.gv)
    return { local: p.local, visitante: p.visitante, goles_local: g1, goles_visitante: g2 }
  })
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
