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

/** `"2 - 1"` → `{ local: 2, visitante: 1 }`. Devuelve nulos si aún no hay marcador. */
export function parsearMarcador(v) {
  const m = String(v ?? '').match(/^\s*(\d+)\s*-\s*(\d+)\s*$/)
  if (!m) return { local: null, visitante: null }
  return { local: Number(m[1]), visitante: Number(m[2]) }
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
      local: String(p.local ?? '').trim(),
      visitante: String(p.visitante ?? '').trim(),
      lae_id_local: p.idLocal ?? null,
      lae_id_visitante: p.idVisitante ?? null,
      kickoff_at: fechaMadrid(p.fecha_completa),
      goles_local: local,
      goles_visitante: visitante,
      // El partido 15 es el Pleno al 15: su "signo" no es 1/X/2 y no puntúa.
      signo: orden <= 14 ? limpiarSigno(p.signo) : null,
      estado: local === null ? 'pendiente' : 'finalizado',
    }
  })

  return {
    lae_id_sorteo: String(raw.id_sorteo),
    lae_jornada: raw.numero != null ? Number(raw.numero) : null,
    fecha_sorteo: fechaMadrid(raw.fecha_sorteo),
    // Datos de la quiniela nacional. No son nuestro bote, pero quedan bien en
    // la ficha de la jornada.
    lae_bote_cents: raw.premio_bote != null ? Math.round(Number(raw.premio_bote) * 100) : null,
    partidos,
    completa: partidos.filter(p => p.orden <= 14 && p.signo).length === 14,
  }
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

export const URLS = {
  celebrados: (desde, hasta) =>
    `https://www.loteriasyapuestas.es/servicios/buscadorSorteos?game_id=LAQU&celebrados=true` +
    `&fechaInicioInclusiva=${desde}&fechaFinInclusiva=${hasta}`,
  proximos: (n = 3) =>
    `https://www.loteriasyapuestas.es/servicios/proximosv3?game_id=LAQU&num=${n}`,
}

/** `AAAAMMDD`, que es el formato que espera el buscador de LAE. */
export function comoAAAAMMDD(d) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}
