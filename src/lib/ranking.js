// ===========================================================================
// Estadísticas de cada participante para la página de Ranking.
//
// Puro: entran las jornadas finalizadas con sus partidos y sus boletos, salen
// las cifras de cada uno. Sin red, para poder probarlo y para que el modo demo
// y la base real pasen por el mismo cálculo.
//
// Los AGREGADOS que deciden dinero (aciertos de cada jornada, quién ganó) no
// se recalculan aquí: vienen de round_scores, que es lo que liquidó la base.
// Lo de aquí son lecturas partido a partido —qué porcentaje acierta cada uno,
// cómo le va con los empates…— que la base no guarda.
// ===========================================================================

const golesAPleno = (g) => (g == null ? null : g >= 3 ? 'M' : String(g))

/** ¿Este partido cuenta por signo? (Los normales; el pleno se mira aparte.) */
const puntuaPorSigno = (m) => m.modo_puntuacion !== 'no_puntua' && m.modo_puntuacion !== 'pleno' && !!m.signo

function aciertaPleno(m, b) {
  if (m.exige_resultado) {
    return m.goles_local != null && m.goles_visitante != null &&
      b.pleno_local === golesAPleno(m.goles_local) && b.pleno_visitante === golesAPleno(m.goles_visitante)
  }
  return !!m.signo && b.picks?.[m.orden - 1] === m.signo
}

const pct = (a, n) => (n ? a / n : null)

/**
 * @param jornadas  [{ id, numero, partidos: [match], boletos: [{ player_id, picks, pleno_local?, pleno_visitante?, aciertos, es_ganador }] }]
 * @param jugadores [{ id, nombre, avatar_url }]  ya con el nombre que se enseña
 * @returns {{ filas: Array, jornadas: Array<{id, numero}> }}
 */
export function calcularRanking(jornadas, jugadores) {
  const orden = [...jornadas].sort((a, b) => a.numero - b.numero)
  const por = new Map(jugadores.map(j => [j.id, {
    player_id: j.id, nombre: j.nombre, avatar_url: j.avatar_url ?? null,
    jornadas: 0, aciertos: 0, victorias: 0, mejor: 0,
    partidos: 0, acertados: 0,
    plenosJugados: 0, plenos: 0,
    res: { '1': [0, 0], X: [0, 0], '2': [0, 0] },   // [acertados, partidos] por resultado
    valientes: 0,
    serie: [],                                       // acumulado jornada a jornada
    porJornada: [],                                  // aciertos de cada jornada (null si no jugó)
  }]))

  for (const j of orden) {
    const partidos = (j.partidos ?? []).filter(puntuaPorSigno)
    const pleno = (j.partidos ?? []).find(m => m.modo_puntuacion === 'pleno')
    const boletos = j.boletos ?? []

    // Cuánta gente puso cada signo en cada partido: «a contracorriente» es
    // acertar un signo que no llegó a poner ni un tercio de la oficina.
    const votos = new Map(partidos.map(m => [m.orden, { '1': 0, X: 0, '2': 0 }]))
    for (const b of boletos) for (const m of partidos) {
      const s = b.picks?.[m.orden - 1]
      if (votos.get(m.orden)[s] != null) votos.get(m.orden)[s]++
    }

    const jugaron = new Set()
    for (const b of boletos) {
      const e = por.get(b.player_id)
      if (!e) continue
      jugaron.add(b.player_id)
      e.jornadas++
      e.aciertos += b.aciertos ?? 0
      e.mejor = Math.max(e.mejor, b.aciertos ?? 0)
      if (b.es_ganador) e.victorias++
      e.porJornada.push(b.aciertos ?? 0)

      for (const m of partidos) {
        const ok = b.picks?.[m.orden - 1] === m.signo
        e.partidos++
        e.res[m.signo][1]++
        if (ok) {
          e.acertados++
          e.res[m.signo][0]++
          if (boletos.length >= 3 && votos.get(m.orden)[m.signo] / boletos.length < 1 / 3) e.valientes++
        }
      }
      if (pleno && (pleno.signo || pleno.goles_local != null)) {
        e.plenosJugados++
        if (aciertaPleno(pleno, b)) e.plenos++
      }
    }
    for (const e of por.values()) {
      if (!jugaron.has(e.player_id)) e.porJornada.push(null)
      e.serie.push(e.aciertos)
    }
  }

  const filas = [...por.values()]
    .filter(e => e.jornadas > 0)
    .map(e => ({
      ...e,
      media: e.aciertos / e.jornadas,
      pctAcierto: pct(e.acertados, e.partidos),
      pctLocal: pct(...e.res['1']),
      pctEmpate: pct(...e.res.X),
      pctVisitante: pct(...e.res['2']),
      pctPleno: pct(e.plenos, e.plenosJugados),
    }))

  return { filas, jornadas: orden.map(j => ({ id: j.id, numero: j.numero })) }
}

/**
 * Los criterios por los que se puede ordenar. `valor` saca la cifra; `fmt`
 * cómo se enseña. Todos de mayor a menor: más es mejor en todos.
 */
export const CRITERIOS = [
  { id: 'aciertos',     txt: 'Aciertos',          corto: 'Aciertos', valor: f => f.aciertos,     fmt: 'entero', nota: 'Aciertos de todas las jornadas, como en la general' },
  { id: 'media',        txt: 'Media por jornada', corto: 'Media',    valor: f => f.media,        fmt: 'decimal' },
  { id: 'pctAcierto',   txt: '% de acierto',      corto: '% acierto', valor: f => f.pctAcierto,  fmt: 'pct', nota: 'De cada 100 partidos que ha jugado, cuántos acierta' },
  { id: 'victorias',    txt: 'Jornadas ganadas',  corto: 'Ganadas',  valor: f => f.victorias,    fmt: 'entero' },
  { id: 'mejor',        txt: 'Mejor jornada',     corto: 'Mejor',    valor: f => f.mejor,        fmt: 'entero' },
  { id: 'pctLocal',     txt: 'Acierto cuando gana el local',     corto: 'Local (1)',     valor: f => f.pctLocal,     fmt: 'pct' },
  { id: 'pctEmpate',    txt: 'Acierto cuando hay empate',        corto: 'Empate (X)',    valor: f => f.pctEmpate,    fmt: 'pct' },
  { id: 'pctVisitante', txt: 'Acierto cuando gana el visitante', corto: 'Visitante (2)', valor: f => f.pctVisitante, fmt: 'pct' },
  { id: 'plenos',       txt: 'Plenos al 15 acertados', corto: 'Plenos',  valor: f => f.plenos,       fmt: 'entero' },
  { id: 'valientes',    txt: 'Aciertos a contracorriente', corto: 'Valiente', valor: f => f.valientes, fmt: 'entero', nota: 'Signos acertados que no puso ni un tercio de la oficina' },
  { id: 'jornadas',     txt: 'Jornadas jugadas',  corto: 'Jugadas',  valor: f => f.jornadas,     fmt: 'entero' },
]

/** Ordena por un criterio; a igualdad, manda la general (aciertos y luego jornadas ganadas). */
export function ordenarPor(filas, criterioId, ascendente = false) {
  const c = CRITERIOS.find(x => x.id === criterioId) ?? CRITERIOS[0]
  const v = (f) => c.valor(f) ?? -Infinity
  return [...filas].sort((a, b) =>
    (ascendente ? v(a) - v(b) : v(b) - v(a)) ||
    b.aciertos - a.aciertos || b.victorias - a.victorias || a.nombre.localeCompare(b.nombre, 'es'))
}
