import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nuevaBase, sembrarTemporada, crearJornada, apostar, columnaCon, recalcular, bote } from './helpers.mjs'
import { liquidar } from '../src/lib/reglas.js'

// El reparto está implementado dos veces: en PL/pgSQL (la autoridad) y en JS
// (para la previsualización del importador y el modo demo). Dos implementaciones
// de la misma regla se separan tarde o temprano; este test las ata.

const TODO_UNOS = Array(14).fill('1')
const PRECIOS = [100, 150, 200, 333]

const ESCENARIOS = [
  { nombre: 'ganador único',            aciertos: [12, 10, 8] },
  { nombre: 'empate a dos',             aciertos: [11, 11, 7] },
  { nombre: 'empate a tres con resto',  aciertos: [11, 11, 11, 9, 5] },
  { nombre: 'todos empatados',          aciertos: [9, 9, 9, 9] },
  { nombre: 'pleno de uno',             aciertos: [14, 10, 8] },
  { nombre: 'pleno compartido',         aciertos: [14, 14, 6] },
  { nombre: 'un solo jugador',          aciertos: [7] },
]

for (const esc of ESCENARIOS) {
  for (const precio of PRECIOS) {
    test(`SQL y JS reparten igual · ${esc.nombre} · ${precio}c`, async () => {
      const db = await nuevaBase()
      const alias = esc.aciertos.map((_, i) => `j${i}`)
      const { seasonId, players } = await sembrarTemporada(db, { precio, alias })

      // Jornada previa para que haya bote acumulado y el caso del pleno tenga
      // algo que reventar.
      const r0 = await crearJornada(db, seasonId, 1, TODO_UNOS)
      for (const a of alias) await apostar(db, r0, players[a], columnaCon(TODO_UNOS, 6))
      await recalcular(db, r0)
      const boteAntes = await bote(db, seasonId)

      const r1 = await crearJornada(db, seasonId, 2, TODO_UNOS)
      for (const [i, a] of alias.entries()) {
        await apostar(db, r1, players[a], columnaCon(TODO_UNOS, esc.aciertos[i]))
      }
      const sql = await recalcular(db, r1)
      const js = liquidar(esc.aciertos, precio, boteAntes)

      assert.equal(sql.recaudacion_cents, js.recaudacion, 'recaudación')
      assert.equal(sql.premio_cents,      js.premio,      'premio')
      assert.equal(sql.al_bote_cents,     js.alBote,      'aporte al bote')
      assert.equal(sql.bote_pagado_cents, js.botePagado,  'bote pagado')
      assert.equal(sql.max_aciertos,      js.max,         'máximo de aciertos')
      assert.equal(sql.ganadores,         js.ganadores.length, 'número de ganadores')

      const { rows } = await db.query(
        `select importe_cents::int as c from ledger where round_id = $1 and tipo = 'premio' order by importe_cents desc`,
        [r1]
      )
      assert.deepEqual(
        rows.map(x => x.c),
        [...js.reparto].sort((a, b) => b - a),
        'importes individuales del reparto'
      )

      await db.close()
    })
  }
}
