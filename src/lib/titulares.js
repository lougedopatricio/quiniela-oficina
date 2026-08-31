// ===========================================================================
// Titulares generados a partir de los datos.
//
// Es lo que separa una portada de un rótulo. Poner "Clasificación" encima de
// una tabla no aporta nada: ya se ve que es una tabla. "Nerea aguanta el
// liderato" cuenta lo que ha pasado esta semana.
//
// Deterministas: los mismos datos dan siempre el mismo titular, así se puede
// hablar de él en la oficina sin que cambie al recargar.
// ===========================================================================

const nombre = (f) => f?.nombre ?? '—'

export function titularClasificacion(tabla, jornadasFinalizadas) {
  if (!tabla?.length) return 'Todavía no ha rodado el balón'
  if (jornadasFinalizadas <= 1) return `${nombre(tabla[0])} abre la temporada al frente`

  const [primero, segundo] = tabla
  const ventaja = primero.aciertos_total - (segundo?.aciertos_total ?? 0)

  if (!segundo) return `${nombre(primero)}, solo en la general`
  if (ventaja === 0) return `${nombre(primero)} y ${nombre(segundo)}, empatados arriba`
  if (ventaja === 1) return `${nombre(primero)} lidera por un solo acierto`
  if (ventaja >= 12) return `${nombre(primero)} se escapa en la general`
  if (ventaja >= 6) return `${nombre(primero)} manda con comodidad`
  return `${nombre(primero)} aguanta el liderato`
}

export function titularJornada(round, boletos, resumen, puntuables = 14) {
  const j = round?.numero
  if (round?.estado === 'en_juego') return `La jornada ${j}, en directo`
  if (!boletos?.length) return `Jornada ${j}: nadie llegó a tiempo`

  const max = boletos[0].aciertos
  const ganadores = boletos.filter(b => b.aciertos === max)

  // Pleno es acertarlo TODO, y "todo" depende de la jornada: 14 de siempre, o
  // 15 con el Pleno al 15 activo. Con el 14 clavado a fuego, una jornada de 15
  // no habría dado nunca este titular.
  if (max === puntuables) {
    return ganadores.length === 1
      ? `¡Pleno de ${nombre(ganadores[0])} en la jornada ${j}!`
      : `Pleno compartido en la jornada ${j}`
  }
  if (resumen?.bote_pagado_cents > 0) return `El bote cae en la jornada ${j}`
  if (ganadores.length > 1) return `Empate a ${max} en la jornada ${j}`
  return `${nombre(ganadores[0])} gana la jornada ${j} con ${max}`
}

export function titularBote(actualCents, plenos) {
  if (actualCents === 0) return plenos > 0 ? 'El bote vuelve a empezar de cero' : 'El bote está por estrenar'
  if (actualCents >= 10000) return 'El bote empieza a ser serio'
  return 'El bote sigue engordando'
}

export function titularSaldos(saldos) {
  const deben = saldos.filter(s => s.saldo_cents < 0).length
  if (deben === 0) return 'Nadie debe nada'
  if (deben === 1) return 'Queda uno por pasar por caja'
  return `${deben} pendientes de pasar por caja`
}

export function titularPerfil(jugador, jugadas, victorias) {
  if (!jugadas) return `${jugador.nombre} todavía no ha jugado`
  if (victorias >= 3) return `${jugador.nombre}, el que más jornadas gana`
  if (victorias > 0) return `${jugador.nombre}, ${victorias} jornada${victorias === 1 ? '' : 's'} en el bolsillo`
  return `El expediente de ${jugador.nombre}`
}
