import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { GRUPOS, PRIMERA, SEGUNDA } from '../src/lib/divisiones.js'
import { idDeEquipo } from '../src/lib/equipos.js'
import { banderaDe, SELECCIONES } from '../src/lib/selecciones.js'

const escudos = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'escudos')

test('cada equipo del creador rápido tiene su escudo', () => {
  for (const g of GRUPOS.filter(x => x.id !== 'selecciones')) {
    for (const n of g.equipos) {
      const id = idDeEquipo(n)
      assert.ok(id, `${n} (${g.txt}) no casa con ningún equipo de equipos.js`)
      assert.ok(existsSync(join(escudos, `${id}.png`)), `${n} no tiene public/escudos/${id}.png`)
    }
  }
})

test('Primera tiene 20 equipos, Segunda 22, y ninguno está en las dos', () => {
  assert.equal(PRIMERA.length, 20)
  assert.equal(SEGUNDA.length, 22)
  const ids = [...PRIMERA, ...SEGUNDA].map(idDeEquipo)
  assert.equal(new Set(ids).size, ids.length)
})

test('las selecciones que se piden están, cada una con su bandera', () => {
  for (const n of ['España', 'Turquía', 'Italia', 'Bélgica', 'Francia', 'República Checa', 'Croacia', 'Inglaterra']) {
    assert.ok(SELECCIONES.includes(n), `falta ${n}`)
  }
  for (const n of SELECCIONES) assert.match(banderaDe(n), /^<(rect|polygon|circle)/, `${n} sin bandera`)
  assert.ok(GRUPOS.some(g => g.id === 'selecciones'))
})

test('las selecciones se reconocen como se escriben en LAE y TuLotero', () => {
  for (const [escrito, igual] of [['Rep. Checa', 'República Checa'], ['ESPAÑA (F)', 'España'], ['Turkiye', 'Turquía'], ['Holanda', 'Países Bajos']]) {
    assert.equal(banderaDe(escrito), banderaDe(igual), escrito)
  }
  assert.equal(banderaDe('Real Madrid'), null, 'un club no es una selección')
})
