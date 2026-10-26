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

export const TEMPORADA = '2026-27'

export const PRIMERA = [
  'Alavés', 'Athletic Club', 'Atlético de Madrid', 'Barcelona', 'Betis',
  'Celta', 'Deportivo', 'Elche', 'Espanyol', 'Getafe',
  'Mallorca', 'Osasuna', 'Racing Santander', 'Rayo Vallecano', 'Real Madrid',
  'Real Oviedo', 'Real Sociedad', 'Sevilla', 'Valencia', 'Villarreal',
]

export const SEGUNDA = [
  'Albacete', 'Almería', 'Andorra', 'Burgos', 'Cádiz', 'Castellón',
  'Ceuta', 'Córdoba', 'Cultural Leonesa', 'Eibar', 'Girona', 'Granada',
  'Huesca', 'Las Palmas', 'Leganés', 'Levante', 'Málaga', 'Mirandés',
  'Real Sociedad B', 'Real Zaragoza', 'Sporting', 'Tenerife',
]

// Cómo se escribe bonito cada club de la tabla de escudos que no esté ya en
// las dos listas de arriba.
const BONITOS = {
  'eldense': 'Eldense', 'sabadell': 'Sabadell', 'real valladolid': 'Real Valladolid',
  'racing de ferrol': 'Racing de Ferrol', 'celta fortuna': 'Celta Fortuna',
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
  { id: 'otros', txt: 'Otros', equipos: OTROS },
]
