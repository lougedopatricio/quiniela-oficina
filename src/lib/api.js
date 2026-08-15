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
  if (MODO_DEMO) return ok(DEMO.jugadores.map(j => ({ ...j, alias_alternativos: [] })))
  return lanzar(
    await supabase.from('players')
      .select('id, nombre, alias, alias_alternativos')
      .eq('activo', true).order('nombre')
  )
}

/**
 * Ficha completa de cada participante, con email y estado de la cuenta.
 *
 * Va contra `v_players_admin` y no contra `players` porque el email no está
 * concedido a `authenticated` a nivel de columna (ver 0007): la vista corre con
 * los permisos de su propietario y se filtra ella sola con is_admin(), así que
 * es el único camino por el que un administrador puede leer los correos.
 */
export async function getParticipantes() {
  if (MODO_DEMO) {
    return ok(DEMO.jugadores.map(j => ({
      ...j, email: `${j.alias}@ejemplo.com`, is_admin: j.id === 'p1',
      activo: true, user_id: j.id === 'p1' ? 'demo' : null, alias_alternativos: [],
    })))
  }

  const [fichas, saldos] = await Promise.all([
    supabase.from('v_players_admin').select('*').order('nombre').then(lanzar),
    getSaldos(),
  ])
  const alias = Object.fromEntries(
    lanzar(await supabase.from('players').select('id, alias_alternativos'))
      .map(p => [p.id, p.alias_alternativos ?? []])
  )
  const saldoDe = Object.fromEntries(saldos.map(s => [s.player_id, s.saldo_cents]))

  return fichas.map(f => ({
    ...f,
    alias_alternativos: alias[f.id] ?? [],
    saldo_cents: saldoDe[f.id] ?? 0,
  }))
}

export async function crearParticipante({ nombre, alias, email, alias_alternativos = [] }) {
  if (MODO_DEMO) throw new Error('El modo demo no escribe en ninguna base de datos.')
  return lanzar(
    await supabase.from('players')
      .insert({ nombre, alias, email: email || null, alias_alternativos })
      .select('id')   // nunca '*': email no es legible y reventaría la consulta
      .single()
  )
}

export async function actualizarParticipante(id, campos) {
  if (MODO_DEMO) throw new Error('El modo demo no escribe en ninguna base de datos.')
  const { error } = await supabase.from('players').update(campos).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function borrarParticipante(id) {
  if (MODO_DEMO) throw new Error('El modo demo no escribe en ninguna base de datos.')
  const { error } = await supabase.from('players').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/**
 * Le manda a alguien su enlace de acceso.
 *
 * No hay contraseñas que restablecer: el acceso es por enlace mágico, así que
 * "he perdido la contraseña" se resuelve pidiendo otro enlace. Esto no toca la
 * sesión de quien lo pulsa; solo dispara un correo a la dirección indicada.
 */
export async function enviarEnlaceAcceso(email) {
  if (MODO_DEMO) throw new Error('El modo demo no envía correos.')
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin + window.location.pathname },
  })
  if (error) throw new Error(error.message)
}

// ---------------------------------------------------------------------------
// Jornadas y partidos
// ---------------------------------------------------------------------------
export async function crearJornada({ season_id, numero, abre_at, cierra_at, precio_override_cents }) {
  if (MODO_DEMO) throw new Error('El modo demo no escribe en ninguna base de datos.')
  const { data, error } = await supabase.from('rounds')
    .insert({ season_id, numero, abre_at, cierra_at, precio_override_cents })
    .select().single()
  if (error) throw new Error(error.message)

  // Los 15 huecos, para poder rellenar los equipos a mano si LAE no los trae.
  const filas = Array.from({ length: 15 }, (_, i) => ({
    round_id: data.id, orden: i + 1, local: '', visitante: '',
  }))
  const { error: e2 } = await supabase.from('matches').insert(filas)
  if (e2) throw new Error(e2.message)
  return data
}

export async function actualizarJornada(id, campos) {
  if (MODO_DEMO) throw new Error('El modo demo no escribe en ninguna base de datos.')
  const { error } = await supabase.from('rounds').update(campos).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function borrarJornada(id) {
  if (MODO_DEMO) throw new Error('El modo demo no escribe en ninguna base de datos.')
  const { error } = await supabase.from('rounds').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/** Guarda equipos, marcadores y signos de una jornada de una sentada. */
export async function guardarPartidos(partidos) {
  if (MODO_DEMO) throw new Error('El modo demo no escribe en ninguna base de datos.')
  const { error } = await supabase.from('matches').upsert(
    partidos.map(m => ({
      id: m.id, round_id: m.round_id, orden: m.orden,
      local: m.local, visitante: m.visitante,
      goles_local: m.goles_local, goles_visitante: m.goles_visitante,
      signo: m.signo || null, estado: m.estado,
      sustituido_de: m.sustituido_de || null,
    })),
    { onConflict: 'id' }
  )
  if (error) throw new Error(error.message)
}

/**
 * Pide a la base que recalcule. La aritmética del reparto vive en PL/pgSQL y
 * es idempotente, así que corregir un signo mal metido y volver a llamar deja
 * las cuentas bien sin duplicar cuotas ni premios.
 */
export async function recalcularJornada(roundId) {
  if (MODO_DEMO) throw new Error('El modo demo no escribe en ninguna base de datos.')
  const { data, error } = await supabase.rpc('recalcular_jornada', { p_round_id: roundId })
  if (error) throw new Error(error.message)
  return data
}

// ---------------------------------------------------------------------------
// Boletos
// ---------------------------------------------------------------------------
export async function getBoletosDeJornada(roundId) {
  if (MODO_DEMO) {
    const r = DEMO.rounds.find(x => x.id === roundId)
    return ok(r?.boletos ?? [])
  }
  return lanzar(
    await supabase.from('bets')
      .select('id, player_id, picks, estado, origen, players(nombre, alias)')
      .eq('round_id', roundId)
  )
}

export async function guardarBoleto({ id, round_id, player_id, picks }) {
  if (MODO_DEMO) throw new Error('El modo demo no escribe en ninguna base de datos.')
  const fila = { round_id, player_id, picks, estado: 'confirmada', origen: 'admin' }
  const { error } = id
    ? await supabase.from('bets').update(fila).eq('id', id)
    : await supabase.from('bets').upsert(fila, { onConflict: 'round_id,player_id' })
  if (error) throw new Error(error.message)
}

export async function borrarBoleto(id) {
  if (MODO_DEMO) throw new Error('El modo demo no escribe en ninguna base de datos.')
  const { error } = await supabase.from('bets').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ---------------------------------------------------------------------------
// Caja
// ---------------------------------------------------------------------------
/**
 * Anota un movimiento de dinero real.
 *
 * Solo tipos 'pago' y 'ajuste': las cuotas y los premios los calcula
 * recalcular_jornada y los rehace en cada liquidación, así que cualquier
 * apunte manual de esos dos tipos se perdería al recalcular.
 */
export async function registrarMovimiento({ player_id, tipo, importe_cents, nota }) {
  if (MODO_DEMO) throw new Error('El modo demo no escribe en ninguna base de datos.')
  if (!['pago', 'ajuste'].includes(tipo)) {
    throw new Error('Solo se pueden anotar pagos o ajustes a mano.')
  }
  const { error } = await supabase.from('ledger')
    .insert({ player_id, tipo, importe_cents, nota })
  if (error) throw new Error(error.message)
}

export async function borrarMovimiento(id) {
  if (MODO_DEMO) throw new Error('El modo demo no escribe en ninguna base de datos.')
  const { error } = await supabase.from('ledger').delete().eq('id', id).in('tipo', ['pago', 'ajuste'])
  if (error) throw new Error(error.message)
}

export async function getMovimientosManuales() {
  if (MODO_DEMO) return ok(DEMO.ledger.filter(l => l.tipo === 'pago'))
  // `ledger` tiene DOS relaciones con `players` (player_id y created_by), así
  // que hay que decirle a PostgREST cuál seguir o da un 300 de ambigüedad.
  return lanzar(
    await supabase.from('ledger')
      .select('id, player_id, tipo, importe_cents, nota, fecha, players!ledger_player_id_fkey(nombre)')
      .in('tipo', ['pago', 'ajuste'])
      .order('fecha', { ascending: false })
  )
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
