// ===========================================================================
// Los equipos que ofrece el creador rápido de quinielas, por división.
//
// SE REVISA CADA VERANO: es lo único de la app que cambia con los ascensos y
// descensos. Los nombres tienen que casar con src/lib/equipos.js —que es de
// donde sale el escudo—; un test lo comprueba.
//
// Estar en una lista u otra solo decide en qué pestaña aparece el equipo: en
// el creador se puede elegir cualquiera, y escribir uno que no esté.
// ===========================================================================

import { _tablas, idDeEquipo } from './equipos.js'
import { SELECCIONES } from './selecciones.js'

export const TEMPORADA = '2026-27'

// Comprobado el 2026-10-26: ascendieron Racing (campeón), Deportivo y Málaga
// (play-off, ante el Almería); bajaron Mallorca, Girona y Real Oviedo. A
// Segunda subieron Tenerife, Eldense, Sabadell y Celta Fortuna, y bajaron
// Mirandés, Huesca, Cultural Leonesa y Real Zaragoza.
export const PRIMERA = [
  'Alavés', 'Athletic Club', 'Atlético de Madrid', 'Barcelona', 'Betis',
  'Celta', 'Deportivo', 'Elche', 'Espanyol', 'Getafe',
  'Levante', 'Málaga', 'Osasuna', 'Racing Santander', 'Rayo Vallecano',
  'Real Madrid', 'Real Sociedad', 'Sevilla', 'Valencia', 'Villarreal',
]

export const SEGUNDA = [
  'Albacete', 'Almería', 'Andorra', 'Burgos', 'Cádiz', 'Castellón',
  'Celta Fortuna', 'Ceuta', 'Córdoba', 'Eibar', 'Eldense', 'Girona',
  'Granada', 'Las Palmas', 'Leganés', 'Mallorca', 'Real Oviedo', 'Real Sociedad B',
  'Real Valladolid', 'Sabadell', 'Sporting', 'Tenerife',
]

// Cómo se escribe bonito cada club de la tabla de escudos que no esté ya en
// las dos listas de arriba.
const BONITOS = {
  'huesca': 'Huesca', 'real zaragoza': 'Real Zaragoza', 'mirandes': 'Mirandés',
  'cultural leonesa': 'Cultural Leonesa', 'racing de ferrol': 'Racing de Ferrol',
}

/** Todos los equipos con escudo que no están ni en Primera ni en Segunda. */
export const OTROS = (() => {
  const usados = new Set([...PRIMERA, ...SEGUNDA].map(idDeEquipo))
  return Object.entries(_tablas.CANONICOS)
    .filter(([clave, id]) => !usados.has(id) && BONITOS[clave])
    .map(([clave]) => BONITOS[clave])
})()

export const GRUPOS = [
  { id: 'primera', txt: 'Primera', equipos: PRIMERA },
  { id: 'segunda', txt: 'Segunda', equipos: SEGUNDA },
  { id: 'selecciones', txt: 'Selecciones', equipos: SELECCIONES },
  { id: 'otros', txt: 'Otros', equipos: OTROS },
]
