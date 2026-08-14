// ===========================================================================
// Sincronización con Loterías y Apuestas del Estado.
//
// POR QUÉ ESTO USA PLAYWRIGHT Y NO UN `fetch` NORMAL
// --------------------------------------------------
// loteriasyapuestas.es está detrás de Akamai y responde 403 a cualquier cliente
// HTTP que no sea un navegador real. Comprobado: petición con cabeceras
// completas de Chrome (User-Agent, Accept, Referer, Origin) → 403, mientras que
// example.com y api.github.com desde la misma máquina → 200. Tampoco envía
// cabeceras CORS, así que el navegador del propio admin tampoco puede llamarlo
// desde la app. La única vía fiable es un Chromium de verdad, y en GitHub
// Actions sale gratis.
//
// Se ejecuta con la service_role key, que SALTA las policies RLS. Por eso vive
// en los secrets del repo y nunca en una variable VITE_*.
// ===========================================================================

import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
import { mkdir, writeFile } from 'node:fs/promises'
import { normalizarSorteo, normalizarProximo, URLS, comoAAAAMMDD } from './lae.mjs'

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LAE_DESDE, LAE_HASTA } = process.env

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const log = (...a) => console.log('·', ...a)

/** Abre un Chromium real y descarga los dos endpoints desde su contexto. */
async function descargarDeLae() {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ locale: 'es-ES', timezoneId: 'Europe/Madrid' })
  const page = await ctx.newPage()

  try {
    // Hay que estar EN el sitio antes de llamar a sus servicios: el fetch sale
    // del propio origen y así no hay problema de CORS ni de referer.
    await page.goto('https://www.loteriasyapuestas.es/es/quiniela', {
      waitUntil: 'domcontentloaded', timeout: 60_000,
    })

    const hasta = LAE_HASTA || comoAAAAMMDD(new Date())
    const desde = LAE_DESDE || comoAAAAMMDD(new Date(Date.now() - 21 * 864e5))
    log(`Ventana de jornadas celebradas: ${desde} → ${hasta}`)

    const datos = await page.evaluate(async ([uCel, uProx]) => {
      const traer = async (u) => {
        const r = await fetch(u, { headers: { Accept: 'application/json' } })
        if (!r.ok) return { error: `HTTP ${r.status}`, url: u }
        const t = await r.text()
        try { return { ok: JSON.parse(t) } } catch { return { error: 'respuesta no JSON', muestra: t.slice(0, 300) } }
      }
      return { celebrados: await traer(uCel), proximos: await traer(uProx) }
    }, [URLS.celebrados(desde, hasta), URLS.proximos(3)])

    for (const [k, v] of Object.entries(datos)) {
      if (v.error) throw new Error(`LAE ${k}: ${v.error} ${v.muestra ?? ''}`)
    }

    // LAE devuelve un string con un mensaje cuando no hay resultados.
    const celebrados = Array.isArray(datos.celebrados.ok) ? datos.celebrados.ok : []
    const proximos   = Array.isArray(datos.proximos.ok)   ? datos.proximos.ok   : []
    return { celebrados, proximos }
  } catch (e) {
    // Si Akamai endurece la detección algún día, esto es lo que dirá por qué.
    await mkdir('lae-debug', { recursive: true }).catch(() => {})
    await page.screenshot({ path: 'lae-debug/pantalla.png', fullPage: true }).catch(() => {})
    await writeFile('lae-debug/pagina.html', await page.content().catch(() => '')).catch(() => {})
    throw e
  } finally {
    await browser.close()
  }
}

async function temporadaActiva() {
  const { data, error } = await db.from('seasons').select('id, nombre').eq('activa', true).maybeSingle()
  if (error) throw error
  if (!data) throw new Error('No hay ninguna temporada activa. Crea una y marca `activa = true`.')
  return data
}

/**
 * Localiza la jornada por su id_sorteo de LAE, o la crea al final de la
 * numeración de la temporada. Nuestro `numero` es nuestro, independiente del
 * de LAE: así una jornada especial inventada por el admin encaja igual.
 */
async function jornadaPara(seasonId, laeIdSorteo, laeJornada) {
  const { data: existente, error: e1 } = await db
    .from('rounds').select('*').eq('lae_id_sorteo', laeIdSorteo).maybeSingle()
  if (e1) throw e1
  if (existente) return { round: existente, creada: false }

  const { data: ultima, error: e2 } = await db
    .from('rounds').select('numero').eq('season_id', seasonId)
    .order('numero', { ascending: false }).limit(1).maybeSingle()
  if (e2) throw e2

  const { data: nueva, error: e3 } = await db.from('rounds').insert({
    season_id: seasonId,
    numero: (ultima?.numero ?? 0) + 1,
    lae_id_sorteo: laeIdSorteo,
    lae_jornada: laeJornada,
    estado: 'borrador',
  }).select().single()
  if (e3) throw e3
  return { round: nueva, creada: true }
}

async function main() {
  const season = await temporadaActiva()
  log(`Temporada activa: ${season.nombre}`)

  const { celebrados, proximos } = await descargarDeLae()
  log(`LAE devuelve ${celebrados.length} jornada(s) celebrada(s) y ${proximos.length} próxima(s).`)

  const resumen = []

  // ---------------------------------------------------------------------
  // Jornadas celebradas → partidos, marcadores y signos oficiales
  // ---------------------------------------------------------------------
  for (const crudo of celebrados) {
    const s = normalizarSorteo(crudo)
    const { round, creada } = await jornadaPara(season.id, s.lae_id_sorteo, s.lae_jornada)

    if (round.es_especial) {
      // El admin cambió partidos a mano: pisarlos con los de LAE destruiría
      // su jornada. Los signos de los partidos que sí sean oficiales ya los
      // habrá traído una pasada anterior.
      log(`Jornada ${round.numero} es especial; no se toca su alineación.`)
      resumen.push({ jornada: round.numero, omitida: 'especial' })
      continue
    }

    const filas = s.partidos.map(p => ({
      round_id: round.id,
      orden: p.orden,
      local: p.local,
      visitante: p.visitante,
      lae_id_local: p.lae_id_local,
      lae_id_visitante: p.lae_id_visitante,
      kickoff_at: p.kickoff_at,
      goles_local: p.goles_local,
      goles_visitante: p.goles_visitante,
      signo: p.signo,
      estado: p.estado,
    }))

    const { error } = await db.from('matches').upsert(filas, { onConflict: 'round_id,orden' })
    if (error) throw error

    if (round.estado === 'borrador' || round.estado === 'abierta') {
      await db.from('rounds').update({ estado: 'cerrada' }).eq('id', round.id)
    }

    // Se llama siempre: la función no reparte nada hasta que están los 14
    // signos, así que la jornada se liquida sola en cuanto LAE completa.
    const { data: res, error: eRpc } = await db.rpc('recalcular_jornada', { p_round_id: round.id })
    if (eRpc) throw eRpc

    log(`Jornada ${round.numero}${creada ? ' (nueva)' : ''}: ${s.partidos.length} partidos, ` +
        (res?.liquidada ? `LIQUIDADA · ${res.ganadores} ganador(es) con ${res.max_aciertos}` : `pendiente (${res?.motivo})`))
    resumen.push({ jornada: round.numero, ...res })
  }

  // ---------------------------------------------------------------------
  // Próximas jornadas → plazos oficiales de apertura y cierre
  // ---------------------------------------------------------------------
  for (const crudo of proximos) {
    const p = normalizarProximo(crudo)
    if (!p.abre_at && !p.cierra_at) continue   // LAE aún no ha publicado plazos

    const { round } = await jornadaPara(season.id, p.lae_id_sorteo, p.lae_jornada)

    // Solo se tocan los plazos mientras la jornada no haya arrancado. Si el
    // admin ya la abrió con sus propias fechas, mandan las suyas.
    if (round.estado !== 'borrador') continue

    const { error } = await db.from('rounds')
      .update({ abre_at: p.abre_at, cierra_at: p.cierra_at, lae_jornada: p.lae_jornada })
      .eq('id', round.id)
    if (error) throw error

    log(`Jornada ${round.numero}: plazo ${p.abre_at ?? '—'} → ${p.cierra_at ?? '—'}`)
  }

  log('Listo.')
  console.log(JSON.stringify(resumen, null, 2))
}

main().catch(e => {
  console.error('\nLa sincronización ha fallado:', e.message)
  process.exit(1)
})
