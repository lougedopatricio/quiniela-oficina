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

/**
 * Aciertos de una columna, sobre los signos que se le pasen.
 *
 * Cuántos partidos puntúan lo decide quien llama, no esta función: desde 0013
 * el Pleno al 15 puede contar o no según cómo esté configurada la jornada. Se
 * mira hasta donde llegue `signos`, así que pasar 14 da el comportamiento de
 * siempre y pasar 15 incluye el pleno.
 */
export function puntuar(picks, signos) {
  let n = 0
  for (let i = 0; i < signos.length; i++) {
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
 * @param {number}   puntuables         cuántos partidos cuentan esta jornada.
 *   El bote se abre acertándolos TODOS. Por defecto 14, que es la jornada de
 *   siempre; con el Pleno al 15 activo son 15 y hace falta acertarlo también.
 * @returns reparto en céntimos, con los índices de los boletos ganadores
 */
export function liquidar(aciertosPorBoleto, precioCents, boteAntesCents = 0, puntuables = 14) {
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

  // Acertarlo TODO se lleva además el bote entero, incluido el aporte de esta
  // misma jornada, y el bote queda a cero. "Todo" son los partidos que
  // puntúan: 14 en una jornada normal, 15 si el pleno está activo.
  const botePagado = max === puntuables ? boteAntesCents + alBote : 0

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
