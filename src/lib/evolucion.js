// ===========================================================================
// Acumulado de aciertos jornada a jornada.
//
// Puro y sin dependencias, como `reglas.js`: `api.js` se encarga de traer los
// datos —de Supabase o del modo demo— y esto solo los suma. Así se puede
// probar sin base de datos ni navegador.
// ===========================================================================

/**
 * Suma los aciertos de cada participante a lo largo de las jornadas.
 *
 * Dos comportamientos deliberados, los dos con test:
 *
 * - **Quien no juega una jornada no suma**: su línea se queda plana ese tramo.
 *   Es lo que le pasa en la general, así que interpolar mentiría.
 * - **Quien debuta tarde arrastra ceros** por las jornadas anteriores, para
 *   que todas las series tengan la misma longitud y se puedan pintar juntas.
 *
 * @param jornadas  array en el orden en que se jugaron
 * @param puntosDe  (jornada) => iterable de pares [player_id, aciertos]
 * @returns { [player_id]: number[] } alineado con `jornadas`
 */
export function acumularAciertos(jornadas, puntosDe) {
  const acumulado = {}

  jornadas.forEach((jornada, i) => {
    // Todo el mundo arrastra su total de la jornada anterior...
    for (const serie of Object.values(acumulado)) {
      serie[i] = serie[i - 1] ?? 0
    }
    // ...y solo quien jugó le suma lo suyo.
    for (const [playerId, aciertos] of puntosDe(jornada) ?? []) {
      acumulado[playerId] ??= Array(i).fill(0)
      acumulado[playerId][i] = (acumulado[playerId][i - 1] ?? 0) + aciertos
    }
  })

  return acumulado
}
