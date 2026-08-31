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

// Con el Pleno al 15 activo son QUINCE los que puntúan, y el bote solo se abre
// acertándolos todos. Sin este caso, el espejo seguía comparando las dos
// implementaciones sobre jornadas de 14 y no se habría enterado de que el SQL
// había cambiado de regla en 0013 — que es exactamente lo que pasó.
for (const [nombre, aciertos, plenoAcertado] of [
  ['pleno acertado: 15 de 15',        [14, 11, 8], true],
  ['pleno fallado: se queda en 14',   [14, 11, 8], false],
  ['nadie cerca del pleno',           [9, 7, 5],   false],
]) {
  test(`SQL y JS reparten igual con pleno · ${nombre}`, async () => {
    const db = await nuevaBase()
    const alias = aciertos.map((_, i) => `j${i}`)
    const { seasonId, players } = await sembrarTemporada(db, { precio: 200, alias })

    // Jornada previa para que haya bote que reventar.
    const r0 = await crearJornada(db, seasonId, 1, TODO_UNOS)
    for (const a of alias) await apostar(db, r0, players[a], columnaCon(TODO_UNOS, 6))
    await recalcular(db, r0)
    const boteAntes = await bote(db, seasonId)

    const r1 = await crearJornada(db, seasonId, 2, TODO_UNOS, { pleno: true })
    await db.query(
      `update matches set goles_local = 2, goles_visitante = 1 where round_id = $1 and orden = 15`, [r1]
    )

    for (const [i, a] of alias.entries()) {
      // Solo el primero puede llegar al pleno, y solo si toca acertarlo.
      const acierta = plenoAcertado && i === 0
      await db.query(
        `insert into bets (round_id, player_id, picks, pleno_local, pleno_visitante, estado, origen)
         values ($1, $2, $3, $4, $5, 'confirmada', 'admin')`,
        [r1, players[a], columnaCon(TODO_UNOS, aciertos[i]), acierta ? '2' : '0', acierta ? '1' : '0']
      )
    }

    const sql = await recalcular(db, r1)
    // Al JS hay que decirle cuántos puntúan y sumarle el pleno a quien lo
    // acertó: es la misma cuenta que hace acierta() en la base.
    const js = liquidar(
      aciertos.map((n, i) => n + (plenoAcertado && i === 0 ? 1 : 0)),
      200, boteAntes, 15
    )

    assert.equal(sql.puntuables,        15,               'la jornada puntúa sobre 15')
    assert.equal(sql.max_aciertos,      js.max,           'máximo de aciertos')
    assert.equal(sql.bote_pagado_cents, js.botePagado,    'bote pagado')
    assert.equal(sql.premio_cents,      js.premio,        'premio')
    assert.equal(sql.ganadores,         js.ganadores.length, 'número de ganadores')

    await db.close()
  })
}
