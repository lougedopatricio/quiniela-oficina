// ===========================================================================
// Normalización de texto para comparar nombres.
//
// Existía dos veces —una en excel.js para casar personas y otra en equipos.js
// para casar equipos— y las dos repetían el mismo truco de descomponer en NFD
// y borrar las marcas diacríticas sueltas. Es un detalle fácil de escribir mal
// y que falla en silencio: si el rango se rompe, "Lucía" deja de casar con
// "Lucia" y nadie se entera hasta que un boleto no se importa.
//
// Los dos niveles se quedan separados a propósito, porque no comparan lo
// mismo: los nombres de persona los escribe quien rellena el Excel y conviene
// tocarlos lo justo; los de equipo llegan de LAE con abreviaturas y puntos.
// ===========================================================================

// El rango de marcas diacríticas que NFD deja sueltas al descomponer.
const DIACRITICOS = /[̀-ͯ]/g

/**
 * Sin acentos, en minúsculas y sin espacios de sobra.
 *
 * `null` y `undefined` dan cadena vacía —no la palabra "null"—, y un número
 * se convierte: en un Excel, la celda del nombre puede llegar como número si
 * alguien se llama "2" o si la hoja trae una columna de índice.
 */
export function sinAcentos(s) {
  if (s == null) return ''
  return String(s).normalize('NFD').replace(DIACRITICOS, '').trim().toLowerCase()
}

/**
 * Además de lo anterior, quita la puntuación y junta los espacios, para que
 * "At. Madrid", "At Madrid" y "AT.  MADRID" sean la misma clave.
 */
export function clave(s) {
  return sinAcentos(s)
    .replace(/[.\-_'’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
