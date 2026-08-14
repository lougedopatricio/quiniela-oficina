// ===========================================================================
// Espejo en JavaScript de las reglas de reparto que implementa
// supabase/migrations/0004_puntuacion.sql
//
// La base de datos sigue siendo la autoridad: aquí no se liquida nada, solo se
// PREVISUALIZA (el importador de Excel enseña qué va a pasar antes de insertar)
// y se genera el modo demo.
//
// Que existan dos implementaciones de la misma regla es un riesgo conocido de
// divergencia, así que hay un test que ejecuta las dos —esta y la de Postgres—
// sobre los mismos casos y compara céntimo a céntimo: tests/espejo.test.mjs
// ===========================================================================

/** Aciertos de una columna. Solo los 14 primeros: el Pleno al 15 no cuenta. */
export function puntuar(picks, signos) {
  let n = 0
  for (let i = 0; i < 14; i++) {
    if (signos[i] && picks[i] === signos[i]) n++
  }
  return n
}

/**
 * Reparto de una jornada.
 *
 * @param {number[]} aciertosPorBoleto  un elemento por boleto confirmado
 * @param {number}   precioCents        precio de la columna
 * @param {number}   boteAntesCents     bote acumulado antes de esta jornada
 * @returns reparto en céntimos, con los índices de los boletos ganadores
 */
export function liquidar(aciertosPorBoleto, precioCents, boteAntesCents = 0) {
  const boletos = aciertosPorBoleto.length
  if (boletos === 0) {
    return { boletos: 0, recaudacion: 0, premio: 0, alBote: 0, botePagado: 0, max: null, ganadores: [], reparto: [] }
  }

  const recaudacion = boletos * precioCents
  const premio = Math.floor(recaudacion / 2)
  const alBote = recaudacion - premio          // el céntimo impar va al bote

  const max = Math.max(...aciertosPorBoleto)
  const ganadores = aciertosPorBoleto
    .map((a, i) => (a === max ? i : -1))
    .filter(i => i >= 0)

  // Un 14/14 se lleva además el bote entero, incluido el aporte de esta misma
  // jornada, y el bote queda a cero.
  const botePagado = max === 14 ? boteAntesCents + alBote : 0

  const total = premio + botePagado
  const base = Math.floor(total / ganadores.length)
  const resto = total % ganadores.length

  // El resto de la división no se pierde: se reparte de céntimo en céntimo
  // entre los primeros ganadores, de forma que lo entregado suma exactamente
  // lo repartido.
  const reparto = ganadores.map((_, k) => base + (k < resto ? 1 : 0))

  return { boletos, recaudacion, premio, alBote, botePagado, max, ganadores, reparto }
}

/** Bote resultante tras liquidar la jornada. */
export function boteDespues(boteAntesCents, { alBote, botePagado }) {
  return boteAntesCents + alBote - botePagado
}
