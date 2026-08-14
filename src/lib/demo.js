// ===========================================================================
// Datos de ejemplo para poder ver y enseñar la app sin haber montado Supabase.
//
// No es una maqueta con números pegados: aplica las MISMAS reglas de reparto
// que la base de datos (src/lib/reglas.js, atado por tests a la función de
// PL/pgSQL). Lo que se ve aquí es lo que saldría de verdad.
// ===========================================================================

import { liquidar, puntuar, boteDespues } from './reglas.js'

const PRECIO = 200   // 2,00 € la columna

const GENTE = [
  'Alejandro', 'Marta', 'Javi', 'Nerea',
  'Sergio', 'Lucía', 'Dani', 'Paula',
]

const EQUIPOS = [
  ['Betis', 'Real Madrid'], ['Alavés', 'Mallorca'], ['Getafe', 'Barcelona'],
  ['Valencia', 'Girona'], ['At. Madrid', 'Athletic Club'], ['Rayo Vallecano', 'Real Sociedad'],
  ['R. Oviedo', 'Elche'], ['Osasuna', 'Sevilla'], ['Villarreal', 'Celta'],
  ['Burgos', 'Deportivo'], ['Málaga', 'Castellón'], ['Granada', 'Almería'],
  ['Huesca', 'R. Zaragoza'], ['Ceuta', 'Racing Santander'], ['Espanyol', 'Levante'],
]

// Generador determinista: la demo tiene que verse igual en cada recarga, si no
// es imposible hablar de "la jornada 3" con alguien.
function prng(semilla) {
  let s = semilla >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

const SIGNOS = ['1', 'X', '2']
const elegirSigno = (r) => {
  const v = r()
  return v < 0.46 ? '1' : v < 0.74 ? 'X' : '2'   // sesgo realista hacia el local
}

/**
 * El marcador tiene que concordar con el signo. Generarlos por separado deja
 * en pantalla cosas como "1 – 1" con signo 2, que es justo el tipo de detalle
 * que hace desconfiar de toda la tabla.
 */
function marcadorCoherente(signo, r) {
  const perdedor = Math.floor(r() * 3)                 // 0..2
  const ganador = perdedor + 1 + Math.floor(r() * 2)   // al menos uno más
  if (signo === '1') return { gl: ganador, gv: perdedor }
  if (signo === '2') return { gl: perdedor, gv: ganador }
  return { gl: perdedor, gv: perdedor }
}

function construir() {
  const rnd = prng(20260814)

  const jugadores = GENTE.map((nombre, i) => ({
    id: `p${i + 1}`,
    nombre,
    alias: nombre.toLowerCase(),
  }))

  const JORNADAS = 7           // 6 finalizadas + 1 en juego
  const rounds = []
  const movimientosBote = []
  const ledger = []
  let boteActual = 0

  for (let j = 1; j <= JORNADAS; j++) {
    const enJuego = j === JORNADAS
    const signos = Array.from({ length: 14 }, () => elegirSigno(rnd))

    const partidos = EQUIPOS.map(([local, visitante], k) => {
      const orden = k + 1
      const signo = orden <= 14 ? signos[k] : null
      // En la jornada en curso, los últimos partidos aún no han terminado.
      const jugado = !enJuego || orden <= 9
      const { gl, gv } = jugado ? marcadorCoherente(signo ?? 'X', rnd) : { gl: null, gv: null }
      return {
        orden, local, visitante,
        signo: jugado && orden <= 14 ? signo : null,
        signo_provisional: jugado && orden <= 14 ? signo : null,
        estado: jugado ? 'finalizado' : orden === 10 ? 'en_juego' : 'pendiente',
        goles_local: gl,
        goles_visitante: gv,
        kickoff_at: new Date(Date.now() - (JORNADAS - j) * 7 * 864e5 + (orden - 8) * 3.6e6).toISOString(),
      }
    })

    // Casi todos juegan cada jornada, pero no todos: es una oficina.
    const participan = jugadores.filter(() => rnd() > 0.12)
    const boletos = participan.map(p => {
      // Cada uno acierta entre 5 y 13, y en la jornada 4 alguien clava el pleno.
      const objetivo = j === 4 && p.id === 'p3' ? 14 : 5 + Math.floor(rnd() * 9)
      const picks = signos.map((s, i) => (i < objetivo ? s : SIGNOS[(SIGNOS.indexOf(s) + 1) % 3]))
      return { player_id: p.id, picks }
    })

    const signosVisibles = partidos.slice(0, 14).map(m => m.signo)
    const aciertos = boletos.map(b => puntuar(b.picks, signosVisibles))

    const round = {
      id: `r${j}`,
      numero: j,
      estado: enJuego ? 'en_juego' : 'finalizada',
      es_especial: j === 5,
      cierra_at: new Date(Date.now() - (JORNADAS - j) * 7 * 864e5 - 2 * 864e5).toISOString(),
      precio_cents: PRECIO,
      partidos,
      boletos: boletos.map((b, i) => ({ ...b, aciertos: aciertos[i] })),
    }

    if (!enJuego) {
      const liq = liquidar(aciertos, PRECIO, boteActual)
      round.liquidacion = liq

      boletos.forEach((b) => {
        ledger.push({ player_id: b.player_id, round_id: round.id, tipo: 'cuota', importe_cents: -PRECIO,
                      nota: `Cuota jornada ${j}`, fecha: round.cierra_at })
      })
      liq.ganadores.forEach((idx, k) => {
        round.boletos[idx].es_ganador = true
        round.boletos[idx].premio_cents = liq.reparto[k]
        ledger.push({ player_id: boletos[idx].player_id, round_id: round.id, tipo: 'premio',
                      importe_cents: liq.reparto[k],
                      nota: liq.max === 14 ? `¡PLENO! Jornada ${j} · premio + bote` : `Premio jornada ${j} · ${liq.max} aciertos`,
                      fecha: round.cierra_at })
      })

      boteActual = boteDespues(boteActual, liq)
      movimientosBote.push({
        round_id: round.id, jornada: j, fecha: round.cierra_at,
        aporte_cents: liq.alBote, salida_cents: liq.botePagado, saldo_cents: boteActual,
        motivo: liq.max === 14 ? `Jornada ${j} · ¡PLENO! El bote se reparte` : `Jornada ${j} · 50% de la recaudación`,
      })
    } else {
      // Provisional: los aciertos cuentan, pero todavía no hay dinero repartido.
      round.boletos.forEach(b => { b.provisional = true })
    }

    rounds.push(round)
  }

  // Un par de pagos en efectivo, para que la pantalla de saldos no sea toda deuda.
  ledger.push({ player_id: 'p1', tipo: 'pago', importe_cents: 800, nota: 'Pagado en efectivo', fecha: new Date().toISOString() })
  ledger.push({ player_id: 'p5', tipo: 'pago', importe_cents: 400, nota: 'Bizum', fecha: new Date().toISOString() })

  return {
    season: { id: 's1', nombre: 'Temporada 26/27', precio_columna_cents: PRECIO, activa: true },
    jugadores, rounds, ledger, movimientosBote, boteActual,
  }
}

export const DEMO = construir()

export const jugadorDemo = DEMO.jugadores[0]   // "tú" en el modo demo
