import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { GRUPOS, PRIMERA, SEGUNDA } from '../src/lib/divisiones.js'
import { idDeEquipo } from '../src/lib/equipos.js'

const escudos = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'escudos')

test('cada equipo del creador rápido tiene su escudo', () => {
  for (const g of GRUPOS) {
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
