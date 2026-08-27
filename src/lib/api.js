// ===========================================================================
// Única puerta de acceso a datos. Las pantallas no saben si detrás hay
// Supabase o el modo demo: piden lo mismo y reciben la misma forma.
// ===========================================================================

import { supabase, MODO_DEMO } from './supabase.js'
import { DEMO, jugadorDemo } from './demo.js'
import { acumularAciertos } from './evolucion.js'
import { puestoEn } from './puestos.js'
// Puro JS sin nada de Node, así que se puede importar tal cual en el
// navegador: es el mismo parser que usa scripts/sync-lae.mjs, para no tener
// dos versiones de "qué significa este JSON de LAE" que puedan divergir.
import { normalizarSorteo, normalizarProximo, esFinDeSemana, signoDeMarcador } from '../../scripts/lae.mjs'

const ok = (data) => Promise.resolve(data)

function lanzar({ data, error }) {
  if (error) throw new Error(error.message)
  return data
}

/**
 * Los aciertos que hay que enseñar de una puntuación.
 *
 * `round_scores` guarda dos cuentas distintas a propósito (ver 0004):
 * `aciertos` suma solo los signos OFICIALES de LAE y es la que decide quién
 * cobra, y `aciertos_provisional` incluye además los deducidos del marcador en
 * vivo. Mientras la jornada no está liquidada la buena es la provisional: si
 * no, la tabla del domingo enseña un contador a cero al lado de casillas ya
 * pintadas en verde, porque la tira de signos sí usa el provisional.
 *
 * Una vez finalizada las dos coinciden —ya está todo oficial—, pero se usa
 * `aciertos` explícitamente, que es la que repartió el dinero.
 */
const aciertosVigentes = (score, estadoRonda) =>
  estadoRonda === 'finalizada'
    ? (score?.aciertos ?? 0)
    : (score?.aciertos_provisional ?? score?.aciertos ?? 0)

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

/**
 * Aciertos acumulados de cada participante jornada a jornada.
 *
 * La clasificación cuenta cómo va la temporada; esto cuenta cómo se ha
 * llegado hasta ahí. Solo jornadas finalizadas, para que la línea no dé un
 * salto con datos provisionales que luego cambian.
 *
 * Quien no juega una jornada no suma: su línea se queda plana ese tramo, que
 * es exactamente lo que le pasa en la general. No se interpola.
 *
 * Devuelve los acumulados indexados por `player_id`, sin nombres: quien lo
 * pinta ya tiene la clasificación cargada al lado y de ahí saca el nombre.
 * Todo el que aparece aquí está en esa tabla —las dos salen de las mismas
 * jornadas finalizadas—, así que el cruce siempre casa.
 */
export async function getEvolucion(seasonId) {
  if (MODO_DEMO) {
    const jornadas = DEMO.rounds
      .filter(r => r.estado === 'finalizada')
      .sort((a, b) => a.numero - b.numero)
    return ok({
      jornadas: jornadas.map(r => ({ round_id: r.id, numero: r.numero })),
      acumulado: acumularAciertos(jornadas, r => r.boletos.map(b => [b.player_id, b.aciertos])),
    })
  }

  // En dos pasos y no con un embed: `round_scores` y `rounds` se filtran por
  // temporada, que vive en `rounds`. Pedir las jornadas primero deja la
  // segunda consulta acotada a sus ids y evita depender de cómo PostgREST
  // resuelve los filtros sobre tablas empotradas.
  const jornadas = [...lanzar(
    await supabase.from('rounds').select('id, numero')
      .eq('season_id', seasonId).eq('estado', 'finalizada')
  )].sort((a, b) => a.numero - b.numero)

  if (jornadas.length === 0) return { jornadas: [], acumulado: {} }

  const scores = lanzar(
    await supabase.from('round_scores').select('round_id, player_id, aciertos')
      .in('round_id', jornadas.map(j => j.id))
  )
  const porJornada = new Map(jornadas.map(j => [j.id, []]))
  for (const s of scores) porJornada.get(s.round_id)?.push([s.player_id, s.aciertos])

  return {
    jornadas: jornadas.map(j => ({ round_id: j.id, numero: j.numero })),
    acumulado: acumularAciertos(jornadas, j => porJornada.get(j.id)),
  }
}

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
      // Sin boletos no hay mejor puntuación: `null`, igual que devuelve el
      // max() de la vista. Un Math.max() sin argumentos daría -Infinity, que
      // el `?? '—'` de la tabla no atrapa y acabaría impreso en pantalla.
      mejor_puntuacion: r.boletos.length ? Math.max(...r.boletos.map(b => b.aciertos)) : null,
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

  // `bets` y `round_scores` son tablas hermanas: las dos apuntan a `rounds` y
  // `players`, pero no hay ninguna relación directa entre ellas, así que
  // PostgREST no puede unirlas con un embed. Se piden por separado y se
  // cruzan aquí por player_id.
  const [round, partidos, boletos, scores] = await Promise.all([
    supabase.from('v_rounds_precio').select('*').eq('id', roundId).single().then(lanzar),
    supabase.from('matches').select('*').eq('round_id', roundId).order('orden').then(lanzar),
    supabase.from('bets').select('player_id, picks, players(nombre, alias)').eq('round_id', roundId).then(lanzar),
    supabase.from('round_scores').select('player_id, aciertos, aciertos_provisional, es_ganador')
      .eq('round_id', roundId).then(lanzar),
  ])
  const resumen = lanzar(
    await supabase.from('v_jornada_resumen').select('*').eq('round_id', roundId).maybeSingle()
  )

  const scoreDe = Object.fromEntries(scores.map(s => [s.player_id, s]))

  return {
    round,
    partidos,
    boletos: boletos
      .map(b => ({
        player_id: b.player_id,
        picks: b.picks,
        nombre: b.players?.nombre ?? '—',
        alias: b.players?.alias ?? '',
        aciertos: aciertosVigentes(scoreDe[b.player_id], round.estado),
        es_ganador: scoreDe[b.player_id]?.es_ganador ?? false,
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
        return {
          round_id: r.id, jornada: r.numero, estado: r.estado,
          aciertos: b.aciertos, es_ganador: !!b.es_ganador,
          premio_cents: b.premio_cents ?? 0,
          puesto: puestoEn(b.aciertos, r.boletos.map(x => x.aciertos)),
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

  // El puesto no está en `round_scores`: sale de comparar con el resto de la
  // jornada, así que hacen falta también las puntuaciones de los demás. Es una
  // consulta más, pero sin ella la columna "Puesto" del expediente se quedaba
  // siempre en un guión —que es justo lo que pasaba, porque solo la rama demo
  // lo calculaba.
  const rondas = scores.map(s => s.rounds)
  const rivales = rondas.length
    ? lanzar(
        await supabase.from('round_scores')
          .select('round_id, aciertos, aciertos_provisional')
          .in('round_id', rondas.map(r => r.id))
      )
    : []

  const porRonda = new Map(rondas.map(r => [r.id, []]))
  for (const rs of rivales) {
    const ronda = rondas.find(r => r.id === rs.round_id)
    porRonda.get(rs.round_id)?.push(aciertosVigentes(rs, ronda?.estado))
  }

  return {
    jugador,
    historial: scores
      .map(s => {
        const todos = porRonda.get(s.rounds.id) ?? []
        const aciertos = aciertosVigentes(s, s.rounds.estado)
        return {
          round_id: s.rounds.id, jornada: s.rounds.numero, estado: s.rounds.estado,
          aciertos, es_ganador: s.es_ganador,
          premio_cents: premioDe[s.rounds.id] ?? 0,
          puesto: puestoEn(aciertos, todos),
          de: todos.length,
        }
      })
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

export async function crearParticipante({ nombre, alias, email, alias_alternativos = [], user_id = null }) {
  if (MODO_DEMO) throw new Error('El modo demo no escribe en ninguna base de datos.')
  return lanzar(
    await supabase.from('players')
      // `user_id` se pasa solo al dar de alta desde una cuenta ya registrada;
      // en el alta normal va null y lo rellena el trigger por correo (0012).
      .insert({ nombre, alias, email: email || null, alias_alternativos, user_id })
      .select('id')   // nunca '*': email no es legible y reventaría la consulta
      .single()
  )
}

/**
 * Cuentas que han entrado alguna vez pero no son de ningún participante.
 *
 * Pasa por `v_cuentas_sin_ficha` (0012) y no por `auth.users` porque ese
 * esquema no está expuesto a la API: la vista corre con los permisos de su
 * propietario y se filtra sola con is_admin(), igual que `v_players_admin`.
 */
export async function getCuentasSinFicha() {
  if (MODO_DEMO) {
    return ok([{
      user_id: 'demo-huerfana',
      email: 'alguien@empresa.com',
      created_at: new Date(Date.now() - 3 * 864e5).toISOString(),
      last_sign_in_at: new Date(Date.now() - 864e5).toISOString(),
    }])
  }
  return lanzar(
    await supabase.from('v_cuentas_sin_ficha').select('*').order('created_at', { ascending: false })
  )
}

/** Ata una cuenta ya registrada a una ficha que existía sin ella. */
export async function vincularCuenta(playerId, userId) {
  if (MODO_DEMO) throw new Error('El modo demo no escribe en ninguna base de datos.')
  const { error } = await supabase.from('players').update({ user_id: userId }).eq('id', playerId)
  if (error) throw new Error(error.message)
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

/**
 * Pide a GitHub Actions que sincronice con LAE ahora mismo, en vez de esperar
 * al cron. El token de GitHub nunca toca el navegador: vive cifrado en Vault
 * y es la propia base la que llama por su cuenta (ver 0011).
 */
export async function sincronizarConLae() {
  if (MODO_DEMO) throw new Error('El modo demo no puede lanzar la sincronización.')
  const { data, error } = await supabase.rpc('disparar_sync_lae')
  if (error) throw new Error(error.message)
  return data
}

/**
 * Camino manual para cuando la sincronización automática no puede llegar a
 * LAE (Akamai bloqueando la IP de turno, por ejemplo). El admin ejecuta un
 * comando en la consola del navegador ESTANDO en loteriasyapuestas.es —así
 * el fetch sale desde su propia conexión, no desde un centro de datos, y sin
 * problema de CORS porque el origen coincide— y pega aquí el resultado.
 *
 * A partir de ahí es el mismo proceso que sync-lae.mjs, solo que corriendo
 * en el navegador del admin (ya autenticado) en vez de con service_role:
 * las policies de RLS son las mismas que ya usan crearJornada y
 * guardarPartidos, así que no hace falta ningún permiso especial.
 */
export async function procesarDatosLae({ celebrados = [], proximos = [] }) {
  if (MODO_DEMO) throw new Error('El modo demo no escribe en ninguna base de datos.')

  const { data: season, error: eSeason } = await supabase
    .from('seasons').select('id').eq('activa', true).single()
  if (eSeason) throw new Error('No hay ninguna temporada activa.')

  async function jornadaPara(laeIdSorteo, laeJornada) {
    const { data: existente } = await supabase
      .from('rounds').select('*').eq('lae_id_sorteo', laeIdSorteo).maybeSingle()
    if (existente) return existente

    const { data: ultima } = await supabase
      .from('rounds').select('numero').eq('season_id', season.id)
      .order('numero', { ascending: false }).limit(1).maybeSingle()

    const { data: nueva, error } = await supabase.from('rounds').insert({
      season_id: season.id, numero: (ultima?.numero ?? 0) + 1,
      lae_id_sorteo: laeIdSorteo, lae_jornada: laeJornada, estado: 'borrador',
    }).select().single()
    if (error) throw new Error(error.message)
    return nueva
  }

  const resumen = []

  for (const crudo of celebrados) {
    const s = normalizarSorteo(crudo)
    if (!esFinDeSemana(s.fecha_sorteo)) {
      resumen.push({ lae_jornada: s.lae_jornada, omitida: 'intersemanal' })
      continue
    }

    const round = await jornadaPara(s.lae_id_sorteo, s.lae_jornada)

    const { data: existentes } = await supabase
      .from('matches').select('orden, sustituido_de').eq('round_id', round.id)
    const protegidos = new Set((existentes ?? []).filter(m => m.sustituido_de).map(m => m.orden))

    const filas = s.partidos.filter(p => !protegidos.has(p.orden)).map(p => ({
      round_id: round.id, orden: p.orden, local: p.local, visitante: p.visitante,
      lae_id_local: p.lae_id_local, lae_id_visitante: p.lae_id_visitante,
      kickoff_at: p.kickoff_at, goles_local: p.goles_local, goles_visitante: p.goles_visitante,
      signo: p.signo, signo_provisional: p.signo_provisional, estado: p.estado,
    }))
    if (filas.length) {
      const { error } = await supabase.from('matches').upsert(filas, { onConflict: 'round_id,orden' })
      if (error) throw new Error(error.message)
    }

    if (round.estado === 'borrador' || round.estado === 'abierta') {
      await supabase.from('rounds').update({ estado: 'cerrada' }).eq('id', round.id)
    }

    const { data: res, error: eRpc } = await supabase.rpc('recalcular_jornada', { p_round_id: round.id })
    if (eRpc) throw new Error(eRpc.message)
    resumen.push({ jornada: round.numero, ...res })
  }

  for (const crudo of proximos.filter(p => p.game_id === 'LAQU')) {
    const p = normalizarProximo(crudo)
    if (!esFinDeSemana(p.fecha_sorteo) || (!p.abre_at && !p.cierra_at)) continue

    const round = await jornadaPara(p.lae_id_sorteo, p.lae_jornada)
    if (round.estado !== 'borrador') continue

    const { error } = await supabase.from('rounds')
      .update({ abre_at: p.abre_at, cierra_at: p.cierra_at, lae_jornada: p.lae_jornada })
      .eq('id', round.id)
    if (error) throw new Error(error.message)
  }

  return resumen
}

/** Guarda equipos, marcadores y signos de una jornada de una sentada. */
export async function guardarPartidos(partidos) {
  if (MODO_DEMO) throw new Error('El modo demo no escribe en ninguna base de datos.')
  const { error } = await supabase.from('matches').upsert(
    partidos.map(m => ({
      id: m.id, round_id: m.round_id, orden: m.orden,
      local: m.local, visitante: m.visitante,
      goles_local: m.goles_local, goles_visitante: m.goles_visitante,
      signo: m.signo || null,
      // El provisional se deduce del marcador que teclea el admin, no se pide
      // aparte: es lo que permite que la tabla del domingo se mueva mientras
      // LAE aún no ha publicado nada. El oficial se queda como esté.
      signo_provisional: m.orden <= 14
        ? signoDeMarcador(m.goles_local, m.goles_visitante)
        : null,
      estado: m.estado,
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
export async function importarBoletos(roundId, filas, { marcarPagado = false } = {}) {
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

  // Lo normal es que quien entrega el boleto ya haya pagado en mano. Se anota
  // el pago ANTES de que exista la cuota (que la crea recalcular_jornada más
  // abajo, y solo cuando estén los 14 signos): al llegar la cuota, se
  // cancelan solas y el saldo queda en 0. No hay restricción de unicidad en
  // la base para 'pago' —a diferencia de cuota y premio—, así que aquí se
  // comprueba a mano quién ya tiene uno anotado, para que reimportar el mismo
  // Excel no duplique el pago.
  if (marcarPagado && filas.length) {
    const { data: round } = await supabase.from('v_rounds_precio')
      .select('precio_cents, numero').eq('id', roundId).single()
    if (round) {
      const { data: yaPagados } = await supabase.from('ledger')
        .select('player_id').eq('round_id', roundId).eq('tipo', 'pago')
      const tienen = new Set((yaPagados ?? []).map(p => p.player_id))
      const pendientes = filas.filter(f => !tienen.has(f.jugador.id))

      if (pendientes.length) {
        const { error: eLedger } = await supabase.from('ledger').insert(
          pendientes.map(f => ({
            player_id: f.jugador.id,
            round_id: roundId,
            tipo: 'pago',
            importe_cents: round.precio_cents,
            nota: `Pago en mano · jornada ${round.numero}`,
          }))
        )
        if (eLedger) throw new Error(eLedger.message)
      }
    }
  }

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
