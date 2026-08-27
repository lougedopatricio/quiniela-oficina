// ===========================================================================
// Normalización de los datos de Loterías y Apuestas del Estado.
//
// Todo lo de este archivo es puro: entra el JSON tal cual lo devuelve LAE y
// sale nuestro modelo. Sin red y sin base de datos, para poder testearlo con
// payloads reales guardados. La parte que sí toca el mundo está en sync-lae.mjs
// ===========================================================================

const SIGNOS = new Set(['1', 'X', '2'])

/** LAE manda los signos con espacios de relleno: `"X "`, `"1 "`. */
export function limpiarSigno(v) {
  const s = String(v ?? '').trim().toUpperCase()
  return SIGNOS.has(s) ? s : null
}

/**
 * Quita el sufijo de categoría que LAE empezó a poner en agosto de 2026:
 * "Athletic Club (m)", "Sevilla (m)". Comprobado el 2026-08-27 contra el
 * endpoint real — el fixture de abril todavía no lo trae, y los dos tienen
 * que seguir funcionando.
 *
 * El "(m)" es ruido: la quiniela es fútbol masculino y lo lleva TODO equipo
 * español (los extranjeros de las quinielas de verano no lo llevan). Un "(f)"
 * sí distinguiría un partido de verdad distinto, así que ese se respeta.
 *
 * Importa más de lo que parece: con el sufijo pegado, el nombre deja de casar
 * con la tabla de equipos y ningún escudo se resuelve.
 */
export function limpiarNombreEquipo(nombre) {
  return String(nombre ?? '').replace(/\s*\(m\)\s*$/i, '').trim()
}

/** `"2 - 1"` → `{ local: 2, visitante: 1 }`. Devuelve nulos si aún no hay marcador. */
export function parsearMarcador(v) {
  const m = String(v ?? '').match(/^\s*(\d+)\s*-\s*(\d+)\s*$/)
  if (!m) return { local: null, visitante: null }
  return { local: Number(m[1]), visitante: Number(m[2]) }
}

/**
 * El signo que implica un marcador. `null` si todavía no hay resultado.
 *
 * Es lo que alimenta `matches.signo_provisional`, el que mueve la
 * clasificación en vivo. NUNCA se escribe en `signo`: ese es el oficial de
 * LAE, el único que puntúa y reparte dinero, y no se deduce — se espera a que
 * lo publiquen.
 */
export function signoDeMarcador(golesLocal, golesVisitante) {
  if (golesLocal == null || golesVisitante == null) return null
  if (golesLocal > golesVisitante) return '1'
  if (golesLocal < golesVisitante) return '2'
  return 'X'
}

/**
 * LAE emite fechas sin zona (`"2026-04-24 21:00:00"`) que son hora peninsular
 * española. Interpretarlas como UTC desplazaría todos los horarios una o dos
 * horas, así que se convierten explícitamente.
 */
export function fechaMadrid(v) {
  if (!v) return null
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/)
  if (!m) return null
  const [, a, mes, d, h, min, s] = m.map(Number)
  // Se prueba con los dos desfases posibles de España y se queda el que, al
  // formatearlo de vuelta en Europe/Madrid, reproduce la hora original. Así
  // el cambio de horario de verano sale bien sin depender de librerías.
  for (const offset of [1, 2]) {
    const cand = new Date(Date.UTC(a, mes - 1, d, h - offset, min, s))
    const fmt = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Madrid', hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).format(cand).replace(' ', 'T')
    if (fmt === `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`) return cand.toISOString()
  }
  return new Date(Date.UTC(a, mes - 1, d, h - 1, min, s)).toISOString()
}

/**
 * Un sorteo ya celebrado de `buscadorSorteos`.
 * Devuelve la jornada y sus 15 partidos con los signos oficiales.
 */
export function normalizarSorteo(raw) {
  const partidos = (raw.partidos ?? []).map(p => {
    const { local, visitante } = parsearMarcador(p.marcador)
    const orden = Number(p.posicion)
    return {
      orden,
      local: limpiarNombreEquipo(p.local),
      visitante: limpiarNombreEquipo(p.visitante),
      lae_id_local: p.idLocal ?? null,
      lae_id_visitante: p.idVisitante ?? null,
      kickoff_at: fechaMadrid(p.fecha_completa),
      goles_local: local,
      goles_visitante: visitante,
      // El partido 15 es el Pleno al 15: su "signo" no es 1/X/2 y no puntúa.
      signo: orden <= 14 ? limpiarSigno(p.signo) : null,
      // Deducido del marcador, para la clasificación en vivo. Va aparte del
      // oficial a propósito: hay un rato —a veces horas— en el que el partido
      // ya ha terminado y LAE todavía no ha publicado el escrutinio.
      signo_provisional: orden <= 14 ? signoDeMarcador(local, visitante) : null,
      estado: local === null ? 'pendiente' : 'finalizado',
    }
  })

  return {
    lae_id_sorteo: String(raw.id_sorteo),
    // `jornada` es la de liga (2, 3...) y `numero` la del sorteo dentro del año
    // (47, 48...). Son cosas distintas y este campo es el mismo que rellena
    // normalizarProximo() leyendo `jornada`, así que se prefiere esa: si no,
    // dos jornadas seguidas quedaban guardadas como 47 y 3 según por qué
    // camino hubieran entrado. `jornada` no existía en abril de 2026 —llega
    // además como texto—, de ahí el respaldo en `numero`.
    lae_jornada: raw.jornada != null ? Number(raw.jornada)
               : raw.numero != null ? Number(raw.numero)
               : null,
    fecha_sorteo: fechaMadrid(raw.fecha_sorteo),
    // Datos de la quiniela nacional. No son nuestro bote, pero quedan bien en
    // la ficha de la jornada.
    lae_bote_cents: raw.premio_bote != null ? Math.round(Number(raw.premio_bote) * 100) : null,
    partidos,
    completa: partidos.filter(p => p.orden <= 14 && p.signo).length === 14,
  }
}

/**
 * Los 15 partidos de la jornada ABIERTA, raspados de la página donde se juega.
 *
 * Ningún servicio JSON los publica: `buscadorSorteos` solo devuelve celebradas
 * y con `celebrados=false` responde 406. La única fuente es el DOM de
 * `PAGINAS.apuesta`, donde cada partido es un `.nombre-partido-completo` con
 * el texto "Local (M) - Visitante (M)".
 *
 * Entra la lista de cadenas ya extraída del DOM —así esto sigue siendo puro y
 * se puede probar— y sale la misma forma que `normalizarSorteo`, para que el
 * resto del código no tenga que saber de dónde vino.
 *
 * Ojo con el sufijo: la jornada 3 de 2026-2027 traía CUATRO partidos
 * femeninos, así que el "(F)" no es teórico y hay que conservarlo o
 * "Real Madrid - Málaga" y "Real Madrid - At. Madrid" se vuelven
 * indistinguibles.
 */
export function partidosDeJornadaAbierta(textos = []) {
  return textos.map((t, i) => {
    const limpio = String(t ?? '').replace(/\s+/g, ' ').trim()
    // El guión separador puede venir como "-", "–" o "vs".
    const partes = limpio.split(/\s+(?:-|–|vs\.?)\s+/i)
    return {
      orden: i + 1,
      local: limpiarNombreEquipo(partes[0] ?? ''),
      visitante: limpiarNombreEquipo(partes[1] ?? ''),
      completo: partes.length === 2 && !!partes[0]?.trim() && !!partes[1]?.trim(),
    }
  })
}

/** Una jornada futura de `proximosv3`: de aquí salen los plazos. */
export function normalizarProximo(raw) {
  return {
    lae_id_sorteo: String(raw.id_sorteo),
    lae_jornada: raw.jornada != null ? Number(raw.jornada) : null,
    abre_at: fechaMadrid(raw.apertura),
    cierra_at: fechaMadrid(raw.cierre),
    lae_estado: raw.estado ?? null,
    fecha_sorteo: fechaMadrid(raw.fecha),
  }
}

// Páginas del sitio, no servicios. Hace falta estar EN una de ellas para que
// el fetch a /servicios salga del propio origen.
//
// `/es/quiniela` —la que se usaba— devuelve 404 desde algún momento antes del
// 2026-08-27: responde una página vacía con el título sin resolver
// ("... - {1}"). Los fetch seguían saliendo porque el origen es el mismo y a
// Akamai le da igual que la página sea un 404, pero el enlace que se le
// enseñaba al administrador no llevaba a ninguna parte.
export const PAGINAS = {
  // Resultados oficiales. 200 y con contenido de verdad, comprobado.
  resultados: 'https://www.loteriasyapuestas.es/es/resultados/quiniela',
  // Donde se juega. Es el único sitio donde están los 15 partidos de la
  // jornada ABIERTA, que ningún servicio JSON publica. Ojo: subdominio
  // distinto (juegos.), así que no comparte origen con los /servicios.
  apuesta: 'https://juegos.loteriasyapuestas.es/jugar/la-quiniela/apuesta/',
}

export const URLS = {
  celebrados: (desde, hasta) =>
    `https://www.loteriasyapuestas.es/servicios/buscadorSorteos?game_id=LAQU&celebrados=true` +
    `&fechaInicioInclusiva=${desde}&fechaFinInclusiva=${hasta}`,
  // `game_id=LAQU` en este endpoint se anotó como 406 permanente el
  // 2026-08-16. Midiéndolo el 2026-08-27 resultó ser otra cosa: LAQU respondió
  // 200 al principio de la sesión y 406 al cabo de un rato, y para entonces
  // /buscadorSorteos daba 406 TAMBIÉN con la llamada que había funcionado diez
  // minutos antes. O sea: el 406 es Akamai estrangulando por volumen, no un
  // problema del game_id.
  //
  // Se mantiene `TODOS` igualmente —es lo que hay probado en producción— pero
  // conviene saber que el 406 va a volver de vez en cuando pase lo que pase, y
  // que la respuesta correcta es reintentar más tarde, no cambiar el
  // parámetro. Devuelve todos los productos mezclados: hay que filtrar
  // `game_id === 'LAQU'` en quien consuma la respuesta.
  proximos: (n = 3) =>
    `https://www.loteriasyapuestas.es/servicios/proximosv3?game_id=TODOS&num=${n}`,
}

/**
 * true si la fecha cae en sábado o domingo. Las jornadas normales de Liga se
 * juegan en fin de semana; las quinielas intersemanales de Champions/Europa
 * caen en día laborable. Esta app solo sigue la jornada de Liga, así que
 * cualquier sorteo entre semana se descarta antes de crear nada.
 */
export function esFinDeSemana(fechaIso) {
  if (!fechaIso) return true   // sin fecha todavía: se deja pasar y se filtra cuando LAE la publique
  const dia = new Date(fechaIso).getUTCDay()
  return dia === 0 || dia === 6
}

/** `AAAAMMDD`, que es el formato que espera el buscador de LAE. */
export function comoAAAAMMDD(d) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}
