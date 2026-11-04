// ===========================================================================
// Los mensajes para el grupo: apertura, cierre y resultados de una jornada.
//
// Son los que se mandaban a mano, con las cifras rellenadas desde la base:
// así no hay que contar boletos ni sumar el bote con la calculadora. Puro: entra
// lo que ya ha cargado la página y sale el texto, listo para pegar en WhatsApp
// o en Teams (texto plano con emojis, sin Markdown).
//
// El dinero sigue las MISMAS reglas que reparte la base (reglas.js, 0018): el
// pleno se lleva el premio de la semana más el bote, incluido lo que aporta
// esa misma jornada.
// ===========================================================================

import { puestoEn } from './puestos.js'

/** «45,5 €», «9 €»: como se escribe en el grupo, sin ceros de relleno. */
export const eurosCorto = (cents) => {
  const v = (cents ?? 0) / 100
  return `${v.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`
}

/** «viernes a las 18:00 h» */
export function fechaLimite(iso) {
  if (!iso) return null
  const d = new Date(iso)
  const dia = d.toLocaleDateString('es-ES', { weekday: 'long', timeZone: 'Europe/Madrid' })
  const fecha = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' })
  const hora = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })
  return `${dia} ${fecha} a las ${hora} h`
}

/**
 * El bote que había ANTES de una jornada: el saldo tras la última jornada
 * anterior que movió el bote. Los movimientos sin jornada (una cena) cuentan
 * si son anteriores por fecha.
 */
export function boteAntesDe(numero, movimientos = []) {
  const previos = movimientos
    .filter(m => m.jornada != null && m.jornada < numero)
    .sort((a, b) => a.jornada - b.jornada || String(a.fecha).localeCompare(String(b.fecha)))
  return previos.length ? previos.at(-1).saldo_cents : 0
}

/** El bote justo DESPUÉS de una jornada (el saldo tras su propio apunte). */
export function boteDespuesDe(numero, movimientos = [], actual = 0) {
  const propios = movimientos.filter(m => m.jornada === numero)
  if (!propios.length) return actual
  return propios.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha))).at(-1).saldo_cents
}

const mitad = (cents) => Math.floor(cents / 2)

// ---------------------------------------------------------------------------

/**
 * @param o.jornada   { numero, cierra_at, precio_cents }
 * @param o.bote      bote acumulado en este momento (céntimos)
 * @param o.ajustes   { papeletas, pago, formato, web }
 */
export function mensajeApertura({ jornada, bote, ajustes = {} }) {
  const precio = jornada.precio_cents ?? 100
  const limite = fechaLimite(jornada.cierra_at)
  const l = [
    `¡Nueva jornada de la quiniela interna de la oficina! ⚽💶`,
    ``,
    `Ya está todo listo para participar en la jornada ${jornada.numero}.`,
    ``,
    `👉 Bote acumulado actual: ${eurosCorto(bote)} 💰`,
    `El bote sigue creciendo, así que cada jornada hay más en juego 🔥`,
  ]
  if (ajustes.web) l.push(`🔸 Juega tu columna en la web: ${ajustes.web}`)
  if (ajustes.papeletas) l.push(`🔸 Papeletas disponibles: ${ajustes.papeletas}`)
  if (limite) l.push(`🔸 Fecha límite para participar: ${limite}`)
  l.push(`🔸 Aporte semanal: ${eurosCorto(precio)}${ajustes.pago ? ` (${ajustes.pago})` : ''}`)
  if (ajustes.formato) l.push(`🔸 Formato: ${ajustes.formato}`)
  l.push(
    ``,
    `El resto de las normas se mantienen igual:`,
    `• ${eurosCorto(mitad(precio))} de cada jugador van al premio semanal para el que más aciertos tenga.`,
    `• ${eurosCorto(precio - mitad(precio))} van al bote acumulado del Pleno al 15.`,
    `• En caso de empate, los premios se reparten.`,
    `• Si al final de temporada queda bote sin repartir, ¡lo disfrutamos en equipo! ☕🍰🍻`,
    ``,
    `¡Suerte a todos y que empiece la nueva jornada! 🏆`,
  )
  return l.join('\n')
}

/**
 * @param o.jornada   { numero, boletos, recaudacion_cents }
 * @param o.boteAntes bote acumulado antes de esta jornada
 */
export function mensajeCierre({ jornada, boteAntes }) {
  const recaudacion = jornada.recaudacion_cents ?? 0
  const premio = mitad(recaudacion)
  const alBote = recaudacion - premio
  // Lo mismo que paga la base si alguien lo acierta todo: el premio de la
  // semana, el bote que había y lo que esta jornada aporta al bote.
  const pleno = premio + boteAntes + alBote
  return [
    `🚨 ¡Se cierran las apuestas de la jornada ${jornada.numero}! 🚨`,
    ``,
    `👉 Han participado ${jornada.boletos} persona${jornada.boletos === 1 ? '' : 's'} 🎉`,
    `👉 Se juegan ${eurosCorto(premio)} como premio semanal 💶`,
    `👉 Además, hay ${eurosCorto(boteAntes)} de bote acumulado 🏆`,
    ``,
    `🔸 Si alguien lo acierta todo, Pleno al 15 incluido, se lleva ${eurosCorto(pleno)} (premio semanal + bote, con lo que aporta esta jornada).`,
    `🔸 Si nadie lo consigue, el premio semanal de ${eurosCorto(premio)} es para el que más aciertos tenga.`,
    `🔸 En caso de empate, se reparte entre los ganadores.`,
    `🔸 Y recuerda: si nadie se lleva el pleno, el bote sigue creciendo para la próxima jornada.`,
    ``,
    `⚽ ¡Mucha suerte a todos! 🍀`,
  ].join('\n')
}

/**
 * @param o.jornada     { numero, premio_cents, al_bote_cents }
 * @param o.boletos     [{ nombre, aciertos, es_ganador }]
 * @param o.botePagado  lo que salió del bote (0 si nadie hizo pleno)
 * @param o.boteDespues bote acumulado tras la jornada
 */
export function mensajeResultados({ jornada, boletos, botePagado = 0, boteDespues }) {
  const ordenados = [...boletos].sort((a, b) => b.aciertos - a.aciertos || a.nombre.localeCompare(b.nombre, 'es'))
  const todos = ordenados.map(b => b.aciertos)
  const ganadores = ordenados.filter(b => b.es_ganador)
  const minimo = Math.min(...todos)
  const ultimos = ordenados.filter(b => b.aciertos === minimo)
  const y = (xs) => xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}`
  const repartido = (jornada.premio_cents ?? 0) + botePagado

  const l = [
    `Resultados de la quiniela de esta semana! ⚽💶`,
    ``,
    `¡Ya tenemos los resultados de la jornada ${jornada.numero}! 🎉`,
    ``,
  ]
  if (botePagado > 0) {
    l.push(`💥 ¡PLENO! ${y(ganadores.map(g => g.nombre))} lo ${ganadores.length === 1 ? 'ha' : 'han'} acertado todo y se ${ganadores.length === 1 ? 'lleva' : 'llevan'} el bote. 🎆`, ``)
  }
  l.push(
    `🏆 ${ganadores.length === 1 ? 'Ganador' : 'Ganadores'} de la semana:`,
    `${y(ganadores.map(g => g.nombre))} con ${ganadores[0]?.aciertos ?? 0} aciertos. ¡Enhorabuena!`,
    ``,
  )
  if (ordenados.length > ganadores.length) {
    l.push(`😅 ${ultimos.length === 1 ? 'Último clasificado' : 'Últimos clasificados'}: ${y(ultimos.map(u => u.nombre))} con ${minimo}. ¡A por la próxima semana! 💪`, ``)
  }
  l.push(`📊 Tabla completa de resultados:`, ``)
  for (const b of ordenados) {
    const puesto = puestoEn(b.aciertos, todos)
    l.push(`${String(puesto).padStart(2, ' ')}. ${b.nombre} — ${b.aciertos}${b.es_ganador ? ' 🏆' : ''}`)
  }
  l.push(
    ``,
    `⚠️ Reclamaciones: si alguien cree que hay algún error, lo revisaremos.`,
    ``,
    `💰 Premio ${botePagado > 0 ? 'de la jornada (premio + bote)' : 'semanal'}: ${eurosCorto(repartido)} ${ganadores.length === 1 ? 'para el ganador' : `a repartir entre los ${ganadores.length} ganadores`}${ganadores.length > 1 ? ` (${eurosCorto(Math.floor(repartido / ganadores.length))} cada uno)` : ''}`,
    ``,
    `🏆 Bote acumulado: ${eurosCorto(boteDespues)}`,
    ``,
    botePagado > 0
      ? `El bote vuelve a empezar desde cero. ¡A por el siguiente pleno!`
      : `Recuerda que si alguien acierta el Pleno al 15 (con los 14), se lleva todo el bote acumulado.`,
    ``,
    `⚽ ¡Gracias a todos por participar!`,
  )
  return l.join('\n')
}
