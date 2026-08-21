import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { idDeEquipo, normalizarNombre, _tablas } from '../src/lib/equipos.js'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')

// Un escudo equivocado es peor que ningún escudo: nadie mira el nombre si ve
// el emblema. Estos tests van a por ese fallo, no a por que falte alguno.

test('los nombres que escribe LAE se reconocen todos', async () => {
  // El fixture es una respuesta real de LAE, así que es la lista de cómo
  // escribe los equipos de verdad. Si cambia el formato, esto se entera.
  const fixture = JSON.parse(
    await readFile(join(raiz, 'tests', 'fixtures', 'lae-sorteo-1308406028.json'), 'utf8')
  )

  const sinReconocer = []
  for (const p of fixture.partidos) {
    if (idDeEquipo(p.local) !== p.idLocal) sinReconocer.push([p.local, p.idLocal, idDeEquipo(p.local)])
    if (idDeEquipo(p.visitante) !== p.idVisitante) {
      sinReconocer.push([p.visitante, p.idVisitante, idDeEquipo(p.visitante)])
    }
  }

  assert.deepEqual(sinReconocer, [],
    'el nombre resuelve a un id distinto del que da LAE (esperado, obtenido)')
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
  // Cada temporada sube alguien que no está en la lista: tiene que caer en el
  // avatar de iniciales, nunca en el escudo de otro.
  for (const nombre of ['Cultural Leonesa', 'Eldense', '', null, undefined, '   ']) {
    assert.equal(idDeEquipo(nombre), null, `"${nombre}" debería no reconocerse`)
  }
})

test('normalizar no confunde equipos distintos', () => {
  // Los dos Racing, los dos Deportivos, y Madrid contra Madrid.
  assert.notEqual(normalizarNombre('Real Madrid'), normalizarNombre('At. Madrid'))
  assert.notEqual(idDeEquipo('Real Sociedad'), idDeEquipo('Real Madrid'))
  assert.notEqual(idDeEquipo('Deportivo'), idDeEquipo('Deportivo Alavés'))
})
