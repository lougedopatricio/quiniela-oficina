// ===========================================================================
// Única puerta de acceso a datos. Las pantallas no saben si detrás hay
// Supabase o el modo demo: piden lo mismo y reciben la misma forma.
// ===========================================================================

import { supabase, MODO_DEMO } from './supabase.js'
import { DEMO, jugadorDemo } from './demo.js'

const ok = (data) => Promise.resolve(data)

function lanzar({ data, error }) {
  if (error) throw new Error(error.message)
  return data
}

// ---------------------------------------------------------------------------
// Temporada
// ---------------------------------------------------------------------------
export async function getTemporada() {
  if (MODO_DEMO) return ok(DEMO.season)
  return lanzar(await supabase.from('seasons').select('*').eq('activa', true).maybeSingle())
}

// ---------------------------------------------------------------------------
// Clasificación acumulada
// ---------------------------------------------------------------------------
export async function getClasificacion(seasonId) {
  if (MODO_DEMO) {
    const acc = new Map()
    for (const r of DEMO.rounds) {
      if (r.estado !== 'finalizada') continue
      for (const b of r.boletos) {
        const e = acc.get(b.player_id) ?? { aciertos_total: 0, jornadas_jugadas: 0, mejor_jornada: 0, victorias: 0 }
        e.aciertos_total += b.aciertos
        e.jornadas_jugadas += 1
        e.mejor_jornada = Math.max(e.mejor_jornada, b.aciertos)
        if (b.es_ganador) e.victorias += 1
        acc.set(b.player_id, e)
      }
    }
    return ok(
      DEMO.jugadores
        .filter(j => acc.has(j.id))
        .map(j => {
          const e = acc.get(j.id)
          return { player_id: j.id, nombre: j.nombre, alias: j.alias, ...e,
                   media_aciertos: +(e.aciertos_total / e.jornadas_jugadas).toFixed(2) }
        })
        .sort(ordenClasificacion)
    )
  }

  const filas = lanzar(
    await supabase.from('v_clasificacion_temporada').select('*').eq('season_id', seasonId)
  )
  return [...filas].sort(ordenClasificacion)
}

// Empate a aciertos: manda quien más jornadas ha ganado, y luego la media.
const ordenClasificacion = (a, b) =>
  b.aciertos_total - a.aciertos_total ||
  b.victorias - a.victorias ||
  b.media_aciertos - a.media_aciertos

// ---------------------------------------------------------------------------
// Jornadas
// ---------------------------------------------------------------------------
export async function getJornadas(seasonId) {
  if (MODO_DEMO) {
    return ok(DEMO.rounds.map(r => ({
      round_id: r.id, numero: r.numero, estado: r.estado, es_especial: r.es_especial,
      cierra_at: r.cierra_at, precio_cents: r.precio_cents,
      boletos: r.boletos.length,
      recaudacion_cents: r.liquidacion?.recaudacion ?? r.boletos.length * r.precio_cents,
      premio_cents: r.liquidacion?.premio ?? 0,
      al_bote_cents: r.liquidacion?.alBote ?? 0,
      mejor_puntuacion: Math.max(...r.boletos.map(b => b.aciertos)),
    })).sort((a, b) => b.numero - a.numero))
  }

  const filas = lanzar(
    await supabase.from('v_jornada_resumen').select('*').eq('season_id', seasonId)
  )
  return [...filas].sort((a, b) => b.numero - a.numero)
}

export async function getJornada(roundId) {
  if (MODO_DEMO) {
    const r = DEMO.rounds.find(x => x.id === roundId) ?? DEMO.rounds.at(-1)
    const porId = Object.fromEntries(DEMO.jugadores.map(j => [j.id, j]))
    return ok({
      round: { id: r.id, numero: r.numero, estado: r.estado, es_especial: r.es_especial,
               cierra_at: r.cierra_at, precio_cents: r.precio_cents },
      partidos: r.partidos,
      boletos: r.boletos
        .map(b => ({ ...b, nombre: porId[b.player_id].nombre, alias: porId[b.player_id].alias }))
        .sort((a, b) => b.aciertos - a.aciertos),
      resumen: {
        boletos: r.boletos.length,
        recaudacion_cents: r.boletos.length * r.precio_cents,
        premio_cents: r.liquidacion?.premio ?? 0,
        al_bote_cents: r.liquidacion?.alBote ?? 0,
        bote_pagado_cents: r.liquidacion?.botePagado ?? 0,
      },
    })
  }

  const [round, partidos, boletos] = await Promise.all([
    supabase.from('v_rounds_precio').select('*').eq('id', roundId).single().then(lanzar),
    supabase.from('matches').select('*').eq('round_id', roundId).order('orden').then(lanzar),
    supabase.from('bets')
      .select('player_id, picks, players(nombre, alias), round_scores(aciertos, aciertos_provisional, es_ganador)')
      .eq('round_id', roundId).then(lanzar),
  ])
  const resumen = lanzar(
    await supabase.from('v_jornada_resumen').select('*').eq('round_id', roundId).maybeSingle()
  )

  return {
    round,
    partidos,
    boletos: boletos
      .map(b => ({
        player_id: b.player_id,
        picks: b.picks,
        nombre: b.players?.nombre ?? '—',
        alias: b.players?.alias ?? '',
        aciertos: b.round_scores?.[0]?.aciertos ?? 0,
        es_ganador: b.round_scores?.[0]?.es_ganador ?? false,
        provisional: round.estado === 'en_juego',
      }))
      .sort((a, b) => b.aciertos - a.aciertos),
    resumen: resumen ?? {},
  }
}

// ---------------------------------------------------------------------------
// Bote
// ---------------------------------------------------------------------------
export async function getBote(seasonId) {
  if (MODO_DEMO) {
    return ok({ actual_cents: DEMO.boteActual, movimientos: DEMO.movimientosBote })
  }
  const [actual, movimientos] = await Promise.all([
    supabase.from('v_bote_actual').select('*').eq('season_id', seasonId).maybeSingle().then(lanzar),
    supabase.from('v_bote_evolucion').select('*').eq('season_id', seasonId).order('fecha').then(lanzar),
  ])
  return { actual_cents: actual?.saldo_cents ?? 0, movimientos }
}

// ---------------------------------------------------------------------------
// Saldos y perfil
// ---------------------------------------------------------------------------
export async function getSaldos() {
  if (MODO_DEMO) {
    return ok(DEMO.jugadores.map(j => {
      const suyos = DEMO.ledger.filter(l => l.player_id === j.id)
      const suma = (t) => suyos.filter(l => l.tipo === t).reduce((a, l) => a + l.importe_cents, 0)
      return {
        player_id: j.id, nombre: j.nombre, alias: j.alias,
        saldo_cents: suyos.reduce((a, l) => a + l.importe_cents, 0),
        cuotas_cents: -suma('cuota'), premios_cents: suma('premio'), pagado_cents: suma('pago'),
      }
    }).sort((a, b) => a.saldo_cents - b.saldo_cents))
  }
  const filas = lanzar(await supabase.from('v_saldos').select('*'))
  return [...filas].sort((a, b) => a.saldo_cents - b.saldo_cents)
}

export async function getPerfil(playerId) {
  if (MODO_DEMO) {
    const j = DEMO.jugadores.find(x => x.id === playerId) ?? jugadorDemo
    const historial = DEMO.rounds
      .map(r => {
        const b = r.boletos.find(x => x.player_id === j.id)
        if (!b) return null
        const orden = [...r.boletos].sort((a, c) => c.aciertos - a.aciertos)
        return {
          round_id: r.id, jornada: r.numero, estado: r.estado,
          aciertos: b.aciertos, es_ganador: !!b.es_ganador,
          premio_cents: b.premio_cents ?? 0,
          puesto: orden.findIndex(x => x.player_id === j.id) + 1,
          de: r.boletos.length,
          picks: b.picks,
        }
      })
      .filter(Boolean)
    const movimientos = DEMO.ledger.filter(l => l.player_id === j.id)
    return ok({
      jugador: j,
      historial,
      movimientos,
      saldo_cents: movimientos.reduce((a, l) => a + l.importe_cents, 0),
    })
  }

  const [jugador, scores, movimientos] = await Promise.all([
    supabase.from('players').select('id, nombre, alias, avatar_url').eq('id', playerId).single().then(lanzar),
    supabase.from('round_scores')
      .select('aciertos, aciertos_provisional, es_ganador, rounds(id, numero, estado)')
      .eq('player_id', playerId).then(lanzar),
    supabase.from('ledger').select('*').eq('player_id', playerId).order('fecha', { ascending: false }).then(lanzar),
  ])

  const premioDe = Object.fromEntries(
    movimientos.filter(m => m.tipo === 'premio').map(m => [m.round_id, m.importe_cents])
  )

  return {
    jugador,
    historial: scores
      .map(s => ({
        round_id: s.rounds.id, jornada: s.rounds.numero, estado: s.rounds.estado,
        aciertos: s.aciertos, es_ganador: s.es_ganador,
        premio_cents: premioDe[s.rounds.id] ?? 0,
      }))
      .sort((a, b) => a.jornada - b.jornada),
    movimientos,
    saldo_cents: movimientos.reduce((a, l) => a + l.importe_cents, 0),
  }
}

// ---------------------------------------------------------------------------
// Administración
// ---------------------------------------------------------------------------
export async function getJugadores() {
  if (MODO_DEMO) return ok(DEMO.jugadores)
  return lanzar(await supabase.from('players').select('id, nombre, alias').eq('activo', true).order('nombre'))
}

/**
 * Inserta los boletos de un Excel y recalcula la jornada.
 *
 * `upsert` sobre (round_id, player_id): reimportar el mismo Excel corregido
 * sustituye las columnas en vez de duplicarlas, que es exactamente lo que pasa
 * cuando se detecta una errata después de haber subido el archivo.
 */
export async function importarBoletos(roundId, filas) {
  if (MODO_DEMO) throw new Error('El modo demo no escribe en ninguna base de datos.')

  const { error } = await supabase.from('bets').upsert(
    filas.map(f => ({
      round_id: roundId,
      player_id: f.jugador.id,
      picks: f.picks,
      estado: 'confirmada',
      origen: 'excel',
    })),
    { onConflict: 'round_id,player_id' }
  )
  if (error) throw new Error(error.message)

  // La liquidación no se hace aquí: se pide a la base, que es la autoridad.
  // Si aún faltan signos oficiales, no repartirá nada y no pasa nada.
  const { data, error: eRpc } = await supabase.rpc('recalcular_jornada', { p_round_id: roundId })
  if (eRpc) throw new Error(eRpc.message)
  return data
}

// ---------------------------------------------------------------------------
// Realtime · la clasificación se mueve sola mientras se juega
// ---------------------------------------------------------------------------
export function suscribirseAJornada(roundId, alCambiar) {
  if (MODO_DEMO || !supabase) return () => {}

  const canal = supabase
    .channel(`jornada-${roundId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `round_id=eq.${roundId}` }, alCambiar)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'round_scores', filter: `round_id=eq.${roundId}` }, alCambiar)
    .subscribe()

  return () => supabase.removeChannel(canal)
}
