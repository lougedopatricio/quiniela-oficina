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
const y = (xs) => xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}`
const plural = (n, uno, varios) => (n === 1 ? uno : varios)

// ---------------------------------------------------------------------------
// Para que no salga el mismo texto todas las semanas.
//
// `estilo.tono` cambia el carácter del mensaje (clásico, breve, épico) y
// `estilo.variante` rota las frases de entrada, de ánimo y de despedida. La
// rotación parte del número de jornada, así que cada semana sale distinto sin
// tocar nada, y el botón «Otra versión» suma uno. Las cifras no cambian nunca:
// solo cambia cómo se cuentan.
//
// Sin `estilo`, salen siempre las frases de siempre (las primeras de cada
// lista), que es lo que comprueban los tests.
// ---------------------------------------------------------------------------

export const TONOS = [
  { id: 'clasico', txt: 'Clásico' },
  { id: 'breve', txt: 'Breve' },
  { id: 'epico', txt: 'Épico' },
]

function eligeCon(numero, estilo) {
  if (estilo?.variante == null) return (opciones) => opciones[0]
  // Cada lista usa un salto distinto para que no cambien todas a la vez.
  let sal = 0
  return (opciones) => {
    sal += 1
    const i = ((numero ?? 0) * (sal + 2) + estilo.variante * (2 * sal + 1)) % opciones.length
    return opciones[(i + opciones.length) % opciones.length]
  }
}

// --- Curiosidades ----------------------------------------------------------

const cuentaEnQuiniela = (p) =>
  p.modo_puntuacion === 'normal' && !['aplazado', 'cancelado', 'suspendido'].includes(p.estado)
const nombrePartido = (p) => `${p.local}–${p.visitante}`
const signoEnTexto = (s) => (s === 'X' ? 'empate' : s === '1' ? '1' : '2')

/** Lo que dio que hablar una vez jugada: sorpresas, unanimidades, el que se quedó a uno. */
export function curiosidadesResultados({ partidos = [], boletos = [] }) {
  const out = []
  const conPicks = boletos.filter(b => Array.isArray(b.picks) && b.picks.length)
  const jugados = partidos.filter(p => cuentaEnQuiniela(p) && p.signo)
  if (conPicks.length >= 2 && jugados.length) {
    const aciertos = jugados.map(p => ({
      p, quienes: conPicks.filter(b => b.picks[p.orden - 1] === p.signo).map(b => b.nombre),
    }))
    const sorpresa = [...aciertos].sort((a, b) => a.quienes.length - b.quienes.length || a.p.orden - b.p.orden)[0]
    if (sorpresa.quienes.length === 0) {
      out.push(`🤯 Nadie vio venir el ${signoEnTexto(sorpresa.p.signo)} del ${nombrePartido(sorpresa.p)}.`)
    } else if (sorpresa.quienes.length === 1) {
      out.push(`🎯 Solo ${sorpresa.quienes[0]} acertó el ${signoEnTexto(sorpresa.p.signo)} del ${nombrePartido(sorpresa.p)}. ¡Ojo clínico!`)
    } else if (sorpresa.quienes.length <= conPicks.length / 4) {
      out.push(`🎯 El ${signoEnTexto(sorpresa.p.signo)} del ${nombrePartido(sorpresa.p)} solo lo vieron ${y(sorpresa.quienes)}.`)
    }
    const todos = aciertos.filter(a => a.quienes.length === conPicks.length)
    if (todos.length === 1) out.push(`🤝 El ${nombrePartido(todos[0].p)} lo acertó todo el mundo.`)
    else if (todos.length > 1) out.push(`🤝 ${todos.length} partidos los acertó todo el mundo.`)
  }
  if (boletos.length >= 2) {
    const max = Math.max(...boletos.map(b => b.aciertos))
    const aUno = boletos.filter(b => !b.es_ganador && b.aciertos === max - 1).map(b => b.nombre)
    if (aUno.length) out.push(`😬 ${y(aUno)} se ${plural(aUno.length, 'quedó', 'quedaron')} a un solo acierto del premio.`)
    const media = boletos.reduce((a, b) => a + b.aciertos, 0) / boletos.length
    out.push(`📈 Media de la oficina: ${media.toLocaleString('es-ES', { maximumFractionDigits: 1 })} aciertos.`)
  }
  return out
}

/** Cómo ha jugado la oficina, para el cierre: el partido más dividido y los de consenso. */
export function curiosidadesCierre({ partidos = [], boletos = [] }) {
  const out = []
  const conPicks = boletos.filter(b => Array.isArray(b.picks) && b.picks.length)
  const normales = partidos.filter(cuentaEnQuiniela)
  if (conPicks.length >= 2 && normales.length) {
    const reparto = normales.map(p => {
      const c = { 1: 0, X: 0, 2: 0 }
      for (const b of conPicks) if (c[b.picks[p.orden - 1]] != null) c[b.picks[p.orden - 1]] += 1
      return { p, c, max: Math.max(c[1], c.X, c[2]) }
    })
    const dividido = [...reparto].sort((a, b) => a.max - b.max || a.p.orden - b.p.orden)[0]
    if (dividido.max < conPicks.length) {
      const { c } = dividido
      out.push(`⚖️ El partido que más divide: ${nombrePartido(dividido.p)} (${c[1]} al 1, ${c.X} a la X, ${c[2]} al 2).`)
    }
    const unanimes = reparto.filter(r => r.max === conPicks.length)
    if (unanimes.length === 1) {
      const r = unanimes[0]
      const s = ['1', 'X', '2'].find(k => r.c[k] === r.max)
      out.push(`🔒 Todos van con el ${signoEnTexto(s)} en el ${nombrePartido(r.p)}.`)
    } else if (unanimes.length > 1) {
      out.push(`🔒 Hay ${unanimes.length} partidos en los que todo el mundo ha puesto lo mismo.`)
    }
  }
  const pleno = partidos.find(p => p.modo_puntuacion === 'pleno')
  if (pleno) out.push(`🎯 El Pleno al 15: ${nombrePartido(pleno)}.`)
  return out
}

// ---------------------------------------------------------------------------

/**
 * @param o.jornada   { numero, cierra_at, precio_cents }
 * @param o.bote      bote acumulado en este momento (céntimos)
 * @param o.ajustes   { papeletas, pago, formato, web }
 * @param o.partidos  (opcional) para anunciar el Pleno al 15
 * @param o.estilo    (opcional) { tono, variante }
 */
export function mensajeApertura({ jornada, bote, ajustes = {}, partidos = [], estilo }) {
  const precio = jornada.precio_cents ?? 100
  const limite = fechaLimite(jornada.cierra_at)
  const elige = eligeCon(jornada.numero, estilo)
  const tono = estilo?.tono ?? 'clasico'
  const pleno = partidos.find(p => p.modo_puntuacion === 'pleno')
  const n = jornada.numero

  if (tono === 'breve') {
    const l = [
      elige([`⚽ Jornada ${n} abierta.`, `⚽ ¡Ya se puede jugar la jornada ${n}!`, `⚽ Quiniela de la semana: jornada ${n}.`]),
      `💰 Bote: ${eurosCorto(bote)} · Aporte: ${eurosCorto(precio)}`,
    ]
    if (limite) l.push(`⏰ Hasta el ${limite}`)
    if (pleno) l.push(`🎯 Pleno: ${nombrePartido(pleno)}`)
    if (ajustes.web) l.push(`👉 ${ajustes.web}`)
    if (ajustes.papeletas) l.push(`📝 Papeletas: ${ajustes.papeletas}`)
    l.push(elige([`¡Suerte! 🍀`, `¡A por ello! 💪`, `¡Que no se os pase! ⏳`]))
    return l.join('\n')
  }

  const epico = tono === 'epico'
  const l = [
    epico
      ? elige([
          `📣 ¡Señoras y señores, rueda el balón en la jornada ${n}! ⚽🔥`,
          `🏟️ Se encienden los focos: arranca la jornada ${n} de la quiniela de la oficina.`,
          `⚔️ Nueva batalla en la oficina: la jornada ${n} está en juego.`,
        ])
      : elige([
          `¡Nueva jornada de la quiniela interna de la oficina! ⚽💶`,
          `¡Vuelve la quiniela de la oficina! ⚽💶`,
          `¡Atención, quinielistas! Arranca una nueva jornada ⚽💶`,
          `¡Ya está aquí la quiniela de esta semana! ⚽💶`,
        ]),
    ``,
    epico
      ? elige([
          `Catorce partidos, un pleno y una sola pregunta: ¿quién se va a llevar la gloria esta semana?`,
          `Las leyendas no se escriben solas: rellena tu columna y entra en la historia de la oficina.`,
          `Se buscan valientes que se atrevan con el pleno. ¿Eres tú?`,
        ])
      : elige([
          `Ya está todo listo para participar en la jornada ${n}.`,
          `Ya podéis echar vuestra columna para la jornada ${n}.`,
          `La jornada ${n} ya está abierta para jugar.`,
          `Toca rellenar la columna de la jornada ${n}.`,
        ]),
    ``,
    `👉 Bote acumulado actual: ${eurosCorto(bote)} 💰`,
    epico
      ? elige([`Y el bote no para de engordar… alguien se lo va a llevar 👀`, `Un bote así no se ve todos los días 🤑`, `Quien haga pleno se lo lleva TODO 🏆`])
      : elige([
          `El bote sigue creciendo, así que cada jornada hay más en juego 🔥`,
          `Cada semana sin pleno, el bote se hace más grande 🔥`,
          `Quien acierte el pleno se lo lleva entero 🔥`,
        ]),
  ]
  if (pleno) l.push(`🎯 El Pleno al 15 de esta semana: ${nombrePartido(pleno)}`)
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
    epico
      ? elige([`¡Que hable el fútbol! 🏆`, `¡Gloria eterna para el que más acierte! 🏆`, `¡A jugar, que el bote no se gana solo! 🏆`])
      : elige([
          `¡Suerte a todos y que empiece la nueva jornada! 🏆`,
          `¡Mucha suerte a todos! 🍀`,
          `¡A por el pleno! 🏆`,
          `¡Que gane el mejor! 🏆`,
        ]),
  )
  return l.join('\n')
}

/**
 * @param o.jornada   { numero, boletos, recaudacion_cents }
 * @param o.boteAntes bote acumulado antes de esta jornada
 * @param o.partidos, o.columnas  (opcionales) para las curiosidades
 * @param o.estilo    (opcional) { tono, variante, curiosidades }
 */
export function mensajeCierre({ jornada, boteAntes, partidos = [], columnas = [], estilo }) {
  const recaudacion = jornada.recaudacion_cents ?? 0
  const premio = mitad(recaudacion)
  const alBote = recaudacion - premio
  // Lo mismo que paga la base si alguien lo acierta todo: el premio de la
  // semana, el bote que había y lo que esta jornada aporta al bote.
  const pleno = premio + boteAntes + alBote
  const elige = eligeCon(jornada.numero, estilo)
  const tono = estilo?.tono ?? 'clasico'
  const n = jornada.numero
  const personas = `${jornada.boletos} persona${jornada.boletos === 1 ? '' : 's'}`
  const extra = estilo?.curiosidades === false ? [] : curiosidadesCierre({ partidos, boletos: columnas })

  if (tono === 'breve') {
    const l = [
      elige([`🔒 Cerrada la jornada ${n}.`, `🔒 No va más: jornada ${n} cerrada.`, `🔒 Jornada ${n}: apuestas cerradas.`]),
      `👥 ${personas} · 💶 ${eurosCorto(premio)} de premio · 💰 Pleno: ${eurosCorto(pleno)}`,
      ...extra,
      elige([`¡Suerte! 🍀`, `¡A sufrir! ⚽`, `¡Que ruede el balón! ⚽`]),
    ]
    return l.join('\n')
  }

  const epico = tono === 'epico'
  const l = [
    epico
      ? elige([`🚨 ¡NO VA MÁS! La jornada ${n} queda sellada 🚨`, `🔔 Suena la campana: se cierran las apuestas de la jornada ${n}.`, `🚨 Las columnas están echadas: jornada ${n} cerrada 🚨`])
      : elige([`🚨 ¡Se cierran las apuestas de la jornada ${n}! 🚨`, `🔒 Jornada ${n} cerrada: ya no se admiten columnas.`, `⏰ ¡Tiempo! Se cierra la jornada ${n}.`]),
    ``,
    `👉 Han participado ${personas} 🎉`,
    `👉 Se juegan ${eurosCorto(premio)} como premio semanal 💶`,
    `👉 Además, hay ${eurosCorto(boteAntes)} de bote acumulado 🏆`,
    ``,
    `🔸 Si alguien lo acierta todo, Pleno al 15 incluido, se lleva ${eurosCorto(pleno)} (premio semanal + bote, con lo que aporta esta jornada).`,
    `🔸 Si nadie lo consigue, el premio semanal de ${eurosCorto(premio)} es para el que más aciertos tenga.`,
    `🔸 En caso de empate, se reparte entre los ganadores.`,
    `🔸 Y recuerda: si nadie se lleva el pleno, el bote sigue creciendo para la próxima jornada.`,
  ]
  if (extra.length) l.push(``, epico ? `📊 Así llega la oficina al fin de semana:` : `📊 Cómo ha jugado la oficina:`, ...extra)
  l.push(
    ``,
    epico
      ? elige([`⚽ Que los dioses del fútbol repartan suerte. 🍀`, `⚽ Ahora, a sufrir con cada gol. 🍿`, `⚽ El balón tiene la última palabra. 🍀`])
      : elige([`⚽ ¡Mucha suerte a todos! 🍀`, `⚽ ¡Que ruede el balón! 🍀`, `⚽ ¡A disfrutar de los partidos! 🍿`]),
  )
  return l.join('\n')
}

/**
 * @param o.jornada     { numero, premio_cents, al_bote_cents }
 * @param o.boletos     [{ nombre, aciertos, es_ganador, picks? }]
 * @param o.botePagado  lo que salió del bote (0 si nadie hizo pleno)
 * @param o.boteDespues bote acumulado tras la jornada
 * @param o.partidos    (opcional) para las curiosidades
 * @param o.estilo      (opcional) { tono, variante, curiosidades, tabla }
 */
export function mensajeResultados({ jornada, boletos, botePagado = 0, boteDespues, partidos = [], estilo }) {
  const ordenados = [...boletos].sort((a, b) => b.aciertos - a.aciertos || a.nombre.localeCompare(b.nombre, 'es'))
  const todos = ordenados.map(b => b.aciertos)
  const ganadores = ordenados.filter(b => b.es_ganador)
  const minimo = Math.min(...todos)
  const ultimos = ordenados.filter(b => b.aciertos === minimo)
  const repartido = (jornada.premio_cents ?? 0) + botePagado
  const elige = eligeCon(jornada.numero, estilo)
  const tono = estilo?.tono ?? 'clasico'
  const n = jornada.numero
  const nombresG = y(ganadores.map(g => g.nombre))
  const aciertosG = ganadores[0]?.aciertos ?? 0
  const extra = estilo?.curiosidades === false ? [] : curiosidadesResultados({ partidos, boletos: ordenados })
  const conTabla = estilo?.tabla !== false
  const premioTxt = `${eurosCorto(repartido)} ${ganadores.length === 1 ? 'para el ganador' : `a repartir entre los ${ganadores.length} ganadores`}${ganadores.length > 1 ? ` (${eurosCorto(Math.floor(repartido / ganadores.length))} cada uno)` : ''}`

  if (tono === 'breve') {
    const l = [
      elige([`🏁 Jornada ${n} terminada.`, `🏁 Resultados de la jornada ${n}.`, `🏁 Así ha quedado la jornada ${n}.`]),
    ]
    if (botePagado > 0) l.push(`💥 ¡PLENO de ${nombresG}!`)
    l.push(
      `🏆 ${nombresG} (${aciertosG}) · ${premioTxt}`,
      `💰 Bote: ${eurosCorto(boteDespues)}`,
      ...extra.slice(0, 2),
    )
    if (conTabla) l.push(``, ...ordenados.map(b => `${puestoEn(b.aciertos, todos)}. ${b.nombre} — ${b.aciertos}${b.es_ganador ? ' 🏆' : ''}`))
    return l.join('\n')
  }

  const epico = tono === 'epico'
  const l = [
    epico
      ? elige([`🎙️ ¡Final del partido en la oficina! Resultados de la jornada ${n} ⚽`, `📰 Última hora: ya hay veredicto en la jornada ${n} ⚽`, `🏟️ Se apagan los focos de la jornada ${n} ⚽`])
      : elige([`Resultados de la quiniela de esta semana! ⚽💶`, `¡Ya está aquí el resumen de la quiniela! ⚽💶`, `Así ha ido la quiniela de esta semana ⚽💶`]),
    ``,
    epico
      ? elige([`Hubo nervios, hubo goles y hubo quien miró el móvil cada cinco minutos. Esto es lo que pasó:`, `La jornada ${n} ya es historia. Repasamos quién brilló y quién… bueno, quién lo intentó.`, `Pasen y vean el veredicto de la jornada ${n}:`])
      : elige([`¡Ya tenemos los resultados de la jornada ${n}! 🎉`, `La jornada ${n} ya tiene ganador 🎉`, `Cerramos la jornada ${n} con estos resultados 🎉`]),
    ``,
  ]
  if (botePagado > 0) {
    l.push(`💥 ¡PLENO! ${nombresG} lo ${ganadores.length === 1 ? 'ha' : 'han'} acertado todo y se ${ganadores.length === 1 ? 'lleva' : 'llevan'} el bote. 🎆`, ``)
  }
  l.push(
    `🏆 ${ganadores.length === 1 ? 'Ganador' : 'Ganadores'} de la semana:`,
    `${nombresG} con ${aciertosG} aciertos. ${epico ? elige(['¡Leyenda!', '¡Qué olfato!', '¡Chapó!']) : elige(['¡Enhorabuena!', '¡Bien jugado!', '¡Felicidades!'])}`,
    ``,
  )
  if (ordenados.length > ganadores.length) {
    l.push(`😅 ${ultimos.length === 1 ? 'Último clasificado' : 'Últimos clasificados'}: ${y(ultimos.map(u => u.nombre))} con ${minimo}. ${elige(['¡A por la próxima semana! 💪', '¡La próxima es la buena! 💪', '¡Lo importante es participar! 😉'])}`, ``)
  }
  if (extra.length) l.push(epico ? `🗞️ Lo que nos deja la jornada:` : `🔎 Curiosidades de la jornada:`, ...extra, ``)
  if (conTabla) {
    l.push(`📊 Tabla completa de resultados:`, ``)
    for (const b of ordenados) {
      const puesto = puestoEn(b.aciertos, todos)
      l.push(`${String(puesto).padStart(2, ' ')}. ${b.nombre} — ${b.aciertos}${b.es_ganador ? ' 🏆' : ''}`)
    }
    l.push(``)
  }
  l.push(
    `⚠️ Reclamaciones: si alguien cree que hay algún error, lo revisaremos.`,
    ``,
    `💰 Premio ${botePagado > 0 ? 'de la jornada (premio + bote)' : 'semanal'}: ${premioTxt}`,
    ``,
    `🏆 Bote acumulado: ${eurosCorto(boteDespues)}`,
    ``,
    botePagado > 0
      ? `El bote vuelve a empezar desde cero. ¡A por el siguiente pleno!`
      : `Recuerda que si alguien acierta el Pleno al 15 (con los 14), se lleva todo el bote acumulado.`,
    ``,
    elige([`⚽ ¡Gracias a todos por participar!`, `⚽ ¡Nos vemos en la próxima jornada!`, `⚽ ¡Gracias por jugar y hasta la semana que viene!`]),
  )
  return l.join('\n')
}
