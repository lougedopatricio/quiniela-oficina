// ===========================================================================
// Selecciones nacionales: sus nombres y su bandera.
//
// Las quinielas de parón internacional (y las de verano) llevan selecciones,
// que no tienen escudo de club. En su lugar se pinta la bandera, dibujada
// aquí en SVG —simplificada, a tamaño de icono— en vez de con emojis: Windows
// no pinta los emojis de bandera (enseña «ES», «FR»…) y al imprimir los
// boletos tampoco salen fiables.
//
// Todas las banderas van en una caja de 30 × 20.
// ===========================================================================

import { clave } from './texto.js'

// --- Piezas para dibujar ------------------------------------------------------
const rect = (x, y, w, h, c) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`
const horizontal = (...c) => c.map((col, i) => rect(0, (20 / c.length) * i, 30, 20 / c.length + 0.05, col)).join('')
const vertical = (...c) => c.map((col, i) => rect((30 / c.length) * i, 0, 30 / c.length + 0.05, 20, col)).join('')
const circulo = (cx, cy, r, c) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${c}"/>`
// Cruz nórdica: el palo vertical desplazado hacia el asta.
const nordica = (x, grosor, c) => rect(x, 0, grosor, 20, c) + rect(0, 10 - grosor / 2, 30, grosor, c)
function estrella(cx, cy, r, c, giro = -90, relleno = true) {
  const p = []
  for (let i = 0; i < 10; i++) {
    const a = ((giro + i * 36) * Math.PI) / 180
    const rr = i % 2 ? r * 0.4 : r
    p.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`)
  }
  return relleno
    ? `<polygon points="${p.join(' ')}" fill="${c}"/>`
    : `<polygon points="${p.join(' ')}" fill="none" stroke="${c}" stroke-width="0.9"/>`
}
const franjas = (n, a, b) => Array.from({ length: n }, (_, i) => rect(0, (20 / n) * i, 30, 20 / n + 0.05, i % 2 ? b : a)).join('')

// --- Las selecciones ------------------------------------------------------------
// [nombre que se enseña, bandera, otras formas de escribirlo]
const LISTA = [
  ['España', rect(0, 0, 30, 20, '#AA151B') + rect(0, 5, 30, 10, '#F1BF00'), ['espana', 'spain']],
  ['Turquía', rect(0, 0, 30, 20, '#E30A17') + circulo(11, 10, 5, '#fff') + circulo(12.3, 10, 4, '#E30A17') + estrella(18, 10, 2.4, '#fff', 180),
    ['turquia', 'turkiye', 'turkey']],
  ['Italia', vertical('#009246', '#fff', '#CE2B37'), ['italy']],
  ['Bélgica', vertical('#000', '#FAE042', '#ED2939'), ['belgica', 'belgium']],
  ['Francia', vertical('#002395', '#fff', '#ED2939'), ['france']],
  ['República Checa', rect(0, 0, 30, 10, '#fff') + rect(0, 10, 30, 10, '#D7141A') + '<polygon points="0,0 15,10 0,20" fill="#11457E"/>',
    ['rep checa', 'r checa', 'chequia', 'czechia', 'czech republic', 'republica checa']],
  ['Croacia', horizontal('#FF0000', '#fff', '#171796') +
    Array.from({ length: 9 }, (_, i) => rect(12 + (i % 3) * 2, 5 + Math.floor(i / 3) * 2.4, 2, 2.4, i % 2 ? '#fff' : '#FF0000')).join('') +
    `<rect x="12" y="5" width="6" height="7.2" fill="none" stroke="#171796" stroke-width="0.4"/>`, ['croatia']],
  ['Inglaterra', rect(0, 0, 30, 20, '#fff') + rect(13, 0, 4, 20, '#CE1124') + rect(0, 8, 30, 4, '#CE1124'), ['england']],
  ['Alemania', horizontal('#000', '#DD0000', '#FFCE00'), ['germany']],
  ['Portugal', rect(0, 0, 12, 20, '#006600') + rect(12, 0, 18, 20, '#FF0000') + circulo(12, 10, 3.6, '#FFE000') + rect(10.6, 8.3, 2.8, 3.4, '#fff'), []],
  ['Países Bajos', horizontal('#AE1C28', '#fff', '#21468B'), ['paises bajos', 'holanda', 'netherlands']],
  ['Escocia', rect(0, 0, 30, 20, '#0065BD') + '<path d="M0,0 L30,20 M30,0 L0,20" stroke="#fff" stroke-width="3"/>', ['scotland']],
  ['Gales', rect(0, 0, 30, 10, '#fff') + rect(0, 10, 30, 10, '#00B140') + circulo(15, 10, 4.5, '#C8102E'), ['wales']],
  ['Suiza', rect(0, 0, 30, 20, '#D52B1E') + rect(13.5, 4.5, 3, 11, '#fff') + rect(9.5, 8.5, 11, 3, '#fff'), ['switzerland']],
  ['Austria', horizontal('#ED2939', '#fff', '#ED2939'), []],
  ['Polonia', rect(0, 0, 30, 10, '#fff') + rect(0, 10, 30, 10, '#DC143C'), ['poland']],
  ['Dinamarca', rect(0, 0, 30, 20, '#C8102E') + nordica(9, 3, '#fff'), ['denmark']],
  ['Suecia', rect(0, 0, 30, 20, '#006AA7') + nordica(9, 3, '#FECC00'), ['sweden']],
  ['Noruega', rect(0, 0, 30, 20, '#BA0C2F') + nordica(8, 5, '#fff') + nordica(9, 3, '#00205B'), ['norway']],
  ['Finlandia', rect(0, 0, 30, 20, '#fff') + nordica(8, 4, '#002F6C'), ['finland']],
  ['Islandia', rect(0, 0, 30, 20, '#02529C') + nordica(7.5, 5, '#fff') + nordica(8.5, 3, '#DC1E35'), ['iceland']],
  ['Irlanda', vertical('#169B62', '#fff', '#FF883E'), ['ireland']],
  ['Ucrania', rect(0, 0, 30, 10, '#0057B7') + rect(0, 10, 30, 10, '#FFD700'), ['ukraine']],
  ['Hungría', horizontal('#CE2939', '#fff', '#477050'), ['hungria', 'hungary']],
  ['Rumanía', vertical('#002B7F', '#FCD116', '#CE1126'), ['rumania', 'romania']],
  ['Serbia', horizontal('#C6363C', '#0C4076', '#fff'), []],
  ['Grecia', franjas(9, '#0D5EAF', '#fff') + rect(0, 0, 11.1, 11.1, '#0D5EAF') + rect(4.4, 0, 2.3, 11.1, '#fff') + rect(0, 4.4, 11.1, 2.3, '#fff'), ['greece']],
  ['Eslovaquia', horizontal('#fff', '#0B4EA2', '#EE1C25') + rect(6, 4, 6, 9, '#EE1C25') + rect(8.4, 5.5, 1.2, 5.5, '#fff') + rect(7, 7, 4, 1, '#fff'), ['slovakia']],
  ['Eslovenia', horizontal('#fff', '#005DA4', '#ED1C24') + rect(6, 3, 5, 6, '#005DA4'), ['slovenia']],
  ['Georgia', rect(0, 0, 30, 20, '#fff') + rect(13.5, 0, 3, 20, '#FF0000') + rect(0, 8.5, 30, 3, '#FF0000'), []],
  ['Marruecos', rect(0, 0, 30, 20, '#C1272D') + estrella(15, 10.4, 4.5, '#006233', -90, false), ['morocco']],
  ['Argentina', horizontal('#74ACDF', '#fff', '#74ACDF') + circulo(15, 10, 2, '#F6B40E'), []],
  ['Brasil', rect(0, 0, 30, 20, '#009C3B') + '<polygon points="15,2 28,10 15,18 2,10" fill="#FFDF00"/>' + circulo(15, 10, 4.6, '#002776'), ['brazil']],
  ['Uruguay', franjas(9, '#fff', '#0038A8') + rect(0, 0, 11, 11.1, '#fff') + circulo(5.5, 5.5, 3, '#FCD116'), []],
  ['Colombia', rect(0, 0, 30, 10, '#FCD116') + rect(0, 10, 30, 5, '#003893') + rect(0, 15, 30, 5, '#CE1126'), []],
  ['México', vertical('#006847', '#fff', '#CE1126') + circulo(15, 10, 2.2, '#8C5A2B'), ['mexico']],
  ['Estados Unidos', franjas(13, '#B22234', '#fff') + rect(0, 0, 13, 10.8, '#3C3B6E'), ['ee uu', 'eeuu', 'usa', 'estados unidos']],
  ['Japón', rect(0, 0, 30, 20, '#fff') + circulo(15, 10, 6, '#BC002D'), ['japon', 'japan']],
]

export const SELECCIONES = LISTA.map(([nombre]) => nombre)

// Clave sin acentos ni puntuación -> bandera. Se quita, como con los clubes,
// cualquier paréntesis final («España (F)» lleva la misma bandera).
const POR_CLAVE = new Map()
for (const [nombre, svg, otras] of LISTA) {
  for (const forma of [nombre, ...otras]) POR_CLAVE.set(clave(forma), svg)
}

const normalizar = (n) => clave(String(n ?? '').replace(/\s*\([^)]*\)\s*$/, ''))

/** El dibujo de la bandera de una selección (contenido de un SVG 30 × 20), o null. */
export const banderaDe = (nombre) => POR_CLAVE.get(normalizar(nombre)) ?? null

export const esSeleccion = (nombre) => POR_CLAVE.has(normalizar(nombre))
