// ===========================================================================
// Comparación de dos columnas, partido a partido.
//
// Puro y sin dependencias, como `reglas.js` y `evolucion.js`: recibe los
// signos ya resueltos y las dos columnas, y no sabe nada de React ni de dónde
// salieron los datos.
// ===========================================================================

/**
 * Cuántos partidos puntúan cuando no se dice otra cosa.
 *
 * Ya no es una constante de la que fiarse: desde 0013 cada jornada decide
 * cuáles cuentan, así que `compararColumnas` mira los signos que le pasan y
 * esto solo queda como el tamaño de la quiniela de siempre.
 */
export const PUNTUAN = 14

/**
 * Compara dos columnas contra el resultado.
 *
 * La cifra que de verdad importa es `ventaja`: en los partidos donde los dos
 * ponen lo mismo, sumen o no, nadie saca nada. Toda la diferencia de aciertos
 * entre dos personas sale de los partidos en los que discrepan, y eso es un
 * invariante que el test comprueba contra la puntuación de la base de datos:
 *
 *     ganaA - ganaB === aciertosA - aciertosB
 *
 * @param signos  [signo|null] resueltos, en orden de partido
 * @param picksA  columna de A
 * @param picksB  columna de B
 */
export function compararColumnas(signos, picksA = [], picksB = []) {
  const filas = []
  let coinciden = 0, ganaA = 0, ganaB = 0, fallanLosDos = 0, sinResolver = 0, resueltos = 0

  const n = signos.length
  for (let i = 0; i < n; i++) {
    const signo = signos[i] ?? null
    const pickA = picksA[i] ?? null
    const pickB = picksB[i] ?? null
    const aciertaA = signo != null && pickA === signo
    const aciertaB = signo != null && pickB === signo

    if (signo != null) resueltos++

    if (pickA === pickB) {
      coinciden++
    } else if (signo == null) {
      // Discrepan en un partido que aún no se ha jugado: está por decidir,
      // que no es lo mismo que haber fallado los dos.
      sinResolver++
    } else if (aciertaA) {
      ganaA++
    } else if (aciertaB) {
      ganaB++
    } else {
      fallanLosDos++
    }

    filas.push({ i, signo, pickA, pickB, coinciden: pickA === pickB, aciertaA, aciertaB })
  }

  return {
    filas,
    coinciden,
    discrepan: n - coinciden,
    puntuables: n,
    ganaA,
    ganaB,
    fallanLosDos,
    sinResolver,
    ventaja: ganaA - ganaB,
    resueltos,
  }
}
