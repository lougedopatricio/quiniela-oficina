// ===========================================================================
// En qué puesto quedó alguien en una jornada.
//
// No es una regla de reparto —el SQL no calcula puestos, solo quién cobra—,
// así que esto no vive en reglas.js: es cómo se cuenta la jornada, no cómo se
// paga.
// ===========================================================================

/**
 * Puesto de alguien dentro de una jornada, contando empates como manda una
 * clasificación deportiva: los empatados comparten el mejor puesto y el
 * siguiente distinto salta los que se han ocupado.
 *
 *     13, 11, 11, 9   ->   1º, 2º, 2º, 4º
 *
 * Antes se hacía ordenando y cogiendo la posición en la lista, que a dos
 * empatados les daba 2º y 3º según quién saliera antes en el `sort` —es decir,
 * según el orden en que la base devolviera las filas.
 */
export function puestoEn(aciertos, todos) {
  return 1 + todos.filter(a => a > aciertos).length
}
