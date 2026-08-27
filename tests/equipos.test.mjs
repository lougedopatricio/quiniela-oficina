import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { idDeEquipo, normalizarNombre, _tablas } from '../src/lib/equipos.js'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')

// Un escudo equivocado es peor que ningún escudo: nadie mira el nombre si ve
// el emblema. Estos tests van a por ese fallo, no a por que falte alguno.

test('los nombres que escribe LAE se reconocen, con sufijo y sin él', async () => {
  // Los fixtures son respuestas reales, así que son la lista de cómo escribe
  // LAE los equipos de verdad. El de agosto trae el sufijo " (m)" que LAE
  // añadió: con él pegado, ANTES no se resolvía ni un solo escudo.
  //
  // Se prueban los nombres tal cual llegan, sin pasarlos por la limpieza de
  // la ingesta, porque en la base hay jornadas guardadas con el sufijo dentro
  // y a esas también hay que sacarles el escudo.
  const sinReconocer = []
  for (const nombre of ['lae-sorteo-1308406028.json', 'lae-sorteo-1320306047.json']) {
    const fixture = JSON.parse(await readFile(join(raiz, 'tests', 'fixtures', nombre), 'utf8'))
    for (const p of fixture.partidos) {
      // Equipos que todavía no están en la tabla (los que suben cada año, o
      // los extranjeros de las quinielas de verano) devuelven null a
      // propósito y caen en el avatar de iniciales. Lo que no puede pasar es
      // resolver a un id EQUIVOCADO.
      for (const [quien, id] of [[p.local, p.idLocal], [p.visitante, p.idVisitante]]) {
        const obtenido = idDeEquipo(quien)
        if (obtenido !== null && obtenido !== id) sinReconocer.push([nombre, quien, id, obtenido])
      }
    }
  }

  assert.deepEqual(sinReconocer, [],
    'un nombre resuelve a un id distinto del que da LAE (fixture, nombre, esperado, obtenido)')
})

test('el sufijo de categoría no impide reconocer al equipo', () => {
  // Este es el fallo concreto: en agosto de 2026 LAE empezó a mandar
  // "Athletic Club (m)" y dejaron de salir todos los escudos.
  assert.equal(idDeEquipo('Athletic Club (m)'), 1)
  assert.equal(idDeEquipo('Sevilla (m)'), 17)
  assert.equal(idDeEquipo('At. Madrid (m)'), 3)
  assert.equal(idDeEquipo('Racing De Santander (m)'), 3960, 'LAE lo escribe de las dos formas')
  assert.equal(idDeEquipo('Racing Santander (m)'), 3960)
  // Un femenino es el mismo club y lleva el mismo escudo.
  assert.equal(idDeEquipo('Barcelona (f)'), 4)
})

test('ninguna variante apunta a un equipo que no existe', () => {
  const { CANONICOS, VARIANTES } = _tablas
  for (const [variante, canonico] of Object.entries(VARIANTES)) {
    assert.ok(canonico in CANONICOS, `"${variante}" apunta a "${canonico}", que no está`)
  }
})

test('no hay dos equipos compartiendo id', () => {
  const { CANONICOS } = _tablas
  const vistos = new Map()
  for (const [nombre, id] of Object.entries(CANONICOS)) {
    assert.equal(vistos.has(id), false, `${nombre} y ${vistos.get(id)} tienen el mismo id ${id}`)
    vistos.set(id, nombre)
  }
})

test('cada equipo reconocido tiene su escudo en public/escudos', async () => {
  const archivos = new Set(
    (await readdir(join(raiz, 'public', 'escudos')))
      .filter(f => f.endsWith('.png'))
      .map(f => Number(f.replace('.png', '')))
  )
  const sinEscudo = Object.entries(_tablas.CANONICOS)
    .filter(([, id]) => !archivos.has(id))
    .map(([nombre]) => nombre)

  assert.deepEqual(sinEscudo, [], 'equipos en la tabla que se quedarían sin imagen')
})

test('da igual cómo se escriba: acentos, puntos y mayúsculas', () => {
  for (const forma of ['Alavés', 'ALAVES', 'alaves', 'Alaves', ' alavés ']) {
    assert.equal(idDeEquipo(forma), 374, `no reconoce "${forma}"`)
  }
  for (const forma of ['At. Madrid', 'Atlético de Madrid', 'Atletico', 'AT MADRID']) {
    assert.equal(idDeEquipo(forma), 3, `no reconoce "${forma}"`)
  }
  for (const forma of ['R. Oviedo', 'Real Oviedo', 'Oviedo']) {
    assert.equal(idDeEquipo(forma), 1000, `no reconoce "${forma}"`)
  }
})

test('un equipo desconocido devuelve null y no un id cualquiera', () => {
  // Cada temporada sube alguien que no está en la lista, y las quinielas de
  // verano traen equipos nórdicos: tienen que caer en el avatar de iniciales,
  // nunca en el escudo de otro.
  // Se usan los nórdicos a propósito: los españoles se van añadiendo según
  // suben, y este test ya se rompió dos veces por usar de ejemplo un equipo
  // que después entró en la tabla.
  for (const nombre of ['Rosenborg', 'Brommapojkarna', 'Djurgardens', '', null, undefined, '   ']) {
    assert.equal(idDeEquipo(nombre), null, `"${nombre}" debería no reconocerse`)
  }
})

test('normalizar no confunde equipos distintos', () => {
  // Los dos Racing, los dos Deportivos, y Madrid contra Madrid.
  assert.notEqual(normalizarNombre('Real Madrid'), normalizarNombre('At. Madrid'))
  assert.notEqual(idDeEquipo('Real Sociedad'), idDeEquipo('Real Madrid'))
  assert.notEqual(idDeEquipo('Deportivo'), idDeEquipo('Deportivo Alavés'))
})
