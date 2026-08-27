// ===========================================================================
// De nombre de equipo a id de LAE.
//
// Los escudos viven en public/escudos/{lae_id}.png y lo normal es que el
// partido ya traiga su `lae_id_local`, porque lo pone la ingesta. Pero hay dos
// casos en los que no:
//
//   · las jornadas que el admin rellena a mano —que son necesarias, porque LAE
//     no publica la alineación de la jornada abierta (ver docs/lae.md)—;
//   · el modo demo, que no tiene ids de verdad.
//
// Para esos, se resuelve por nombre. LAE no escribe siempre igual el mismo
// club ("At. Madrid" un año, "Atlético" otro), así que el nombre se normaliza
// y hay una lista de variantes conocidas. El id numérico, en cambio, no
// cambia: por eso sigue siendo él quien nombra el archivo.
// ===========================================================================

import { clave } from './texto.js'

/**
 * Quita acentos, puntuación y mayúsculas para que "Alavés", "ALAVES" y
 * "alaves" sean la misma clave.
 *
 * Y quita el sufijo de categoría que LAE pone desde agosto de 2026
 * ("Sevilla (m)"). La ingesta ya lo limpia al entrar
 * (`limpiarNombreEquipo`), pero esto es la red de debajo: las jornadas que se
 * sincronizaran entre el cambio de LAE y este arreglo tienen el sufijo
 * GUARDADO en la base, y así se les resuelve el escudo igual, sin tener que
 * tocar los datos.
 *
 * Aquí se quita cualquier paréntesis final —también un "(f)"— porque un
 * equipo femenino y uno masculino son el mismo club y llevan el mismo escudo.
 * La ingesta es más conservadora y respeta el "(f)", que ahí sí distingue dos
 * partidos distintos en la lista.
 *
 * Aguanta `null`, que es justo lo que traen los partidos de una jornada recién
 * creada: nacen con los equipos sin rellenar.
 */
export const normalizarNombre = (nombre) =>
  clave(String(nombre ?? '').replace(/\s*\([^)]*\)\s*$/, ''))

// Nombre canónico -> id de LAE. Los ids salen de las respuestas reales de LAE
// guardadas en tests/fixtures/, no de ninguna lista de fuera: son los que la
// propia quiniela usa y no cambian aunque LAE reescriba el nombre.
const CANONICOS = {
  'athletic club': 1,
  'osasuna': 2,
  'atletico de madrid': 3,
  'barcelona': 4,
  'getafe': 5,
  'levante': 6,
  'deportivo': 7,
  'espanyol': 9,
  'mallorca': 10,
  'betis': 11,
  'real madrid': 12,
  'sevilla': 17,
  'almeria': 18,
  'valencia': 19,
  'villarreal': 20,
  'celta': 111,
  'malaga': 113,
  'real sociedad': 125,
  'castellon': 130,
  'elche': 131,
  'rayo vallecano': 156,
  'girona': 166,
  'huesca': 200,
  'alaves': 374,
  'granada': 564,
  'ceuta': 836,
  'burgos': 939,
  'real oviedo': 1000,
  'real zaragoza': 3017,
  'racing santander': 3960,

  // Segunda 2026-2027, con los ids leídos de la jornada 2 (fixture
  // lae-sorteo-1320306047.json). Sin estos, media quiniela salía con el
  // redondel de iniciales en vez del escudo.
  'sporting': 107,
  'tenerife': 108,
  'cadiz': 110,
  'eibar': 124,
  'las palmas': 126,
  'sabadell': 907,
  'leganes': 1151,
  'eldense': 3855,
  'real valladolid': 4432,
}

// Cómo escribe LAE cada uno, y las formas en las que un admin con prisa lo
// teclearía. Añadir aquí es barato; equivocarse de id no, así que cada entrada
// apunta a un canónico que ya existe arriba.
const VARIANTES = {
  'athletic': 'athletic club',
  'athletic bilbao': 'athletic club',
  'at madrid': 'atletico de madrid',
  'atletico': 'atletico de madrid',
  'atletico madrid': 'atletico de madrid',
  'fc barcelona': 'barcelona',
  'barca': 'barcelona',
  'real betis': 'betis',
  'r betis': 'betis',
  'r madrid': 'real madrid',
  'r sociedad': 'real sociedad',
  'la real': 'real sociedad',
  'r oviedo': 'real oviedo',
  'oviedo': 'real oviedo',
  'r zaragoza': 'real zaragoza',
  'zaragoza': 'real zaragoza',
  'racing': 'racing santander',
  'racing de santander': 'racing santander',
  'celta de vigo': 'celta',
  'rc celta': 'celta',
  'deportivo de la coruna': 'deportivo',
  'dep la coruna': 'deportivo',
  'depor': 'deportivo',
  'rayo': 'rayo vallecano',
  'ud almeria': 'almeria',
  'cd castellon': 'castellon',
  'sd huesca': 'huesca',
  'granada cf': 'granada',
  'malaga cf': 'malaga',
  'burgos cf': 'burgos',
  'ad ceuta': 'ceuta',
  'ceuta fc': 'ceuta',
  'ad ceuta fc': 'ceuta',
  'rcd espanyol': 'espanyol',
  'rcd mallorca': 'mallorca',
  'levante ud': 'levante',
  'ud levante': 'levante',
  'deportivo alaves': 'alaves',
  'ca osasuna': 'osasuna',
  'sevilla fc': 'sevilla',
  'valencia cf': 'valencia',
  'villarreal cf': 'villarreal',
  'getafe cf': 'getafe',
  'elche cf': 'elche',
  'girona fc': 'girona',
  'sporting de gijon': 'sporting',
  'real sporting': 'sporting',
  'sporting gijon': 'sporting',
  'cd tenerife': 'tenerife',
  'cadiz cf': 'cadiz',
  'sd eibar': 'eibar',
  'ud las palmas': 'las palmas',
  'ce sabadell': 'sabadell',
  'cd leganes': 'leganes',
  'cd eldense': 'eldense',
  'valladolid': 'real valladolid',
  'r valladolid': 'real valladolid',
}

/**
 * El id de LAE de un equipo por su nombre, o `null` si no se reconoce.
 *
 * Devolver `null` es una respuesta válida y frecuente: cada temporada suben
 * equipos que no están en esta lista. Quien pinta el escudo ya sabe caer en el
 * avatar con las iniciales, así que un equipo desconocido no rompe nada.
 */
export function idDeEquipo(nombre) {
  const clave = normalizarNombre(nombre)
  if (!clave) return null
  return CANONICOS[clave] ?? CANONICOS[VARIANTES[clave]] ?? null
}

/** Para el test: que ninguna variante apunte a un canónico inexistente. */
export const _tablas = { CANONICOS, VARIANTES }
